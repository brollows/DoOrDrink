import { formatTime } from '../../model';
import { Ranking } from '../Ranking';
import type { PhaseProps } from './types';

/** Step 4: the actual result and this round's points. */
export function RevealPhase({ state }: PhaseProps) {
  const { game, round, task, performer } = state;
  const { min, max, unit, method, target } = task.answer;

  return <>
    <span className="eyebrow">ØYEBLIKKET ER HER</span>
    <h1>Fasiten.</h1>
    {task.kind === 'individual' ? (
      <div className="reveal-value">
        <span>{performer?.name}{method === 'stopwatch' ? ' brukte' : ' sitt resultat'}</span>
        <strong>{round.actual === null ? '–' : formatTime(Math.max(min, Math.min(round.actual, max)))}<small>{unit}</small></strong>
        <p className="muted">
          {round.actual === null ? 'Oppgaven ble ikke fullført. Ingen poeng denne runden.'
            : round.actual > max ? `Over ${max} ${unit}. Gjettingene vurderes mot ${max}.`
            : 'Så godt kjente dere hverandre.'}
        </p>
      </div>
    ) : (
      <p className="task-description">Målet var {formatTime(target!)} {unit}. Hvem traff best?</p>
    )}
    <Ranking game={game} />
  </>;
}
