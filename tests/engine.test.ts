import { describe, expect, it } from 'vitest';
import {
  cloneState,
  createGame,
  guiltBlockedSquares,
  inCheck,
  legalMoves,
  loadPosition,
  parseSquare,
  playUci,
  positionKey,
  resign,
  squareName,
  type GameState,
} from '../src/engine';

function at(state: GameState, sq: string) {
  return state.board[parseSquare(sq)];
}

function from(state: GameState, sq: string) {
  const origin = parseSquare(sq);
  return legalMoves(state).filter((move) => move.from === origin);
}

describe('xadrez de base', () => {
  it('abre com vinte lances e não altera o estado recebido', () => {
    const state = createGame();
    expect(legalMoves(state)).toHaveLength(20);
    expect(inCheck(state)).toBe(false);
    const key = positionKey(state);
    const played = playUci(state, 'e2', 'e4');
    expect(positionKey(state)).toBe(key);
    expect(state.history).toHaveLength(0);
    expect(played.san).toBe('e4');
    expect(at(played.state, 'e4')?.type).toBe('p');
    expect(at(played.state, 'e2')).toBeNull();
  });

  it('roque, direitos e torre', () => {
    const white = loadPosition({
      pieces: [
        { sq: 'e1', type: 'k', color: 'w' },
        { sq: 'h1', type: 'r', color: 'w' },
        { sq: 'a1', type: 'r', color: 'w' },
        { sq: 'e8', type: 'k', color: 'b' },
      ],
      castling: { wK: true, wQ: true },
    });
    const castle = playUci(white, 'e1', 'g1');
    expect(castle.san).toBe('O-O');
    expect(at(castle.state, 'g1')?.type).toBe('k');
    expect(at(castle.state, 'f1')?.type).toBe('r');
    expect(castle.state.castling).toEqual({ wK: false, wQ: false, bK: false, bQ: false });

    const queenSide = playUci(white, 'e1', 'c1');
    expect(queenSide.san).toBe('O-O-O');
    expect(at(queenSide.state, 'd1')?.type).toBe('r');
  });

  it('não roca em xeque nem através de ataque, mas ignora peça culpada', () => {
    const checked = loadPosition({
      pieces: [
        { sq: 'e1', type: 'k', color: 'w' },
        { sq: 'h1', type: 'r', color: 'w' },
        { sq: 'e8', type: 'r', color: 'b' },
        { sq: 'a8', type: 'k', color: 'b' },
      ],
      castling: { wK: true },
    });
    expect(inCheck(checked)).toBe(true);
    expect(legalMoves(checked).some((move) => squareName(move.from) === 'e1' && squareName(move.to) === 'g1')).toBe(false);

    const watched = loadPosition({
      pieces: [
        { sq: 'e1', type: 'k', color: 'w' },
        { sq: 'h1', type: 'r', color: 'w' },
        { sq: 'a7', type: 'b', color: 'b' },
        { sq: 'c8', type: 'k', color: 'b' },
      ],
      castling: { wK: true },
    });
    expect(legalMoves(watched).some((move) => squareName(move.from) === 'e1' && squareName(move.to) === 'g1')).toBe(false);

    const guiltyWatcher = loadPosition({
      pieces: [
        { sq: 'e1', type: 'k', color: 'w' },
        { sq: 'h1', type: 'r', color: 'w' },
        { sq: 'a7', type: 'b', color: 'b', guilt: true },
        { sq: 'c8', type: 'k', color: 'b' },
      ],
      castling: { wK: true },
    });
    expect(legalMoves(guiltyWatcher).some((move) => squareName(move.from) === 'e1' && squareName(move.to) === 'g1')).toBe(true);
  });

  it('rei não encosta num rei inocente e encosta num rei culpado', () => {
    const innocent = loadPosition({
      pieces: [
        { sq: 'e4', type: 'k', color: 'w' },
        { sq: 'a2', type: 'p', color: 'w' },
        { sq: 'e6', type: 'k', color: 'b' },
        { sq: 'a7', type: 'p', color: 'b' },
      ],
    });
    expect(() => playUci(innocent, 'e4', 'e5')).toThrow();

    const guilty = loadPosition({
      pieces: [
        { sq: 'e4', type: 'k', color: 'w' },
        { sq: 'a2', type: 'p', color: 'w' },
        { sq: 'e6', type: 'k', color: 'b', guilt: true },
        { sq: 'a7', type: 'p', color: 'b' },
      ],
    });
    const stepped = playUci(guilty, 'e4', 'e5');
    expect(at(stepped.state, 'e5')?.type).toBe('k');
    expect(inCheck(stepped.state, 'b')).toBe(true);
    expect(stepped.state.result.kind).toBe('playing');
  });
});

describe('culpa', () => {
  it('capturar mancha a peça e a captura não dá xeque', () => {
    let state = createGame();
    state = playUci(state, 'e2', 'e4').state;
    state = playUci(state, 'e7', 'e5').state;
    state = playUci(state, 'd1', 'h5').state;
    state = playUci(state, 'b8', 'c6').state;
    state = playUci(state, 'f1', 'c4').state;
    state = playUci(state, 'g8', 'f6').state;
    const taken = playUci(state, 'h5', 'f7');
    expect(taken.san).toBe('Dxf7');
    expect(at(taken.state, 'f7')).toMatchObject({ type: 'q', guilt: true });
    expect(inCheck(taken.state)).toBe(false);
    expect(taken.state.result).toEqual({ kind: 'playing' });
    expect(() => playUci(taken.state, 'e8', 'f7')).toThrow();
    expect(playUci(taken.state, 'e8', 'e7').state.turn).toBe('w');
    const waited = playUci(taken.state, 'a7', 'a6').state;

    const blocked = guiltBlockedSquares(waited, parseSquare('f7')).map(squareName);
    expect(blocked).toContain('e8');
    expect(blocked).toContain('f6');
    expect(blocked).not.toContain('e7');
    expect(from(waited, 'f7').some((move) => squareName(move.to) === 'e7')).toBe(true);
    expect(from(waited, 'f7').some((move) => squareName(move.to) === 'e8')).toBe(false);
  });

  it('peão culpado não toma en passant; peão limpo toma e fica culpado', () => {
    let stained = createGame();
    stained = playUci(stained, 'e2', 'e4').state;
    stained = playUci(stained, 'd7', 'd5').state;
    stained = playUci(stained, 'e4', 'd5').state;
    expect(at(stained, 'd5')).toMatchObject({ type: 'p', guilt: true });
    stained = playUci(stained, 'c7', 'c5').state;
    expect(stained.ep).toBe(parseSquare('c6'));
    expect(() => playUci(stained, 'd5', 'c6')).toThrow();

    let state = createGame();
    state = playUci(state, 'e2', 'e4').state;
    state = playUci(state, 'e7', 'e6').state;
    state = playUci(state, 'e4', 'e5').state;
    state = playUci(state, 'd7', 'd5').state;
    const ep = playUci(state, 'e5', 'd6');
    expect(ep.san).toBe('exd6');
    expect(at(ep.state, 'd6')).toMatchObject({ type: 'p', guilt: true });
    expect(at(ep.state, 'd5')).toBeNull();
  });

  it('en passant que abre xeque é ilegal', () => {
    const state = loadPosition({
      pieces: [
        { sq: 'h5', type: 'k', color: 'w' },
        { sq: 'e5', type: 'p', color: 'w' },
        { sq: 'd5', type: 'p', color: 'b' },
        { sq: 'a5', type: 'r', color: 'b' },
        { sq: 'a8', type: 'k', color: 'b' },
      ],
      ep: 'd6',
    });
    expect(() => playUci(state, 'e5', 'd6')).toThrow();
    const quiet = playUci(state, 'e5', 'e6');
    expect(inCheck(quiet.state, 'w')).toBe(false);
  });

  it('peça inocente captura peça culpada', () => {
    const state = loadPosition({
      pieces: [
        { sq: 'a1', type: 'k', color: 'w' },
        { sq: 'e4', type: 'n', color: 'w', guilt: true },
        { sq: 'd5', type: 'p', color: 'b' },
        { sq: 'h8', type: 'k', color: 'b' },
      ],
      turn: 'b',
    });
    const taken = playUci(state, 'd5', 'e4');
    expect(at(taken.state, 'e4')).toMatchObject({ type: 'p', color: 'b', guilt: true });
  });
});

describe('absolvição e repouso', () => {
  it('bispo absolve quem está ao lado e os dois perdem o próximo lance', () => {
    let state = createGame();
    state = playUci(state, 'e2', 'e4').state;
    state = playUci(state, 'd7', 'd5').state;
    state = playUci(state, 'e4', 'd5').state;
    state = playUci(state, 'a7', 'a6').state;
    const choices = legalMoves(state).filter(
      (move) => squareName(move.from) === 'f1' && squareName(move.to) === 'c4',
    );
    expect(choices.map((move) => move.absolve.length).sort()).toEqual([0, 1]);

    const plain = playUci(state, 'f1', 'c4');
    expect(at(plain.state, 'd5')?.guilt).toBe(true);
    expect(at(plain.state, 'c4')?.penancePly).toBeNull();
    expect(at(plain.state, 'd5')?.penancePly).toBeNull();

    const rite = playUci(state, 'f1', 'c4', ['d5']);
    expect(rite.san).toBe('Bc4*');
    expect(at(rite.state, 'd5')?.guilt).toBe(false);
    expect(at(rite.state, 'c4')?.penancePly).toBe(rite.state.ply + 1);
    expect(at(rite.state, 'd5')?.penancePly).toBe(rite.state.ply + 1);

    state = playUci(rite.state, 'h7', 'h6').state;
    expect(from(state, 'c4')).toHaveLength(0);
    expect(from(state, 'd5')).toHaveLength(0);
    expect(from(state, 'b1').length).toBeGreaterThan(0);

    state = playUci(state, 'b1', 'c3').state;
    state = playUci(state, 'a6', 'a5').state;
    expect(from(state, 'c4').length).toBeGreaterThan(0);
    expect(from(state, 'd5').length).toBeGreaterThan(0);
  });

  it('absolve só o subconjunto escolhido', () => {
    const state = loadPosition({
      pieces: [
        { sq: 'h1', type: 'k', color: 'w' },
        { sq: 'a1', type: 'b', color: 'w' },
        { sq: 'd5', type: 'n', color: 'w', guilt: true },
        { sq: 'e4', type: 'n', color: 'w', guilt: true },
        { sq: 'h8', type: 'k', color: 'b' },
      ],
    });
    const landings = legalMoves(state).filter(
      (move) => squareName(move.from) === 'a1' && squareName(move.to) === 'd4',
    );
    expect(landings).toHaveLength(4);
    const played = playUci(state, 'a1', 'd4', ['d5']);
    expect(at(played.state, 'd5')?.guilt).toBe(false);
    expect(at(played.state, 'd5')?.penancePly).toBe(played.state.ply + 1);
    expect(at(played.state, 'e4')).toMatchObject({ guilt: true, penancePly: null });
    expect(at(played.state, 'd4')?.penancePly).toBe(played.state.ply + 1);
  });

  it('bispo culpado só se limpa se passar o lance sem se mover', () => {
    const state = loadPosition({
      pieces: [
        { sq: 'a1', type: 'k', color: 'w' },
        { sq: 'c1', type: 'b', color: 'w', guilt: true },
        { sq: 'f1', type: 'b', color: 'w', guilt: true },
        { sq: 'b1', type: 'n', color: 'w', guilt: true },
        { sq: 'h2', type: 'p', color: 'w' },
        { sq: 'h8', type: 'k', color: 'b' },
      ],
    });
    const moved = playUci(state, 'c1', 'a3');
    expect(at(moved.state, 'a3')).toMatchObject({ type: 'b', guilt: true });
    expect(at(moved.state, 'f1')?.guilt).toBe(false);
    expect(at(moved.state, 'b1')?.guilt).toBe(true);

    const rested = playUci(state, 'h2', 'h3');
    expect(rested.san).toBe('h3');
    expect(at(rested.state, 'c1')?.guilt).toBe(false);
    expect(at(rested.state, 'f1')?.guilt).toBe(false);
    expect(at(rested.state, 'b1')?.guilt).toBe(true);
  });

  it('o repouso do bispo pode dar xeque', () => {
    const state = loadPosition({
      pieces: [
        { sq: 'a1', type: 'k', color: 'w' },
        { sq: 'b4', type: 'b', color: 'w', guilt: true },
        { sq: 'h2', type: 'p', color: 'w' },
        { sq: 'c5', type: 'k', color: 'b' },
      ],
    });
    expect(inCheck(state, 'b')).toBe(false);
    const played = playUci(state, 'h2', 'h3');
    expect(played.san).toBe('h3+');
    expect(at(played.state, 'b4')?.guilt).toBe(false);
    expect(inCheck(played.state, 'b')).toBe(true);
  });

  it('peão promove só a bispo e não absolve nesse lance', () => {
    const quiet = loadPosition({
      pieces: [
        { sq: 'a1', type: 'k', color: 'w' },
        { sq: 'a7', type: 'p', color: 'w' },
        { sq: 'b7', type: 'n', color: 'w', guilt: true },
        { sq: 'h8', type: 'k', color: 'b' },
      ],
    });
    const moves = legalMoves(quiet).filter((move) => squareName(move.to) === 'a8');
    expect(moves).toHaveLength(1);
    expect(moves[0].absolve).toEqual([]);
    const promoted = playUci(quiet, 'a7', 'a8');
    expect(promoted.san).toBe('a8=B');
    expect(at(promoted.state, 'a8')).toMatchObject({ type: 'b', guilt: false });
    expect(at(promoted.state, 'b7')?.guilt).toBe(true);

    const capture = loadPosition({
      pieces: [
        { sq: 'a1', type: 'k', color: 'w' },
        { sq: 'a7', type: 'p', color: 'w' },
        { sq: 'b8', type: 'n', color: 'b' },
        { sq: 'h8', type: 'k', color: 'b' },
      ],
    });
    const taken = playUci(capture, 'a7', 'b8');
    expect(taken.san).toBe('axb8=B');
    expect(at(taken.state, 'b8')).toMatchObject({ type: 'b', color: 'w', guilt: true });
  });

  it('penitência não protege a peça', () => {
    const state = loadPosition({
      pieces: [
        { sq: 'a1', type: 'k', color: 'w' },
        { sq: 'e4', type: 'n', color: 'w', penancePly: 2 },
        { sq: 'd5', type: 'p', color: 'b' },
        { sq: 'h8', type: 'k', color: 'b' },
      ],
      turn: 'b',
      ply: 1,
    });
    const taken = playUci(state, 'd5', 'e4');
    expect(at(taken.state, 'e4')?.color).toBe('b');
  });
});

describe('fim de partida', () => {
  it('xeque-mate com lance que não captura', () => {
    const state = loadPosition({
      pieces: [
        { sq: 'c1', type: 'k', color: 'w' },
        { sq: 'a4', type: 'r', color: 'w' },
        { sq: 'g8', type: 'k', color: 'b' },
        { sq: 'f7', type: 'p', color: 'b' },
        { sq: 'g7', type: 'p', color: 'b' },
        { sq: 'h7', type: 'p', color: 'b' },
      ],
    });
    const mate = playUci(state, 'a4', 'a8');
    expect(mate.san).toBe('Ta8#');
    expect(mate.state.result).toEqual({ kind: 'checkmate', winner: 'w' });
    expect(legalMoves(mate.state)).toHaveLength(0);
  });

  it('dama culpada ao lado do rei não é mate', () => {
    const state = loadPosition({
      pieces: [
        { sq: 'c6', type: 'k', color: 'w' },
        { sq: 'b7', type: 'q', color: 'w', guilt: true },
        { sq: 'a8', type: 'k', color: 'b' },
      ],
      turn: 'b',
    });
    expect(inCheck(state)).toBe(false);
    expect(state.result.kind).toBe('playing');
  });

  it('afogamento quando a culpa impede a única captura', () => {
    const guilty = loadPosition({
      pieces: [
        { sq: 'h8', type: 'k', color: 'w' },
        { sq: 'a1', type: 'n', color: 'w', guilt: true },
        { sq: 'f8', type: 'k', color: 'b' },
        { sq: 'a7', type: 'r', color: 'b' },
        { sq: 'b3', type: 'p', color: 'b' },
        { sq: 'c2', type: 'p', color: 'b' },
      ],
    });
    expect(guilty.result).toEqual({ kind: 'stalemate' });

    const innocent = loadPosition({
      pieces: [
        { sq: 'h8', type: 'k', color: 'w' },
        { sq: 'a1', type: 'n', color: 'w' },
        { sq: 'f8', type: 'k', color: 'b' },
        { sq: 'a7', type: 'r', color: 'b' },
        { sq: 'b3', type: 'p', color: 'b' },
        { sq: 'c2', type: 'p', color: 'b' },
      ],
    });
    expect(innocent.result.kind).toBe('playing');
    expect(legalMoves(innocent).length).toBeGreaterThan(0);
  });

  it('empata por material, cinquenta lances, repetição e desistência', () => {
    expect(
      loadPosition({
        pieces: [
          { sq: 'a1', type: 'k', color: 'w' },
          { sq: 'h8', type: 'k', color: 'b' },
          { sq: 'c4', type: 'b', color: 'w' },
        ],
      }).result,
    ).toEqual({ kind: 'draw', reason: 'insufficient' });

    const clock = loadPosition({
      pieces: [
        { sq: 'e1', type: 'k', color: 'w' },
        { sq: 'a2', type: 'p', color: 'w' },
        { sq: 'e8', type: 'k', color: 'b' },
      ],
      halfmove: 99,
    });
    expect(playUci(clock, 'e1', 'e2').state.result).toEqual({ kind: 'draw', reason: 'fifty-move' });

    let state = createGame();
    const back = [
      ['g1', 'f3'],
      ['g8', 'f6'],
      ['f3', 'g1'],
      ['f6', 'g8'],
    ] as const;
    state = playUci(state, back[0][0], back[0][1]).state;
    state = playUci(state, back[1][0], back[1][1]).state;
    state = playUci(state, back[2][0], back[2][1]).state;
    state = playUci(state, back[3][0], back[3][1]).state;
    expect(state.result.kind).toBe('playing');
    state = playUci(state, back[0][0], back[0][1]).state;
    state = playUci(state, back[1][0], back[1][1]).state;
    state = playUci(state, back[2][0], back[2][1]).state;
    state = playUci(state, back[3][0], back[3][1]).state;
    expect(state.result).toEqual({ kind: 'draw', reason: 'repetition' });

    const resigned = resign(createGame(), 'w');
    expect(resigned.result).toEqual({ kind: 'resign', winner: 'b' });
  });
});

describe('clone', () => {
  it('copia peças sem compartilhar a culpa', () => {
    const state = createGame();
    const copy = cloneState(state);
    const pawn = copy.board[parseSquare('e2')];
    if (!pawn) throw new Error('peão ausente');
    pawn.guilt = true;
    expect(at(state, 'e2')?.guilt).toBe(false);
  });
});
