import { useState } from 'react';
import { Check, Hourglass, RotateCcw, ShieldCheck } from 'lucide-react';
import { Avatar } from '../../components/Avatar';
import { hands, type Hand } from '../../model';
import { Stopwatch } from '../Stopwatch';
import { HandIcon, TaskIcon } from '../TaskIcon';
import type { PhaseProps } from './types';

const handOrder: Hand[] = ['rock', 'paper', 'scissors'];

/** Lets the host or performer type in the result for tasks without a stopwatch. */
function ManualEntry({ state, busy, offline, act }: PhaseProps) {
  const { round, task } = state;
  const [value, setValue] = useState('');
  const saved = round.responses.find(q => q.playerId === round.performerId)?.finished;
  const secret = task.answer.enteredBy !== 'host';

  return (
    <div className="manual-entry">
      {saved ? <div className="waiting"><Check size={20} /> Fasiten er lagret</div> : (
        <form onSubmit={event => { event.preventDefault(); void act('manual_result', { value: Number(value.replace(',', '.')) }); }}>
          <label htmlFor="manual-result">{task.question ? `${task.question} (${task.answer.unit})` : `Oppgi fasit i ${task.answer.unit}`}</label>
          <input id="manual-result" inputMode="decimal" required value={value} onChange={event => setValue(event.target.value)} />
          {secret && <p className="muted manual-hint">Ikke si svaret høyt. De andre har allerede gjettet.</p>}
          <button className="button primary wide" disabled={busy || offline || round.awarded}>Lagre fasit</button>
        </form>
      )}
    </div>
  );
}

/**
 * The performer taps once per failed attempt and "Klarte det!" on success, which saves the total.
 * The count survives a reload, like the stopwatch.
 */
function AttemptCounter({ state, busy, offline, act }: PhaseProps) {
  const { round } = state;
  const storageKey = `do-or-drink-attempts:${round.id}`;
  const [misses, setMisses] = useState(() => Number(localStorage.getItem(storageKey)) || 0);
  const saved = round.responses.find(q => q.playerId === round.performerId)?.finished;
  const update = (value: number) => { setMisses(value); localStorage.setItem(storageKey, String(value)); };
  const succeed = async () => {
    if (await act('manual_result', { value: misses + 1 })) localStorage.removeItem(storageKey);
  };
  const disabled = busy || offline || round.awarded;

  if (saved) return <div className="waiting"><Check size={20} /> Antall forsøk er lagret</div>;
  return (
    <div className="attempt-counter">
      <div className="timer-value">{misses + 1}<span>{misses ? `forsøk nå · ${misses} bom` : 'første forsøk'}</span></div>
      <div className="choice-buttons">
        <button className="button primary wide" disabled={disabled} onClick={() => void succeed()}><Check size={19} /> Klarte det!</button>
        <button className="button secondary wide" disabled={disabled} onClick={() => update(misses + 1)}>Bom, prøv igjen</button>
      </div>
      {misses > 0 && <button className="undo-button" disabled={disabled} onClick={() => update(misses - 1)}><RotateCcw size={15} /> Angre siste bom</button>}
      <p className="muted">Ikke si antallet høyt. De andre ser det på fasiten.</p>
    </div>
  );
}

/** Rock, paper, scissors against the assigned opponent or the machine. A tie means choosing again. */
function HandPicker({ state, busy, offline, act }: PhaseProps) {
  const { game, round, myResponse } = state;
  const opponent = game.players.find(p => p.id === myResponse!.opponentId);
  const opponentResponse = round.responses.find(q => q.playerId === myResponse!.opponentId);
  const opponentName = opponent?.name ?? 'Maskinen';
  const { choice, tieChoice } = myResponse!;

  if (choice) return (
    <div className="answer-saved">
      <span className="large-icon"><HandIcon hand={choice as Hand} size={34} /></span>
      <h2>Du valgte {hands[choice as Hand].toLowerCase()}</h2>
      <p className="muted">{opponent && !opponentResponse?.finished ? `Venter på at ${opponentName} velger …` : 'Vinneren avsløres på fasiten.'}</p>
    </div>
  );
  return <>
    <p className="task-description">Du møter <strong>{opponentName}</strong>. Velg hånd.</p>
    {tieChoice && <div className="waiting tie-note" role="status">Uavgjort! Dere valgte begge {hands[tieChoice as Hand].toLowerCase()}. Velg på nytt.</div>}
    <div className="hand-buttons">
      {handOrder.map(hand => (
        <button key={hand} className="hand-button" disabled={busy || offline || round.awarded} onClick={() => void act('choose', { value: hand })}>
          <HandIcon hand={hand} size={34} /><span>{hands[hand]}</span>
        </button>
      ))}
    </div>
  </>;
}

/** Would you rather: pick one of two options. */
function OptionPicker({ state, busy, offline, act }: PhaseProps) {
  const { round, task, myResponse } = state;
  const chosen = myResponse?.choice ?? null;
  return <>
    <div className="option-buttons">
      {task.options!.map((text, index) => (
        <button key={index} className={`option-button ${chosen === String(index) ? 'selected' : ''}`}
          disabled={!myResponse || chosen !== null || busy || offline || round.awarded}
          aria-pressed={chosen === String(index)} onClick={() => void act('choose', { value: String(index) })}>
          <span className="option-letter">{index === 0 ? 'A' : 'B'}</span><span>{text}</span>
        </button>
      ))}
    </div>
    {chosen !== null && <div className="waiting"><Check size={20} /> Valget ditt er lagret. Venter på de andre.</div>}
    {!myResponse && <div className="waiting"><Hourglass size={20} /> Spillerne velger på mobilen sin.</div>}
  </>;
}

/** Shown to everyone who only watches, including a host who runs the game without playing. */
function Spectator({ state }: { state: PhaseProps['state'] }) {
  const { round, task, performer } = state;
  const finished = round.actual !== null || round.responses.find(q => q.playerId === round.performerId)?.finished;
  const everyoneText = task.answer.method === 'rps' ? 'Alle spiller stein, saks, papir' : 'Alle tar tiden nå';
  return (
    <div className="spectator">
      {performer ? <>
        <Avatar player={performer} />
        <h2>{performer.name} {finished ? 'er ferdig!' : task.answer.input === 'counter' ? 'er i gang' : task.answer.method === 'manual' ? 'svarer i appen' : 'tar utfordringen'}</h2>
        <p className="muted">Resultatet avsløres på fasiten. Følg med på oppgaven!</p>
      </> : <>
        <span className="large-icon"><TaskIcon task={task} size={34} /></span>
        <h2>{everyoneText}</h2>
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
  const { method } = task.answer;
  const isPerformer = me.id === round.performerId;
  const entersManually = method === 'manual' && (task.answer.enteredBy === 'host' ? isHost : isPerformer);
  const usesStopwatch = method === 'stopwatch' && (task.kind === 'everyone' || isPerformer);

  return <>
    <span className="eyebrow">{task.kind === 'everyone' ? 'NÅ GJELDER DET' : `${performer?.name.toUpperCase()} SIN TUR`}</span>
    <h1>{task.title}</h1>
    {method === 'choice' ? <OptionPicker {...props} />
      : method === 'rps' && myResponse ? <HandPicker {...props} />
      : entersManually && task.answer.input === 'counter' ? <AttemptCounter {...props} />
      : entersManually ? <ManualEntry {...props} />
      : usesStopwatch && myResponse ? <Stopwatch key={`${round.id}:${me.id}`} game={game} response={myResponse} busy={busy || offline} act={act} />
      : <Spectator state={state} />}
  </>;
}
