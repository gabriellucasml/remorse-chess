import type { Agent } from './agent';
import {
  applyLegal,
  inCheck,
  legalMoves,
  pieceById,
  positionKey,
  type Color,
  type GameState,
  type Move,
  type PieceType,
} from '../engine';
import { moveKey, rankOf } from '../engine/squares';

export type Level = 'easy' | 'medium' | 'hard';

export interface LevelSpec {
  label: string;
  budgetMs: number;
  maxDepth: number;
  /** Centipawn window around the best move. Zero plays only the best. */
  spread: number;
}

export const LEVELS: Record<Level, LevelSpec> = {
  easy: { label: 'Fácil', budgetMs: 40, maxDepth: 2, spread: 20 },
  medium: { label: 'Médio', budgetMs: 150, maxDepth: 4, spread: 14 },
  hard: { label: 'Difícil', budgetMs: 600, maxDepth: 6, spread: 0 },
};

export interface SearchLimits {
  budgetMs: number;
  maxDepth: number;
  spread: number;
  now?: () => number;
  random?: () => number;
}

const VALUE: Record<PieceType, number> = {
  p: 100,
  n: 320,
  b: 350,
  r: 500,
  q: 900,
  k: 0,
};

const GUILT_KEEP = 0.38;
const PENANCE = 22;
const NO_BISHOP = 60;
const TEMPO = 10;
const INF = 1_000_000;
const MATE = 100_000;
const Q_LIMIT = 4;

interface Scored {
  move: Move;
  score: number;
}

interface TTEntry {
  depth: number;
  score: number;
  flag: 'exact' | 'lower' | 'upper';
  move: Move | null;
}

interface Frame {
  clock: boolean;
  deadline: number;
  now: () => number;
  nodes: number;
  tt: Map<string, TTEntry>;
  stop: boolean;
}

class SearchStopped extends Error {
  constructor() {
    super('Busca interrompida');
    this.name = 'SearchStopped';
  }
}

export function createSearchAgent(level: Level): Agent {
  const spec = LEVELS[level];
  return {
    name: spec.label,
    chooseMove(state, moves) {
      return searchMove(state, moves, spec);
    },
  };
}

export function searchMove(state: GameState, moves: readonly Move[], limits: SearchLimits): Move {
  if (moves.length === 0) throw new Error('Sem lances.');
  const now = limits.now ?? Date.now;
  const random = limits.random ?? Math.random;
  const frame: Frame = {
    clock: false,
    deadline: now() + limits.budgetMs,
    now,
    nodes: 0,
    tt: new Map(),
    stop: false,
  };

  let finished: Scored[] = moves.map((move) => ({ move, score: rankMove(state, move) }));
  let hint: Move | null = null;

  for (let depth = 1; depth <= limits.maxDepth; depth += 1) {
    if (depth > 1 && frame.now() >= frame.deadline) break;
    frame.clock = depth > 1;
    frame.stop = false;
    const ordered = sortMoves(state, moves, hint);
    const scored: Scored[] = [];
    const exact = limits.spread > 0;
    try {
      let alpha = -INF;
      for (const move of ordered) {
        guard(frame);
        const child = applyLegal(state, move);
        let score: number;
        if (exact || alpha === -INF) {
          score = -negamax(child, depth - 1, -INF, INF, 1, frame);
        } else {
          score = -negamax(child, depth - 1, -alpha - 1, -alpha, 1, frame);
          if (!frame.stop && score > alpha) {
            score = -negamax(child, depth - 1, -INF, INF, 1, frame);
          }
        }
        if (frame.stop) break;
        scored.push({ move, score });
        if (score > alpha) alpha = score;
      }
    } catch (error) {
      if (!(error instanceof SearchStopped)) throw error;
      frame.stop = true;
    }
    if (frame.stop || scored.length !== ordered.length) break;
    finished = scored;
    hint = bestOf(scored).move;
  }

  return pick(finished, limits.spread, random);
}

function negamax(state: GameState, depth: number, alpha: number, beta: number, ply: number, frame: Frame): number {
  guard(frame);
  if (state.result.kind !== 'playing') return terminal(state, ply);
  if (depth <= 0) return quiescence(state, alpha, beta, ply, 0, frame);

  const key = `${positionKey(state)} ${state.halfmove}`;
  const hit = frame.tt.get(key);
  if (hit && hit.depth >= depth) {
    const score = unpack(hit.score, ply);
    if (hit.flag === 'exact') return score;
    if (hit.flag === 'lower' && score >= beta) return score;
    if (hit.flag === 'upper' && score <= alpha) return score;
  }

  const moves = sortMoves(state, legalMoves(state), hit?.move ?? null);
  if (moves.length === 0) return evaluate(state);

  const alphaStart = alpha;
  let best = -INF;
  let bestMove: Move | null = null;
  for (const move of moves) {
    const score = -negamax(applyLegal(state, move), depth - 1, -beta, -alpha, ply + 1, frame);
    if (frame.stop) return alpha;
    if (score > best) {
      best = score;
      bestMove = move;
    }
    if (score > alpha) alpha = score;
    if (alpha >= beta) break;
  }

  const flag = best <= alphaStart ? 'upper' : best >= beta ? 'lower' : 'exact';
  frame.tt.set(key, { depth, score: pack(best, ply), flag, move: bestMove });
  return best;
}

function quiescence(
  state: GameState,
  alpha: number,
  beta: number,
  ply: number,
  qply: number,
  frame: Frame,
): number {
  guard(frame);
  if (state.result.kind !== 'playing') return terminal(state, ply);
  if (qply >= Q_LIMIT) return evaluate(state);

  const check = inCheck(state);
  if (!check) {
    const stand = evaluate(state);
    if (stand >= beta) return stand;
    if (stand > alpha) alpha = stand;
  }

  let moves = sortMoves(state, legalMoves(state), null);
  if (!check) moves = riteCandidates(state, moves.filter((move) => noisy(state, move)));
  if (moves.length === 0) return check ? evaluate(state) : alpha;

  for (const move of moves) {
    const score = -quiescence(applyLegal(state, move), -beta, -alpha, ply + 1, qply + 1, frame);
    if (frame.stop) return alpha;
    if (score > alpha) alpha = score;
    if (alpha >= beta) break;
  }
  return alpha;
}

function evaluate(state: GameState): number {
  let white = 0;
  const bishops: Record<Color, number> = { w: 0, b: 0 };
  const guilty: Record<Color, number> = { w: 0, b: 0 };

  for (let sq = 0; sq < 64; sq += 1) {
    const piece = state.board[sq];
    if (!piece || piece.type === 'k') continue;
    let value = VALUE[piece.type];
    if (piece.guilt) {
      value = Math.round(value * GUILT_KEEP);
      guilty[piece.color] += 1;
    }
    if (piece.penancePly !== null && piece.penancePly >= state.ply) value -= PENANCE;
    if (piece.type === 'b') bishops[piece.color] += 1;
    if (!piece.guilt) value += placement(piece.type, sq, piece.color);
    white += piece.color === 'w' ? value : -value;
  }

  if (guilty.w > 0 && bishops.w === 0) white -= NO_BISHOP * guilty.w;
  if (guilty.b > 0 && bishops.b === 0) white += NO_BISHOP * guilty.b;

  const score = state.turn === 'w' ? white : -white;
  return score + TEMPO;
}

function placement(type: PieceType, sq: number, color: Color): number {
  const file = sq & 7;
  const rank = color === 'w' ? sq >> 3 : 7 - (sq >> 3);
  if (type === 'p') {
    if ((file === 3 || file === 4) && rank >= 3 && rank <= 4) return 28;
    if (file === 2 && rank >= 3 && rank <= 4) return 16;
    if (file === 5 && rank >= 3) return -6;
    if ((file <= 1 || file >= 6) && rank >= 3) return -14;
    return rank * 2;
  }
  if (type === 'n') {
    if (file === 0 || file === 7) return -36;
    if (rank >= 2 && file >= 2 && file <= 5) return 16;
    if (file === 1 || file === 6) return -8;
    return 0;
  }
  if (type === 'b' && rank >= 2 && file >= 2 && file <= 5) return 10;
  return 0;
}

function terminal(state: GameState, ply: number): number {
  const result = state.result;
  if (result.kind === 'checkmate' || result.kind === 'resign') {
    return (result.winner === state.turn ? 1 : -1) * (MATE - ply);
  }
  return 0;
}

function noisy(state: GameState, move: Move): boolean {
  if (move.absolve.length > 0) return true;
  const mover = state.board[move.from];
  if (!mover) return false;
  if (mover.type === 'p' && (rankOf(move.to) === 0 || rankOf(move.to) === 7)) return true;
  if (state.board[move.to]) return true;
  return mover.type === 'p' && state.ep === move.to;
}

function riteCandidates(state: GameState, moves: Move[]): Move[] {
  const richest = new Map<string, { move: Move; value: number }>();
  const kept: Move[] = [];
  for (const move of moves) {
    if (move.absolve.length === 0) {
      kept.push(move);
      continue;
    }
    const key = `${move.from}-${move.to}`;
    const value = absolveValue(state, move);
    const current = richest.get(key);
    if (!current || value > current.value) richest.set(key, { move, value });
  }
  for (const entry of richest.values()) kept.push(entry.move);
  return kept;
}

function sortMoves(state: GameState, moves: readonly Move[], hint: Move | null): Move[] {
  const ordered = [...moves].sort((a, b) => rankMove(state, b) - rankMove(state, a));
  if (!hint) return ordered;
  const key = moveKey(hint.from, hint.to, hint.absolve);
  const index = ordered.findIndex((move) => moveKey(move.from, move.to, move.absolve) === key);
  if (index > 0) {
    const [hit] = ordered.splice(index, 1);
    ordered.unshift(hit);
  }
  return ordered;
}

function rankMove(state: GameState, move: Move): number {
  const mover = state.board[move.from];
  if (!mover) return 0;
  let score = 0;
  const victim = state.board[move.to];
  if (victim && victim.color !== mover.color) score += VALUE[victim.type] * 8 - VALUE[mover.type];
  else if (mover.type === 'p' && state.ep === move.to) score += VALUE.p * 8;
  if (mover.type === 'p' && (rankOf(move.to) === 0 || rankOf(move.to) === 7)) score += 700;
  if (move.absolve.length > 0) score += 200 + absolveValue(state, move);
  return score;
}

function absolveValue(state: GameState, move: Move): number {
  let total = 0;
  for (const id of move.absolve) {
    const piece = pieceById(state, id);
    if (piece) total += VALUE[piece.type];
  }
  return total;
}

function pick(scored: readonly Scored[], spread: number, random: () => number): Move {
  const best = bestOf(scored);
  if (spread <= 0) return best.move;
  const band = scored.filter((item) => best.score - item.score <= spread);
  if (band.length <= 1) return best.move;
  let total = 0;
  const weights = band.map((item) => {
    const weight = spread - (best.score - item.score) + 1;
    total += weight;
    return weight;
  });
  let roll = random() * total;
  for (let i = 0; i < band.length; i += 1) {
    roll -= weights[i];
    if (roll <= 0) return band[i].move;
  }
  return band[band.length - 1].move;
}

function bestOf(scored: readonly Scored[]): Scored {
  let best = scored[0];
  for (const item of scored) {
    if (item.score > best.score) best = item;
  }
  return best;
}

function guard(frame: Frame): void {
  if (!frame.clock) return;
  frame.nodes += 1;
  if ((frame.nodes & 31) === 0 && frame.now() >= frame.deadline) {
    frame.stop = true;
    throw new SearchStopped();
  }
}

function pack(score: number, ply: number): number {
  if (score > MATE - 1000) return score + ply;
  if (score < -MATE + 1000) return score - ply;
  return score;
}

function unpack(score: number, ply: number): number {
  if (score > MATE - 1000) return score - ply;
  if (score < -MATE + 1000) return score + ply;
  return score;
}

