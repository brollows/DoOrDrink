import { useState } from 'react';
import { Check, ShieldCheck, Timer } from 'lucide-react';
import { Avatar } from '../../components/Avatar';
import { Stopwatch } from '../Stopwatch';
import type { PhaseProps } from './types';

/** Lets the host or performer type in the result for tasks without a stopwatch. */
function ManualEntry({ state, busy, offline, act }: PhaseProps) {
  const { round, task } = state;
  const [value, setValue] = useState('');
  const saved = round.responses.find(q => q.playerId === round.performerId)?.finished;

  return (
    <div className="manual-entry">
      {saved ? <div className="waiting"><Check size={20} /> Fasiten er lagret</div> : (
        <form onSubmit={event => { event.preventDefault(); void act('manual_result', { value: Number(value.replace(',', '.')) }); }}>
          <label htmlFor="manual-result">Oppgi fasit i {task.answer.unit}</label>
          <input id="manual-result" inputMode="decimal" required value={value} onChange={event => setValue(event.target.value)} />
          <button className="button primary wide" disabled={busy || offline || round.awarded}>Lagre fasit</button>
        </form>
      )}
    </div>
  );
}

/** Shown to everyone who only watches, including a host who runs the game without playing. */
function Spectator({ state }: { state: PhaseProps['state'] }) {
  const { round, performer } = state;
  const finished = round.actual !== null || round.responses.find(q => q.playerId === round.performerId)?.finished;
  return (
    <div className="spectator">
      {performer ? <>
        <Avatar player={performer} />
        <h2>{performer.name} {finished ? 'er ferdig!' : 'tar utfordringen'}</h2>
        <p className="muted">Resultatet avsløres på fasiten. Følg med på oppgaven!</p>
      </> : <>
        <span className="large-icon"><Timer size={34} /></span>
        <h2>Alle tar tiden nå</h2>
        <p className="muted">Resultatene avsløres på fasiten.</p>
      </>}
      <span className="locked-result"><ShieldCheck size={20} /> Fasiten er skjult</span>
    </div>
  );
}

/** Step 3: the task is carried out and the result recorded. */
export function PerformingPhase(props: PhaseProps) {
  const { state, busy, offline, act } = props;
  const { game, me, isHost, round, task, performer, myResponse } = state;
  const isPerformer = me.id === round.performerId;
  const entersManually = task.answer.method === 'manual' && (task.answer.enteredBy === 'host' ? isHost : isPerformer);
  const usesStopwatch = task.answer.method === 'stopwatch' && (task.kind === 'everyone' || isPerformer);

  return <>
    <span className="eyebrow">{task.kind === 'everyone' ? 'NÅ GJELDER DET' : `${performer?.name.toUpperCase()} SIN TUR`}</span>
    <h1>{task.title}</h1>
    {entersManually ? <ManualEntry {...props} />
      : usesStopwatch && myResponse ? <Stopwatch key={`${round.id}:${me.id}`} game={game} response={myResponse} busy={busy || offline} act={act} />
      : <Spectator state={state} />}
  </>;
}
