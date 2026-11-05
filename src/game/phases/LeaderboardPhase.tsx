import { Ranking } from '../Ranking';
import type { PhaseProps } from './types';

/** Last step of a round (not the last round): the total standings so far. */
export function LeaderboardPhase({ state }: PhaseProps) {
  return <>
    <h1>Poengtavlen.</h1>
    <Ranking game={state.game} total standings />
  </>;
}
