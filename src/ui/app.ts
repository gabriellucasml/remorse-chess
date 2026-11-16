import type { Agent } from '../agents/agent';
import {
  createGame,
  guiltBlockedSquares,
  inCheck,
  legalMoves,
  opposite,
  pieceById,
  play,
  resign,
  squareName,
  squareOf,
  type Color,
  type GameEvent,
  type GameResult,
  type GameState,
  type Move,
  type PieceType,
} from '../engine';
import { pieceMarkup } from './pieces';

export interface AppOptions {
  /** `null` keeps that color with the person at the board. */
  agents?: Partial<Record<Color, Agent | null>>;
}

const NOUN: Record<PieceType, string> = {
  k: 'rei',
  q: 'dama',
  r: 'torre',
  b: 'bispo',
  n: 'cavalo',
  p: 'peão',
};

interface Pending {
  from: number;
  to: number;
  options: Move[];
  chosen: Set<number>;
}

export function startApp(root: HTMLElement, options: AppOptions = {}): void {
  const agents: Record<Color, Agent | null> = {
    w: options.agents?.w ?? null,
    b: options.agents?.b ?? null,
  };

  let game = createGame();
  const past: GameState[] = [];
  let orientation: Color = 'w';
  let selected: number | null = null;
  let pending: Pending | null = null;
  let hint = '';
  let busy = false;
  let request = 0;

  root.innerHTML = `
    <main class="page">
      <header class="masthead">
        <p class="eyebrow">Variante</p>
        <h1>Remorse Chess</h1>
        <p class="lede">Capturar deixa culpa. A peça segue andando, mas já não mata — e só um bispo consegue absolver.</p>
      </header>
      <div class="layout">
        <section class="stage">
          <div class="frame">
            <div class="board" id="board"></div>
          </div>
          <ul class="legend">
            <li><i class="swatch guilt"></i>Culpa — não captura</li>
            <li><i class="swatch pause"></i>Penitência — não se move neste lance</li>
            <li><i class="swatch last"></i>Último lance</li>
          </ul>
          <p class="narration" id="narration" aria-live="polite"></p>
          <p class="hint" id="hint"></p>
        </section>
        <aside class="side">
          <section class="turn" id="turn"></section>
          <section class="panel" id="absolution" hidden></section>
          <section class="roster" id="roster"></section>
          <section class="log-wrap">
            <h2>Partida</h2>
            <ol class="score" id="log"></ol>
          </section>
          <section class="actions">
            <button class="act" id="undo" type="button">Desfazer</button>
            <button class="act" id="flip" type="button">Girar</button>
            <button class="act" id="resign" type="button">Desistir</button>
            <button class="act primary" id="reset" type="button">Nova partida</button>
          </section>
          <details class="rules">
            <summary>Regras</summary>
            <ul>
              <li><strong>Culpa.</strong> Quem captura fica culpado na hora. A peça anda, mas não captura, não dá xeque e não protege. A mancha já vale na posição resultante: Dxf7 não ameaça o rei.</li>
              <li><strong>Absolvição.</strong> Termine um lance de bispo numa das oito casas ao redor da peça culpada e escolha absolvê-la. O bispo e a peça ficam em penitência e não se movem no seu próximo lance. Ainda podem ser capturados. Absolver é uma escolha — a penitência é o preço.</li>
              <li><strong>Repouso.</strong> O bispo culpado se absolve sozinho se você gastar o lance com outra peça. No lance em que ele mesmo capturou, a culpa fica. Bispo não entra no rito: o repouso já o limpa, sem penitência.</li>
              <li><strong>Promoção.</strong> O peão vira bispo, nunca dama. Sem bispos no tabuleiro, promover é o único modo de voltar a absolver. O bispo novo só absolve a partir do lance seguinte.</li>
              <li><strong>O resto é xadrez.</strong> Roque, en passant e xeque seguem valendo. Peão culpado não toma en passant. A partida acaba em xeque-mate, afogamento, 50 lances sem captura nem peão, tripla repetição, material insuficiente ou desistência.</li>
            </ul>
          </details>
        </aside>
      </div>
    </main>
  `;

  const boardEl = must(root, '#board');
  const turnEl = must(root, '#turn');
  const absolutionEl = must(root, '#absolution');
  const rosterEl = must(root, '#roster');
  const logEl = must(root, '#log');
  const narrationEl = must(root, '#narration');
  const hintEl = must(root, '#hint');
  const undoBtn = mustButton(root, '#undo');
  const flipBtn = mustButton(root, '#flip');
  const resignBtn = mustButton(root, '#resign');
  const resetBtn = mustButton(root, '#reset');

  undoBtn.addEventListener('click', undo);
  flipBtn.addEventListener('click', () => {
    orientation = opposite(orientation);
    render();
  });
  resignBtn.addEventListener('click', () => {
    if (busy || game.result.kind !== 'playing') return;
    if (agents[game.turn]) return;
    past.push(game);
    game = resign(game, game.turn);
    clearSelection();
    render();
  });
  resetBtn.addEventListener('click', () => {
    request += 1;
    busy = false;
    game = createGame();
    past.length = 0;
    orientation = 'w';
    hint = '';
    clearSelection();
    render();
    void agentTurn();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    hint = '';
    clearSelection();
    render();
  });

  render();
  void agentTurn();

  function render(): void {
    const moves = legalMoves(game);
    const ended = game.result.kind !== 'playing';
    const human = !agents[game.turn] && !ended && !busy;
    drawBoard(moves, human);
    drawTurn();
    drawAbsolution();
    drawRoster();
    drawLog();
    const last = game.history.at(-1);
    narrationEl.textContent = last
      ? `${last.san}. ${prose(last.events, game)}`
      : 'As brancas começam. Nenhuma peça está culpada.';
    hintEl.textContent = hint;
    undoBtn.disabled = past.length === 0 || busy;
    resignBtn.disabled = ended || busy || Boolean(agents[game.turn]);
  }

  function drawBoard(moves: readonly Move[], human: boolean): void {
    boardEl.replaceChildren();
    const files = orientation === 'w' ? [0, 1, 2, 3, 4, 5, 6, 7] : [7, 6, 5, 4, 3, 2, 1, 0];
    const ranks = orientation === 'w' ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];
    const selectedMoves = selected === null ? [] : moves.filter((move) => move.from === selected);
    const destinations = new Set(selectedMoves.map((move) => move.to));
    const rites = new Set(
      selectedMoves.filter((move) => move.absolve.length > 0).map((move) => move.to),
    );
    const blocked = new Set(
      selected === null || !human ? [] : guiltBlockedSquares(game, selected),
    );
    const leftFile = files[0];
    const bottomRank = ranks[ranks.length - 1];

    for (const rank of ranks) {
      for (const file of files) {
        const sq = rank * 8 + file;
        const piece = game.board[sq];
        const button = document.createElement('button');
        button.type = 'button';
        const light = (file + rank) % 2 === 1;
        const classes = ['sq', light ? 'light' : 'dark'];
        if (game.lastMove && (game.lastMove.from === sq || game.lastMove.to === sq)) classes.push('last');
        if (piece?.type === 'k' && inCheck(game, piece.color) && game.result.kind !== 'checkmate') {
          classes.push('check');
        }
        if (game.result.kind === 'checkmate' && piece?.type === 'k' && piece.color === game.turn) {
          classes.push('check');
        }
        if (selected === sq) classes.push('selected');
        if (piece?.guilt) classes.push('guilty');
        const phase = penancePhase(piece, game.ply);
        if (phase === 'now') classes.push('penance-now');
        if (phase === 'next') classes.push('penance-next');
        if (human && destinations.has(sq)) classes.push(rites.has(sq) ? 'rite' : piece ? 'capture' : 'quiet');
        if (human && blocked.has(sq)) classes.push('denied');
        if (pending && (pending.from === sq || pending.to === sq || pending.chosen.has(piece?.id ?? -1))) {
          classes.push('selected');
        }
        button.className = classes.join(' ');
        button.dataset.square = squareName(sq);
        button.setAttribute('aria-label', labelSquare(sq, piece, destinations.has(sq)));
        button.innerHTML = marks(piece, file, rank, leftFile, bottomRank, blocked.has(sq), game.ply);
        button.addEventListener('click', () => onSquare(sq));
        boardEl.append(button);
      }
    }
  }

  function onSquare(sq: number): void {
    if (busy || game.result.kind !== 'playing' || agents[game.turn]) return;
    const piece = game.board[sq];
    const moves = selected === null ? [] : legalMoves(game).filter((move) => move.from === selected && move.to === sq);
    if (moves.length > 0) {
      const ids = [...new Set(moves.flatMap((move) => move.absolve))];
      if (ids.length === 0) {
        commit(moves[0]);
        return;
      }
      pending = { from: selected!, to: sq, options: moves, chosen: new Set(ids) };
      hint = '';
      render();
      return;
    }
    if (piece && piece.color === game.turn) {
      if (piece.penancePly === game.ply) {
        hint = 'Esta peça está em penitência e não se move neste lance.';
        selected = null;
        pending = null;
        render();
        return;
      }
      selected = selected === sq ? null : sq;
      pending = null;
      hint = piece.guilt && selected !== null
        ? 'Culpada: não captura. O × marca a casa que ela não pode tomar.'
        : '';
      render();
      return;
    }
    hint = '';
    clearSelection();
    render();
  }

  function drawTurn(): void {
    const ended = resultText(game.result);
    const check = game.result.kind === 'playing' && inCheck(game);
    turnEl.innerHTML = `
      <div>
        <p class="meta">${agents[game.turn] ? `Agente · ${escapeHtml(agents[game.turn]!.name)}` : 'Pessoa'}</p>
        <p class="who">${side(game.turn)}</p>
        ${ended ? `<p class="result">${escapeHtml(ended)}</p>` : check ? '<p class="result">Xeque.</p>' : ''}
      </div>
      <p class="meta ${busy ? 'thinking' : ''}">${busy ? 'Pensando' : `Lance ${Math.floor(game.ply / 2) + 1}`}</p>
    `;
  }

  function drawAbsolution(): void {
    if (!pending) {
      absolutionEl.hidden = true;
      absolutionEl.replaceChildren();
      return;
    }
    absolutionEl.hidden = false;
    const ids = [...new Set(pending.options.flatMap((move) => move.absolve))];
    absolutionEl.innerHTML = `
      <h2>Absolver em ${squareName(pending.to)}?</h2>
      <div class="targets">
        ${ids.map((id) => `
          <label>
            <input type="checkbox" data-id="${id}" ${pending!.chosen.has(id) ? 'checked' : ''} />
            <span>${escapeHtml(cap(named(game, id)))}</span>
          </label>
        `).join('')}
      </div>
      <p class="meta">Quem for absolvido, e o bispo, não se movem no seu próximo lance.</p>
      <div class="panel-actions">
        <button type="button" id="skip-rite">Só mover</button>
        <button type="button" class="primary" id="do-rite">Absolver</button>
      </div>
    `;
    absolutionEl.querySelectorAll<HTMLInputElement>('input[type="checkbox"]').forEach((input) => {
      input.addEventListener('change', () => {
        const id = Number(input.dataset.id);
        if (!pending) return;
        if (input.checked) pending.chosen.add(id);
        else pending.chosen.delete(id);
        const rite = mustButton(absolutionEl, '#do-rite');
        rite.disabled = pending.chosen.size === 0;
      });
    });
    mustButton(absolutionEl, '#skip-rite').addEventListener('click', () => {
      const move = pending?.options.find((option) => option.absolve.length === 0);
      if (move) commit(move);
    });
    mustButton(absolutionEl, '#do-rite').addEventListener('click', () => {
      if (!pending || pending.chosen.size === 0) return;
      const key = setKey(pending.chosen);
      const move = pending.options.find((option) => setKey(option.absolve) === key);
      if (move) commit(move);
    });
  }

  function drawRoster(): void {
    const guilty: string[] = [];
    const held: string[] = [];
    for (let sq = 0; sq < 64; sq += 1) {
      const piece = game.board[sq];
      if (!piece) continue;
      const name = `${cap(named(game, piece.id))} · ${side(piece.color)}`;
      if (piece.guilt) guilty.push(escapeHtml(name));
      const phase = penancePhase(piece, game.ply);
      if (phase) {
        const when = phase === 'now' ? 'não se move agora' : 'no próximo lance';
        held.push(escapeHtml(`${name} — ${when}`));
      }
    }
    rosterEl.innerHTML = `
      <div class="group">
        <h2>Culpadas</h2>
        ${listOrEmpty(guilty)}
      </div>
      <div class="group">
        <h2>Penitência</h2>
        ${listOrEmpty(held)}
      </div>
    `;
  }

  function drawLog(): void {
    const rows: string[] = [];
    for (let i = 0; i < game.history.length; i += 2) {
      const white = game.history[i];
      const black = game.history[i + 1];
      rows.push(
        `<li><span class="num">${i / 2 + 1}</span><span class="san">${escapeHtml(white.san)}</span><span class="san">${black ? escapeHtml(black.san) : ''}</span></li>`,
      );
    }
    logEl.innerHTML = rows.join('') || '<li>Nenhum lance.</li>';
    logEl.scrollTop = logEl.scrollHeight;
  }

  function commit(move: Move): void {
    let ok = false;
    try {
      const played = play(game, move);
      past.push(game);
      game = played.state;
      hint = '';
      ok = true;
    } catch (error) {
      hint = error instanceof Error ? error.message : 'Lance inválido.';
      request += 1;
    }
    clearSelection();
    render();
    if (ok) void agentTurn();
  }

  function undo(): void {
    if (busy || past.length === 0) return;
    request += 1;
    game = past.pop() ?? game;
    hint = '';
    clearSelection();
    render();
    void agentTurn();
  }

  function agentTurn(): void {
    const agent = agents[game.turn];
    if (!agent || game.result.kind !== 'playing') return;
    const token = ++request;
    const snapshot = game;
    busy = true;
    render();
    Promise.resolve()
      .then(() => agent.chooseMove(snapshot, legalMoves(snapshot)))
      .then((move) => {
        if (token !== request || game !== snapshot) return;
        busy = false;
        commit(move);
      })
      .catch((error: unknown) => {
        if (token !== request) return;
        busy = false;
        hint = error instanceof Error ? error.message : 'O agente falhou.';
        render();
      });
  }

  function clearSelection(): void {
    selected = null;
    pending = null;
  }
}

function penancePhase(piece: GameState['board'][number], ply: number): 'now' | 'next' | null {
  if (!piece || piece.penancePly === null || piece.penancePly < ply) return null;
  return piece.penancePly === ply ? 'now' : 'next';
}

function listOrEmpty(items: string[]): string {
  if (items.length === 0) return '<ul><li>Nenhuma.</li></ul>';
  return `<ul>${items.map((item) => `<li>${item}</li>`).join('')}</ul>`;
}

function side(color: Color): string {
  return color === 'w' ? 'Brancas' : 'Pretas';
}

function resultText(result: GameResult): string | null {
  switch (result.kind) {
    case 'playing':
      return null;
    case 'checkmate':
      return `Xeque-mate. ${side(result.winner)} vencem.`;
    case 'stalemate':
      return 'Afogamento. A partida empata.';
    case 'resign':
      return `${side(opposite(result.winner))} desistem. ${side(result.winner)} vencem.`;
    case 'draw':
      if (result.reason === 'fifty-move') return 'Cinquenta lances sem captura nem peão. Empate.';
      if (result.reason === 'repetition') return 'A mesma posição três vezes. Empate.';
      return 'Não há mate possível. Empate.';
    default:
      return null;
  }
}

function prose(events: readonly GameEvent[], state: GameState): string {
  if (events.length === 0) return 'Nenhuma culpa nova.';
  const sentences: string[] = [];
  if (events.some((event) => event.type === 'promote')) sentences.push('O peão promoveu a bispo.');
  for (const event of events) {
    if (event.type !== 'guilt') continue;
    const piece = pieceById(state, event.id);
    if (!piece) continue;
    const word = feminine(piece.type) ? 'culpada' : 'culpado';
    sentences.push(`${cap(named(state, event.id))} ficou ${word}.`);
  }
  const rites = events.filter((event) => event.type === 'absolve' && event.how === 'bishop');
  if (rites.length > 0) {
    const names = rites.map((event) => named(state, event.id));
    sentences.push(`O bispo absolveu ${joinList(names)}.`);
  }
  for (const event of events) {
    if (event.type !== 'absolve' || event.how !== 'rest') continue;
    sentences.push(`${cap(named(state, event.id))} depôs a culpa em repouso.`);
  }
  const held = events.filter((event) => event.type === 'penance');
  if (held.length > 0) {
    sentences.push(`Penitência no próximo lance: ${joinList(held.map((event) => named(state, event.id)))}.`);
  }
  return sentences.join(' ');
}

function named(state: GameState, id: number): string {
  const piece = pieceById(state, id);
  if (!piece) return 'a peça';
  const sq = squareOf(state, id);
  const place = sq === null ? '' : ` em ${squareName(sq)}`;
  return `${feminine(piece.type) ? 'a' : 'o'} ${NOUN[piece.type]}${place}`;
}

function cap(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function joinList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} e ${items[items.length - 1]}`;
}

function feminine(type: PieceType): boolean {
  return type === 'q' || type === 'r';
}

function labelSquare(
  sq: number,
  piece: GameState['board'][number],
  destination: boolean,
): string {
  const name = squareName(sq);
  if (!piece) return destination ? `Casa ${name}, lance possível` : `Casa ${name}, vazia`;
  const who = piece.color === 'w' ? 'branco' : 'preto';
  const stain = piece.guilt ? ', culpado' : '';
  const pause = piece.penancePly !== null ? ', em penitência' : '';
  const go = destination ? ', casa de destino' : '';
  return `Casa ${name}, ${NOUN[piece.type]} ${who}${stain}${pause}${go}`;
}

function marks(
  piece: GameState['board'][number],
  file: number,
  rank: number,
  leftFile: number,
  bottomRank: number,
  denied: boolean,
  ply: number,
): string {
  const bits: string[] = [];
  if (file === leftFile) bits.push(`<span class="coord rank">${rank + 1}</span>`);
  if (rank === bottomRank) bits.push(`<span class="coord file">${'abcdefgh'[file]}</span>`);
  if (piece) bits.push(pieceMarkup(piece.type, piece.color));
  if (piece?.guilt) bits.push('<i class="mark" title="Culpa">C</i>');
  if (piece && penancePhase(piece, ply)) bits.push('<i class="mark pause" title="Penitência">P</i>');
  if (denied) bits.push('<span class="cross">×</span>');
  return bits.join('');
}

function setKey(ids: readonly number[] | Set<number>): string {
  return [...ids].sort((a, b) => a - b).join('.');
}

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function must(root: ParentNode, selector: string): HTMLElement {
  const node = root.querySelector(selector);
  if (!(node instanceof HTMLElement)) throw new Error(`Elemento ausente: ${selector}`);
  return node;
}

function mustButton(root: ParentNode, selector: string): HTMLButtonElement {
  const node = root.querySelector(selector);
  if (!(node instanceof HTMLButtonElement)) throw new Error(`Botão ausente: ${selector}`);
  return node;
}
