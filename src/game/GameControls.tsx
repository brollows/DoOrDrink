import { ChevronLeft, Flag, Hourglass } from 'lucide-react';
import { phaseNames } from '../model';
import type { ConfirmKind } from './ConfirmDialog';
import type { RoundState } from './roundState';
import type { Act } from './useGame';

type Props = {
  state: RoundState;
  busy: boolean;
  offline: boolean;
  act: Act;
  onConfirm: (kind: ConfirmKind) => void;
};

/** Bottom bar for the host: step back, go forward and end the game. */
export function HostControls({ state, busy, offline, act, onConfirm }: Props) {
  const { round, ready, readyCount, readyTotal, canMonitor } = state;
  const disabled = busy || offline;
  // Moving on before everyone is done needs a confirmation.
  const next = () => { if (!ready && !round.awarded) onConfirm('next'); else void act('next'); };
  const nextLabel = round.phase === 'sips' ? 'Neste runde' : round.phase === 'assignment' && !round.accepted ? 'Hopp over' : 'Gå videre';

  return (
    <footer className="host-controls">
      <button className="back-button" aria-label="Forrige steg" disabled={disabled || round.phase === 'assignment'} onClick={() => void act('back')}><ChevronLeft size={22} /></button>
      <div><span>DU ER VERT</span><strong>{phaseNames[round.phase]}</strong></div>
      <button className={`button next-button ${ready ? 'primary' : 'not-ready'}`} disabled={disabled} onClick={next}>
        {nextLabel}
        {canMonitor && readyTotal > 0 && <span className="counter">{readyCount}/{readyTotal}</span>}
      </button>
      <button className="end-button" aria-label="Avslutt spillet" disabled={disabled} onClick={() => onConfirm('end')}><Flag size={19} /></button>
    </footer>
  );
}

export function PlayerControls() {
  return <footer className="player-controls"><Hourglass size={16} /><span>Verten går videre når dere er klare</span></footer>;
}
