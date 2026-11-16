import { describe, expect, it } from 'vitest';
import { legalMoves, loadPosition, play, positionKey, squareName, type Move } from '../src/engine';
import { searchMove } from '../src/agents/search';

const quiet = { budgetMs: 5_000, maxDepth: 2, spread: 0, now: () => 0 };

function name(move: Move): string {
  return `${squareName(move.from)}${squareName(move.to)}`;
}

describe('alpha-beta', () => {
  it('escolhe um lance legal e não mexe na posição', () => {
    const state = loadPosition({
      pieces: [
        { sq: 'e1', type: 'k', color: 'w' },
        { sq: 'e2', type: 'p', color: 'w' },
        { sq: 'e8', type: 'k', color: 'b' },
      ],
    });
    const key = positionKey(state);
    const move = searchMove(state, legalMoves(state), quiet);
    expect(legalMoves(state).some((candidate) => candidate.from === move.from && candidate.to === move.to)).toBe(true);
    expect(positionKey(state)).toBe(key);
    expect(state.history).toHaveLength(0);
  });

  it('dá o mate em um', () => {
    const state = loadPosition({
      pieces: [
        { sq: 'b6', type: 'k', color: 'w' },
        { sq: 'h1', type: 'r', color: 'w' },
        { sq: 'a8', type: 'k', color: 'b' },
      ],
    });
    const move = searchMove(state, legalMoves(state), { ...quiet, maxDepth: 1 });
    expect(name(move)).toBe('h1h8');
    expect(play(state, move).state.result).toEqual({ kind: 'checkmate', winner: 'w' });
  });

  it('toma a dama solta', () => {
    const state = loadPosition({
      pieces: [
        { sq: 'e1', type: 'k', color: 'w' },
        { sq: 'c3', type: 'n', color: 'w' },
        { sq: 'e8', type: 'k', color: 'b' },
        { sq: 'd5', type: 'q', color: 'b' },
      ],
    });
    const move = searchMove(state, legalMoves(state), { ...quiet, maxDepth: 1 });
    expect(name(move)).toBe('c3d5');
  });

  it('repete o melhor lance quando a faixa é zero', () => {
    const state = loadPosition({
      pieces: [
        { sq: 'e1', type: 'k', color: 'w' },
        { sq: 'd1', type: 'q', color: 'w' },
        { sq: 'a2', type: 'p', color: 'w' },
        { sq: 'e8', type: 'k', color: 'b' },
        { sq: 'h8', type: 'r', color: 'b' },
      ],
    });
    const moves = legalMoves(state);
    const first = searchMove(state, moves, quiet);
    const second = searchMove(state, moves, quiet);
    expect(name(first)).toBe(name(second));
  });

  it('para no orçamento e ainda devolve um lance legal', () => {
    const state = loadPosition({
      pieces: [
        { sq: 'e1', type: 'k', color: 'w' },
        { sq: 'e2', type: 'p', color: 'w' },
        { sq: 'e8', type: 'k', color: 'b' },
      ],
    });
    let ticks = 0;
    const move = searchMove(state, legalMoves(state), {
      budgetMs: 30,
      maxDepth: 4,
      spread: 0,
      now: () => {
        ticks += 1;
        return ticks < 3 ? 0 : 100;
      },
    });
    expect(legalMoves(state).some((candidate) => candidate.from === move.from && candidate.to === move.to)).toBe(true);
  });
});
