import { Check } from 'lucide-react';
import { Avatar } from '../components/Avatar';
import type { RoundState } from './roundState';
import { taskDescription } from '../model';

const visibleWaitingCount = 3;

/** Host-only progress: how many have answered or finished, and who is missing. */
function ResponseStatus({ state }: { state: RoundState }) {
  const { round, ready, readyCount, readyTotal, waitingOn } = state;
  const remaining = readyTotal - readyCount;
  return (
    <div className="side-card response-status">
      <div className="section-title">
        <h3>{round.phase === 'guessing' ? 'Svarstatus' : state.task.answer.method === 'mime' ? 'Gjettet riktig' : state.task.answer.method === 'wavelength' ? 'Har svart' : 'Fullførte'}</h3>
        <strong className="lime">{readyCount}/{readyTotal}</strong>
      </div>
      <div className="progress-track"><span style={{ width: `${readyTotal ? readyCount / readyTotal * 100 : 100}%` }} /></div>
      {ready ? <p className="status-ready"><Check size={16} /> Alle er klare</p> : waitingOn.length > 0 && <>
        <p className="muted">Venter på</p>
        <div className="missing-players">
          {waitingOn.slice(0, visibleWaitingCount).map(p => <span key={p.id}><Avatar player={p} small />{p.name}</span>)}
        </div>
        {remaining > visibleWaitingCount && <p className="muted">og {remaining - visibleWaitingCount} til</p>}
      </>}
    </div>
  );
}

export function RoundSidebar({ state }: { state: RoundState }) {
  const { me, isHost, round, task, performer, canMonitor } = state;
  const showStatus = isHost && canMonitor && (round.phase === 'guessing' || round.phase === 'performing');

  return (
    <aside className="round-sidebar">
      <div className="side-card">
        <span className="eyebrow">DENNE RUNDEN</span>
        <h3>{task.title}</h3>
        <p className="muted">{taskDescription(task, state.game)}</p>
        {performer && <div className="side-performer"><Avatar player={performer} small /><span>{performer.name}</span></div>}
      </div>
      {showStatus && <ResponseStatus state={state} />}
      {!isHost && (
        <div className="side-card">
          <span className="eyebrow">DINE POENG</span>
          <div className="score-total">{me.score}<small>poeng</small></div>
          <p className="muted">Verten styrer når alle går videre.</p>
        </div>
      )}
    </aside>
  );
}
