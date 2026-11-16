import {
  BISHOP_DELTAS,
  KING_DELTAS,
  KNIGHT_DELTAS,
  ROOK_DELTAS,
  fileOf,
  makeSquare,
  moveKey,
  neighborSquares,
  onBoard,
  parseSquare,
  rankOf,
  squareName,
} from './squares';
import type {
  CastlingRights,
  Color,
  GameEvent,
  GameResult,
  GameState,
  LogEntry,
  Move,
  Piece,
  PieceType,
  PlayResult,
  PositionInput,
} from './types';

const PIECE_LETTER: Record<PieceType, string> = {
  k: 'R',
  q: 'D',
  r: 'T',
  b: 'B',
  n: 'C',
  p: '',
};

const BACK_RANK: PieceType[] = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];

export function opposite(color: Color): Color {
  return color === 'w' ? 'b' : 'w';
}

export function cloneState(state: GameState): GameState {
  return {
    board: state.board.map((piece) => (piece ? { ...piece } : null)),
    turn: state.turn,
    ply: state.ply,
    halfmove: state.halfmove,
    castling: { ...state.castling },
    ep: state.ep,
    lastMove: state.lastMove ? { ...state.lastMove } : null,
    history: state.history.map((entry) => ({ ...entry, events: entry.events.slice() })),
    repetition: state.repetition.slice(),
    result: state.result,
    nextId: state.nextId,
  };
}

function emptyCastling(partial?: Partial<CastlingRights>): CastlingRights {
  return {
    wK: partial?.wK ?? false,
    wQ: partial?.wQ ?? false,
    bK: partial?.bK ?? false,
    bQ: partial?.bQ ?? false,
  };
}

function place(state: GameState, type: PieceType, color: Color, sq: number, guilt = false): void {
  state.board[sq] = {
    id: state.nextId++,
    type,
    color,
    guilt,
    penancePly: null,
  };
}

export function createGame(): GameState {
  const state: GameState = {
    board: Array.from({ length: 64 }, () => null),
    turn: 'w',
    ply: 0,
    halfmove: 0,
    castling: { wK: true, wQ: true, bK: true, bQ: true },
    ep: null,
    lastMove: null,
    history: [],
    repetition: [],
    result: { kind: 'playing' },
    nextId: 1,
  };
  for (let file = 0; file < 8; file += 1) {
    place(state, BACK_RANK[file], 'w', makeSquare(file, 0));
    place(state, 'p', 'w', makeSquare(file, 1));
    place(state, 'p', 'b', makeSquare(file, 6));
    place(state, BACK_RANK[file], 'b', makeSquare(file, 7));
  }
  state.repetition = [positionKey(state)];
  return state;
}

/** Build an arbitrary position. Used by tests and, later, by puzzle or agent harnesses. */
export function loadPosition(input: PositionInput): GameState {
  const state: GameState = {
    board: Array.from({ length: 64 }, () => null),
    turn: input.turn ?? 'w',
    ply: input.ply ?? 0,
    halfmove: input.halfmove ?? 0,
    castling: emptyCastling(input.castling),
    ep: input.ep ? parseSquare(input.ep) : null,
    lastMove: null,
    history: [],
    repetition: [],
    result: { kind: 'playing' },
    nextId: 1,
  };
  for (const item of input.pieces) {
    const sq = parseSquare(item.sq);
    if (state.board[sq]) throw new Error(`Duas peças em ${item.sq}`);
    state.board[sq] = {
      id: state.nextId++,
      type: item.type,
      color: item.color,
      guilt: item.guilt ?? false,
      penancePly: item.penancePly ?? null,
    };
  }
  state.repetition = [positionKey(state)];
  conclude(state);
  return state;
}

export function pieceById(state: GameState, id: number): Piece | null {
  for (const piece of state.board) {
    if (piece && piece.id === id) return piece;
  }
  return null;
}

export function squareOf(state: GameState, id: number): number | null {
  for (let sq = 0; sq < 64; sq += 1) {
    if (state.board[sq]?.id === id) return sq;
  }
  return null;
}

function isLocked(piece: Piece, ply: number): boolean {
  return piece.penancePly === ply;
}

/**
 * A guilty piece has lost the power to take. It does not attack, so it neither
 * checks nor protects. Penance does not remove an attack — the piece only
 * skips its owner's next move.
 */
export function squareAttacked(board: readonly (Piece | null)[], target: number, by: Color): boolean {
  const tf = fileOf(target);
  const tr = rankOf(target);

  for (const [df, dr] of KNIGHT_DELTAS) {
    const f = tf + df;
    const r = tr + dr;
    if (!onBoard(f, r)) continue;
    const piece = board[makeSquare(f, r)];
    if (piece && piece.color === by && piece.type === 'n' && !piece.guilt) return true;
  }

  for (const [df, dr] of KING_DELTAS) {
    const f = tf + df;
    const r = tr + dr;
    if (!onBoard(f, r)) continue;
    const piece = board[makeSquare(f, r)];
    if (piece && piece.color === by && piece.type === 'k' && !piece.guilt) return true;
  }

  const pawnRank = by === 'w' ? tr - 1 : tr + 1;
  if (onBoard(0, pawnRank)) {
    for (const df of [-1, 1]) {
      const f = tf + df;
      if (!onBoard(f, pawnRank)) continue;
      const piece = board[makeSquare(f, pawnRank)];
      if (piece && piece.color === by && piece.type === 'p' && !piece.guilt) return true;
    }
  }

  for (const [df, dr] of BISHOP_DELTAS) {
    if (rayAttacks(board, tf, tr, df, dr, by, ['b', 'q'])) return true;
  }
  for (const [df, dr] of ROOK_DELTAS) {
    if (rayAttacks(board, tf, tr, df, dr, by, ['r', 'q'])) return true;
  }
  return false;
}

function rayAttacks(
  board: readonly (Piece | null)[],
  tf: number,
  tr: number,
  df: number,
  dr: number,
  by: Color,
  types: PieceType[],
): boolean {
  let f = tf + df;
  let r = tr + dr;
  while (onBoard(f, r)) {
    const piece = board[makeSquare(f, r)];
    if (piece) {
      return piece.color === by && !piece.guilt && types.includes(piece.type);
    }
    f += df;
    r += dr;
  }
  return false;
}

export function inCheck(state: GameState, color: Color = state.turn): boolean {
  const king = findKing(state.board, color);
  if (king === null) return false;
  return squareAttacked(state.board, king, opposite(color));
}

function findKing(board: readonly (Piece | null)[], color: Color): number | null {
  for (let sq = 0; sq < 64; sq += 1) {
    const piece = board[sq];
    if (piece && piece.color === color && piece.type === 'k') return sq;
  }
  return null;
}

function pushMove(moves: Move[], from: number, to: number, absolveSets: readonly (readonly number[])[]): void {
  for (const absolve of absolveSets) {
    moves.push({ from, to, absolve });
  }
}

function absolutionSets(board: readonly (Piece | null)[], dest: number, mover: Piece): readonly (readonly number[])[] {
  if (mover.type !== 'b') return [[]];
  const ids: number[] = [];
  for (const sq of neighborSquares(dest)) {
    const piece = board[sq];
    if (!piece || piece.id === mover.id || piece.type === 'b') continue;
    // A guilty bishop lays the stain down by resting. The rite is for every other piece.
    if (piece.color === mover.color && piece.guilt) ids.push(piece.id);
  }
  ids.sort((a, b) => a - b);
  if (ids.length === 0) return [[]];
  const sets: number[][] = [[]];
  for (const id of ids) {
    const size = sets.length;
    for (let i = 0; i < size; i += 1) sets.push([...sets[i], id]);
  }
  return sets;
}

function addSliderMoves(
  state: GameState,
  moves: Move[],
  from: number,
  piece: Piece,
  deltas: readonly (readonly [number, number])[],
): void {
  const file = fileOf(from);
  const rank = rankOf(from);
  const setsFor = (dest: number) => absolutionSets(state.board, dest, piece);
  for (const [df, dr] of deltas) {
    let f = file + df;
    let r = rank + dr;
    while (onBoard(f, r)) {
      const dest = makeSquare(f, r);
      const occupant = state.board[dest];
      if (!occupant) {
        pushMove(moves, from, dest, setsFor(dest));
      } else {
        if (occupant.color !== piece.color && !piece.guilt) {
          pushMove(moves, from, dest, setsFor(dest));
        }
        break;
      }
      f += df;
      r += dr;
    }
  }
}

function addStepMoves(
  state: GameState,
  moves: Move[],
  from: number,
  piece: Piece,
  deltas: readonly (readonly [number, number])[],
): void {
  const file = fileOf(from);
  const rank = rankOf(from);
  for (const [df, dr] of deltas) {
    const f = file + df;
    const r = rank + dr;
    if (!onBoard(f, r)) continue;
    const dest = makeSquare(f, r);
    const occupant = state.board[dest];
    if (!occupant) {
      pushMove(moves, from, dest, absolutionSets(state.board, dest, piece));
    } else if (occupant.color !== piece.color && !piece.guilt) {
      pushMove(moves, from, dest, absolutionSets(state.board, dest, piece));
    }
  }
}

function addPawnMoves(state: GameState, moves: Move[], from: number, piece: Piece): void {
  const file = fileOf(from);
  const rank = rankOf(from);
  const dir = piece.color === 'w' ? 1 : -1;
  const startRank = piece.color === 'w' ? 1 : 6;
  const forward = rank + dir;
  if (onBoard(file, forward) && !state.board[makeSquare(file, forward)]) {
    pushMove(moves, from, makeSquare(file, forward), [[]]);
    const beyond = rank + dir * 2;
    if (rank === startRank && !state.board[makeSquare(file, beyond)]) {
      pushMove(moves, from, makeSquare(file, beyond), [[]]);
    }
  }
  for (const df of [-1, 1]) {
    const f = file + df;
    if (!onBoard(f, forward)) continue;
    const dest = makeSquare(f, forward);
    const occupant = state.board[dest];
    const ep = state.ep === dest;
    if (occupant && occupant.color !== piece.color && !piece.guilt) {
      pushMove(moves, from, dest, [[]]);
    } else if (!occupant && ep && !piece.guilt) {
      pushMove(moves, from, dest, [[]]);
    }
  }
}

function addCastling(state: GameState, moves: Move[], from: number, piece: Piece): void {
  if (piece.type !== 'k') return;
  if (inCheck(state, piece.color)) return;
  const rank = piece.color === 'w' ? 0 : 7;
  if (from !== makeSquare(4, rank)) return;
  const enemy = opposite(piece.color);
  const rights = state.castling;

  const trySide = (side: 'K' | 'Q') => {
    const kingSide = side === 'K';
    const allowed = piece.color === 'w'
      ? (kingSide ? rights.wK : rights.wQ)
      : (kingSide ? rights.bK : rights.bQ);
    if (!allowed) return;
    const rookFile = kingSide ? 7 : 0;
    const rook = state.board[makeSquare(rookFile, rank)];
    if (!rook || rook.type !== 'r' || rook.color !== piece.color) return;
    if (isLocked(rook, state.ply)) return;
    const emptyFiles = kingSide ? [5, 6] : [1, 2, 3];
    for (const f of emptyFiles) {
      if (state.board[makeSquare(f, rank)]) return;
    }
    const passFile = kingSide ? 5 : 3;
    const destFile = kingSide ? 6 : 2;
    if (squareAttacked(state.board, makeSquare(passFile, rank), enemy)) return;
    if (squareAttacked(state.board, makeSquare(destFile, rank), enemy)) return;
    moves.push({ from, to: makeSquare(destFile, rank), absolve: [] });
  };

  trySide('K');
  trySide('Q');
}

function pseudoMoves(state: GameState): Move[] {
  const moves: Move[] = [];
  for (let from = 0; from < 64; from += 1) {
    const piece = state.board[from];
    if (!piece || piece.color !== state.turn || isLocked(piece, state.ply)) continue;
    switch (piece.type) {
      case 'p':
        addPawnMoves(state, moves, from, piece);
        break;
      case 'n':
        addStepMoves(state, moves, from, piece, KNIGHT_DELTAS);
        break;
      case 'k':
        addStepMoves(state, moves, from, piece, KING_DELTAS);
        addCastling(state, moves, from, piece);
        break;
      case 'b':
        addSliderMoves(state, moves, from, piece, BISHOP_DELTAS);
        break;
      case 'r':
        addSliderMoves(state, moves, from, piece, ROOK_DELTAS);
        break;
      case 'q':
        addSliderMoves(state, moves, from, piece, [...BISHOP_DELTAS, ...ROOK_DELTAS]);
        break;
      default:
        break;
    }
  }
  return moves;
}

function leavesOwnKingSafe(state: GameState, move: Move): boolean {
  const { next } = applyUnchecked(state, move);
  return !inCheck(next, state.turn);
}

export function legalMoves(state: GameState): Move[] {
  if (state.result.kind !== 'playing') return [];
  return pseudoMoves(state).filter((move) => leavesOwnKingSafe(state, move));
}

/**
 * Squares a selected guilty piece would capture on, if it were innocent.
 * The UI uses this to show why those captures are refused. Not an attack map
 * for rules — pinned or king-unsafe squares are included on purpose.
 */
export function guiltBlockedSquares(state: GameState, from: number): number[] {
  const piece = state.board[from];
  if (!piece || !piece.guilt || piece.color !== state.turn || isLocked(piece, state.ply)) return [];
  const innocent: Piece = { ...piece, guilt: false };
  const shadow: GameState = { ...state, board: state.board.slice() };
  shadow.board[from] = innocent;
  const blocked: number[] = [];
  const seen = new Set<string>();
  const collect = (dest: number) => {
    const key = `${from}-${dest}`;
    if (seen.has(key)) return;
    seen.add(key);
    if (state.board[dest] && state.board[dest]?.color !== piece.color) blocked.push(dest);
    if (piece.type === 'p' && state.ep === dest && !state.board[dest]) blocked.push(dest);
  };
  const moves: Move[] = [];
  switch (piece.type) {
    case 'p':
      addPawnMoves(shadow, moves, from, innocent);
      break;
    case 'n':
      addStepMoves(shadow, moves, from, innocent, KNIGHT_DELTAS);
      break;
    case 'k':
      addStepMoves(shadow, moves, from, innocent, KING_DELTAS);
      break;
    case 'b':
      addSliderMoves(shadow, moves, from, innocent, BISHOP_DELTAS);
      break;
    case 'r':
      addSliderMoves(shadow, moves, from, innocent, ROOK_DELTAS);
      break;
    case 'q':
      addSliderMoves(shadow, moves, from, innocent, [...BISHOP_DELTAS, ...ROOK_DELTAS]);
      break;
    default:
      break;
  }
  for (const move of moves) collect(move.to);
  return blocked;
}

function updateCastlingOnMove(state: GameState, piece: Piece, from: number, to: number): void {
  const rights = state.castling;
  const clearRookHome = (sq: number) => {
    if (sq === makeSquare(0, 0)) rights.wQ = false;
    if (sq === makeSquare(7, 0)) rights.wK = false;
    if (sq === makeSquare(0, 7)) rights.bQ = false;
    if (sq === makeSquare(7, 7)) rights.bK = false;
  };
  if (piece.type === 'k') {
    if (piece.color === 'w') {
      rights.wK = false;
      rights.wQ = false;
    } else {
      rights.bK = false;
      rights.bQ = false;
    }
  }
  if (piece.type === 'r') clearRookHome(from);
  clearRookHome(to);
}

function applyUnchecked(state: GameState, move: Move): { next: GameState; events: GameEvent[] } {
  const next = cloneState(state);
  const mover = next.board[move.from];
  if (!mover || mover.color !== next.turn) {
    throw new Error('Lance sem peça da vez.');
  }
  const events: GameEvent[] = [];
  const movingPawn = mover.type === 'p';
  const capturedBefore = next.board[move.to];
  let captured: Piece | null = capturedBefore && capturedBefore.color !== mover.color ? { ...capturedBefore } : null;

  const kingRank = mover.color === 'w' ? 0 : 7;
  const isCastle = mover.type === 'k' && rankOf(move.from) === kingRank && Math.abs(fileOf(move.to) - fileOf(move.from)) === 2;
  const isEp = mover.type === 'p' && next.ep === move.to && !next.board[move.to];

  next.board[move.from] = null;
  if (isCastle) {
    const rookFromFile = fileOf(move.to) === 6 ? 7 : 0;
    const rookToFile = fileOf(move.to) === 6 ? 5 : 3;
    const rookFrom = makeSquare(rookFromFile, kingRank);
    const rook = next.board[rookFrom];
    if (!rook) throw new Error('Roque sem torre.');
    next.board[rookFrom] = null;
    next.board[makeSquare(rookToFile, kingRank)] = rook;
  }
  if (isEp) {
    const capSq = makeSquare(fileOf(move.to), rankOf(move.from));
    const epVictim = next.board[capSq];
    if (!epVictim) throw new Error('En passant sem peão.');
    captured = { ...epVictim };
    next.board[capSq] = null;
  }

  if (captured) {
    events.push({ type: 'capture', id: captured.id, typeName: captured.type });
    mover.guilt = true;
    events.push({ type: 'guilt', id: mover.id });
  }

  const lastRank = mover.color === 'w' ? 7 : 0;
  if (mover.type === 'p' && rankOf(move.to) === lastRank) {
    mover.type = 'b';
    events.push({ type: 'promote', id: mover.id });
  }

  next.board[move.to] = mover;

  next.halfmove = captured !== null || movingPawn ? 0 : state.halfmove + 1;

  updateCastlingOnMove(next, mover, move.from, move.to);

  if (movingPawn && Math.abs(rankOf(move.to) - rankOf(move.from)) === 2) {
    next.ep = makeSquare(fileOf(move.from), (rankOf(move.from) + rankOf(move.to)) / 2);
  } else {
    next.ep = null;
  }

  const requested = [...move.absolve].sort((a, b) => a - b);
  if (requested.length > 0) {
    if (mover.type !== 'b') throw new Error('Só o bispo absolve.');
    const allowed = new Set<number>();
    for (const sq of neighborSquares(move.to)) {
      const piece = next.board[sq];
      if (piece && piece.type !== 'b' && piece.color === mover.color && piece.guilt) allowed.add(piece.id);
    }
    for (const id of requested) {
      if (!allowed.has(id)) throw new Error('Absolvição inválida.');
      const piece = pieceById(next, id);
      if (!piece) throw new Error('Peça absolvida desapareceu.');
      piece.guilt = false;
      events.push({ type: 'absolve', id, how: 'bishop' });
    }
    const penancePly = state.ply + 2;
    mover.penancePly = penancePly;
    events.push({ type: 'penance', id: mover.id });
    for (const id of requested) {
      const piece = pieceById(next, id);
      if (!piece) continue;
      piece.penancePly = penancePly;
      events.push({ type: 'penance', id });
    }
  }

  // A bishop that spent this turn unmoved lays its own guilt down.
  // The bishop that just moved — including one that captured — keeps it.
  for (const piece of next.board) {
    if (!piece || piece.color !== mover.color || piece.type !== 'b') continue;
    if (piece.id === mover.id || !piece.guilt) continue;
    piece.guilt = false;
    events.push({ type: 'absolve', id: piece.id, how: 'rest' });
  }

  next.lastMove = { from: move.from, to: move.to };
  next.turn = opposite(state.turn);
  next.ply = state.ply + 1;
  return { next, events };
}

function squareColor(sq: number): number {
  return (fileOf(sq) + rankOf(sq)) & 1;
}

/** Kings alone, or only a minor that cannot force mate. Guilt cannot create a mating attack these pieces lack. */
function insufficientMaterial(state: GameState): boolean {
  const minors: { type: PieceType; sq: number }[] = [];
  for (let sq = 0; sq < 64; sq += 1) {
    const piece = state.board[sq];
    if (!piece || piece.type === 'k') continue;
    if (piece.type === 'p' || piece.type === 'q' || piece.type === 'r') return false;
    minors.push({ type: piece.type, sq });
  }
  if (minors.length <= 1) return true;
  if (minors.length === 2 && minors[0].type === 'b' && minors[1].type === 'b') {
    return squareColor(minors[0].sq) === squareColor(minors[1].sq);
  }
  return false;
}

function conclude(state: GameState): void {
  if (insufficientMaterial(state)) {
    state.result = { kind: 'draw', reason: 'insufficient' };
    return;
  }
  const moves = legalMoves(state);
  if (moves.length === 0) {
    state.result = inCheck(state, state.turn)
      ? { kind: 'checkmate', winner: opposite(state.turn) }
      : { kind: 'stalemate' };
    return;
  }
  if (state.halfmove >= 100) {
    state.result = { kind: 'draw', reason: 'fifty-move' };
    return;
  }
  const key = state.repetition[state.repetition.length - 1];
  if (key && state.repetition.filter((item) => item === key).length >= 3) {
    state.result = { kind: 'draw', reason: 'repetition' };
  }
}

export function positionKey(state: GameState): string {
  let board = '';
  for (let sq = 0; sq < 64; sq += 1) {
    const piece = state.board[sq];
    if (!piece) {
      board += '.';
      continue;
    }
    const penance = piece.penancePly !== null && piece.penancePly >= state.ply
      ? String(piece.penancePly - state.ply)
      : '0';
    board += `${piece.color}${piece.type}${piece.guilt ? 'g' : '-'}${penance}`;
  }
  const c = state.castling;
  const castle = `${c.wK ? 'K' : ''}${c.wQ ? 'Q' : ''}${c.bK ? 'k' : ''}${c.bQ ? 'q' : ''}` || '-';
  return `${board} ${state.turn} ${castle} ${state.ep ?? '-'}`;
}

function sameMove(a: Move, b: Move): boolean {
  return moveKey(a.from, a.to, a.absolve) === moveKey(b.from, b.to, b.absolve);
}

function san(state: GameState, move: Move, result: GameResult, check: boolean): string {
  const piece = state.board[move.from];
  if (!piece) return '??';
  if (piece.type === 'k' && Math.abs(fileOf(move.to) - fileOf(move.from)) === 2) {
    const base = fileOf(move.to) === 6 ? 'O-O' : 'O-O-O';
    return base + suffix(result, check);
  }
  const others = legalMoves(state).filter((candidate) => {
    if (candidate.to !== move.to || candidate.from === move.from) return false;
    const other = state.board[candidate.from];
    return other?.type === piece.type && other.color === piece.color;
  });
  let disambiguation = '';
  if (piece.type !== 'p' && others.length > 0) {
    const sameFile = others.some((candidate) => fileOf(candidate.from) === fileOf(move.from));
    const sameRank = others.some((candidate) => rankOf(candidate.from) === rankOf(move.from));
    if (!sameFile) disambiguation = squareName(move.from)[0];
    else if (!sameRank) disambiguation = squareName(move.from)[1];
    else disambiguation = squareName(move.from);
  }
  const capture = state.board[move.to] !== null || (piece.type === 'p' && state.ep === move.to);
  let text = '';
  if (piece.type === 'p') {
    if (capture) text = `${squareName(move.from)[0]}x${squareName(move.to)}`;
    else text = squareName(move.to);
  } else {
    text = `${PIECE_LETTER[piece.type]}${disambiguation}${capture ? 'x' : ''}${squareName(move.to)}`;
  }
  const promotes = piece.type === 'p' && (rankOf(move.to) === 7 || rankOf(move.to) === 0);
  if (promotes) text += '=B';
  if (move.absolve.length > 0) text += '*';
  return text + suffix(result, check);
}

function suffix(result: GameResult, check: boolean): string {
  if (result.kind === 'checkmate') return '#';
  if (check) return '+';
  return '';
}

export function play(state: GameState, move: Move): PlayResult {
  if (state.result.kind !== 'playing') throw new Error('A partida já terminou.');
  const legal = legalMoves(state);
  if (!legal.some((candidate) => sameMove(candidate, move))) {
    throw new Error(`Lance ilegal: ${squareName(move.from)}-${squareName(move.to)}`);
  }
  const { next: drafted, events } = applyUnchecked(state, move);
  const key = positionKey(drafted);
  drafted.repetition = [...state.repetition, key];
  conclude(drafted);
  const check = drafted.result.kind === 'playing' && inCheck(drafted, drafted.turn);
  const notation = san(state, move, drafted.result, check || drafted.result.kind === 'checkmate');
  const entry: LogEntry = { color: state.turn, san: notation, events };
  drafted.history = [...state.history, entry];
  return { state: drafted, san: notation, events };
}

export function resign(state: GameState, color: Color): GameState {
  if (state.result.kind !== 'playing') return state;
  const next = cloneState(state);
  next.result = { kind: 'resign', winner: opposite(color) };
  return next;
}

export function findMove(
  state: GameState,
  from: string,
  to: string,
  absolveSquares: readonly string[] = [],
): Move {
  const fromSq = parseSquare(from);
  const toSq = parseSquare(to);
  const ids = absolveSquares.map((name) => {
    const sq = parseSquare(name);
    const piece = state.board[sq];
    if (!piece) throw new Error(`Nada em ${name} para absolver.`);
    return piece.id;
  });
  const move = legalMoves(state).find((candidate) => sameMove(candidate, { from: fromSq, to: toSq, absolve: ids }));
  if (!move) throw new Error(`Sem lance legal ${from}-${to}`);
  return move;
}

/** Play a coordinate move. Absolve lists name the squares of the pieces cleansed. */
export function playUci(state: GameState, from: string, to: string, absolveSquares: readonly string[] = []): PlayResult {
  return play(state, findMove(state, from, to, absolveSquares));
}

export type { GameState, Move, PlayResult };
