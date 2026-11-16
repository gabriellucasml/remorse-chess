import type { GameState, Move } from '../engine/types';

/**
 * Contract for a Remorse Chess agent.
 *
 * The engine is pure: `chooseMove` must not mutate `state`. `moves` is the
 * complete legal action list for the side to move, including every absolution
 * subset (a bishop landing beside guilty friends can cleanse any subset of
 * them, or none). An empty `absolve` list is always a normal move.
 *
 * The Mesa control seats `createSearchAgent` (`search.ts`) on Black at Fácil,
 * Médio or Difícil. Pessoas leaves both colors with the human. The UI awaits
 * `chooseMove` on the agent's turn and ignores the board until it resolves.
 */
export interface Agent {
  readonly name: string;
  chooseMove(
    state: GameState,
    moves: readonly Move[],
  ): Promise<Move> | Move;
}
