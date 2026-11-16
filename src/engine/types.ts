/** Remorse Chess — pure rules engine. UI and agents consume this module. */

export type Color = 'w' | 'b';

export type PieceType = 'k' | 'q' | 'r' | 'b' | 'n' | 'p';

export interface Piece {
  id: number;
  type: PieceType;
  color: Color;
  /** Capturing stains the piece. A guilty piece cannot capture or give check. */
  guilt: boolean;
  /**
   * Ply on which this piece is forbidden to move.
   * Set to the owner's next turn after an absolution. Null when free.
   * The piece still occupies the square and, if innocent, still attacks.
   */
  penancePly: number | null;
}

export interface CastlingRights {
  wK: boolean;
  wQ: boolean;
  bK: boolean;
  bQ: boolean;
}

/** A complete action. Absolution choices are part of the move. */
export interface Move {
  from: number;
  to: number;
  /** Piece ids cleansed by a bishop landing beside them. Empty means no rite. */
  absolve: readonly number[];
}

export type GameEvent =
  | { type: 'guilt'; id: number }
  | { type: 'absolve'; id: number; how: 'bishop' | 'rest' }
  | { type: 'penance'; id: number }
  | { type: 'promote'; id: number }
  | { type: 'capture'; id: number; typeName: PieceType };

export type GameResult =
  | { kind: 'playing' }
  | { kind: 'checkmate'; winner: Color }
  | { kind: 'stalemate' }
  | { kind: 'draw'; reason: 'fifty-move' | 'repetition' | 'insufficient' }
  | { kind: 'resign'; winner: Color };

export interface LogEntry {
  color: Color;
  san: string;
  events: GameEvent[];
}

export interface GameState {
  board: (Piece | null)[];
  turn: Color;
  /** Half-move index. 0 = White's first move. */
  ply: number;
  halfmove: number;
  castling: CastlingRights;
  /** En-passant target square, or null. */
  ep: number | null;
  lastMove: { from: number; to: number } | null;
  history: LogEntry[];
  repetition: string[];
  result: GameResult;
  nextId: number;
}

export interface PlayResult {
  state: GameState;
  san: string;
  events: GameEvent[];
}

export interface Placement {
  sq: string;
  type: PieceType;
  color: Color;
  guilt?: boolean;
  penancePly?: number | null;
}

export interface PositionInput {
  pieces: Placement[];
  turn?: Color;
  ply?: number;
  castling?: Partial<CastlingRights>;
  ep?: string | null;
  halfmove?: number;
}
