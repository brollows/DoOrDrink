import { Ranking } from '../Ranking';
import type { PhaseProps } from './types';

/** Last step: total standings so far, after the sips are handed out. */
export function LeaderboardPhase({ state }: PhaseProps) {
  return <>
    <span className="eyebrow">SAMMENLAGT ETTER RUNDE {state.round.number}</span>
    <h1>Hvem leder?</h1>
    <Ranking game={state.game} total />
  </>;
}
