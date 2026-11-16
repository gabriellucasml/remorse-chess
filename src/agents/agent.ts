import type { GameState, Move } from '../engine/types';

/**
 * Contract for a future Remorse Chess agent.
 *
 * The engine is pure: `chooseMove` must not mutate `state`. `moves` is the
 * complete legal action list for the side to move, including every absolution
 * subset (a bishop landing beside guilty friends can cleanse any subset of
 * them, or none). An empty `absolve` list is always a normal move.
 *
 * Wire it in `src/main.ts`:
 *
 *   startApp(document.querySelector('#app')!, {
 *     agents: { white: null, black: myAgent },
 *   });
 *
 * `null` keeps that color on the local human. The UI awaits `chooseMove`
 * when it is the agent's turn and will ignore board input until it resolves.
 */
export interface Agent {
  readonly name: string;
  chooseMove(
    state: GameState,
    moves: readonly Move[],
  ): Promise<Move> | Move;
}
