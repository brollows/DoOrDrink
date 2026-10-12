import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Check, Hourglass, RotateCcw, ShieldCheck } from 'lucide-react';
import { Avatar } from '../../components/Avatar';
import { hands, normalizeWord, sipCount, type Hand } from '../../model';
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

/** Seconds left, counted down locally from the server's value so every phone agrees. */
function useCountdown(secondsLeft: number | null | undefined) {
  const [deadline, setDeadline] = useState<number | null>(null);
  const [, setTick] = useState(0);
  useEffect(() => { if (secondsLeft != null) setDeadline(current => current ?? Date.now() + secondsLeft * 1000); }, [secondsLeft]);
  useEffect(() => { const interval = window.setInterval(() => setTick(tick => tick + 1), 250); return () => window.clearInterval(interval); }, []);
  return deadline === null ? null : Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
}

function Countdown({ seconds }: { seconds: number | null }) {
  return <div className={`timer-value countdown ${seconds !== null && seconds <= 10 ? 'urgent' : ''}`} role="timer">{seconds ?? '–'}<span>sekunder igjen</span></div>;
}

/** Topp 5: write single words for the theme before the time runs out. Unsent words are sent automatically at zero. */
function WordEntry({ state, busy, offline, act }: PhaseProps) {
  const { round, task, myResponse } = state;
  const fieldCount = task.answer.words ?? 3;
  const [words, setWords] = useState(() => Array.from({ length: fieldCount }, (_, i) => myResponse?.words?.[i] ?? ''));
  const [sent, setSent] = useState(() => [...(myResponse?.words ?? [])].sort().join());
  const secondsLeft = useCountdown(round.secondsLeft);
  const normalized = [...new Set(words.map(normalizeWord).filter(Boolean))];
  const unsent = normalized.length > 0 && [...normalized].sort().join() !== sent;
  const timeUp = secondsLeft === 0;
  const send = async () => { if (await act('words', { value: normalized })) setSent([...normalized].sort().join()); };
  const autoSent = useRef(false);
  useEffect(() => {
    if (timeUp && unsent && !autoSent.current) { autoSent.current = true; void send(); }
  });

  return (
    <div className="word-entry">
      <Countdown seconds={secondsLeft} />
      <p className="task-description">Tema: <strong>{task.question}</strong></p>
      <form onSubmit={event => { event.preventDefault(); void send(); }}>
        {words.map((word, index) => (
          <input key={index} aria-label={`Ord ${index + 1}`} placeholder={`Ord ${index + 1}`} value={word} maxLength={24}
            autoCapitalize="none" autoComplete="off" autoCorrect="off" spellCheck={false} disabled={timeUp}
            onChange={event => { const value = event.target.value.replace(/\s/g, ''); setWords(current => current.map((w, i) => i === index ? value : w)); }} />
        ))}
        <p className="muted word-hint">Ett ord per felt. Mellomrom er ikke lov.</p>
        <button className="button primary wide" disabled={busy || offline || timeUp || !unsent}>
          {sent ? unsent ? 'Oppdater ordene' : <><Check size={19} /> Ordene er sendt</> : 'Send ordene'}
        </button>
      </form>
      {timeUp && <div className="waiting" role="status"><Hourglass size={19} /> Tiden er ute. {sent ? 'Ordene dine er med.' : 'Du rakk ikke å sende noen ord.'}</div>}
    </div>
  );
}

/** Nest mest: lock in a number. The highest drinks, the second highest wins. */
function NumberPicker({ state, busy, offline, act }: PhaseProps) {
  const { round, task, myResponse } = state;
  const { min, max } = task.answer;
  const [value, setValue] = useState(Math.round((min + max) / 2));
  if (myResponse!.choice !== null) return (
    <div className="answer-saved">
      <span className="large-icon"><Check size={30} /></span>
      <h2>Tallet ditt er låst</h2>
      <strong>{myResponse!.choice}</strong>
      <p className="muted">Høyest tar {sipCount(task)} slurker. Nest høyest vinner.</p>
    </div>
  );
  return (
    <div className="guess-controls">
      <output htmlFor="number-slider" className="guess-value">{value}<span>ditt tall</span></output>
      <input id="number-slider" aria-label="Velg et tall" type="range" min={min} max={max} step="1" value={value} disabled={round.awarded}
        style={{ '--range-progress': `${(value - min) / (max - min) * 100}%` } as CSSProperties} onChange={e => setValue(Number(e.target.value))} />
      <div className="range-labels"><span>{min}</span><span>{max}</span></div>
      <button className="button primary wide" disabled={busy || offline || round.awarded} onClick={() => void act('choose', { value: String(value) })}>Lås inn {value} <Check size={19} /></button>
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

const everyoneTexts: Partial<Record<string, string>> = {
  rps: 'Alle spiller stein, saks, papir', words: 'Alle skriver ord på mobilen', highest: 'Alle velger et tall', stopwatch: 'Alle tar tiden nå',
};

/** Shown to everyone who only watches, including a host who runs the game without playing. */
function Spectator({ state }: { state: PhaseProps['state'] }) {
  const { round, task, performer } = state;
  const finished = round.actual !== null || round.responses.find(q => q.playerId === round.performerId)?.finished;
  const everyoneText = everyoneTexts[task.answer.method] ?? 'Alle er i gang';
  const secondsLeft = useCountdown(round.secondsLeft);
  return (
    <div className="spectator">
      {performer ? <>
        <Avatar player={performer} />
        <h2>{performer.name} {finished ? 'er ferdig!' : task.answer.input === 'counter' ? 'er i gang' : task.answer.method === 'manual' ? 'svarer i appen' : 'tar utfordringen'}</h2>
        <p className="muted">Resultatet avsløres på fasiten. Følg med på oppgaven!</p>
      </> : <>
        {task.answer.method === 'words' ? <>
          <Countdown seconds={secondsLeft} />
          <h2>Tema: {task.question}</h2>
        </> : <span className="large-icon"><TaskIcon task={task} size={34} /></span>}
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
      : method === 'words' && myResponse ? <WordEntry {...props} />
      : method === 'highest' && myResponse ? <NumberPicker {...props} />
      : method === 'rps' && myResponse ? <HandPicker {...props} />
      : entersManually && task.answer.input === 'counter' ? <AttemptCounter {...props} />
      : entersManually ? <ManualEntry {...props} />
      : usesStopwatch && myResponse ? <Stopwatch key={`${round.id}:${me.id}`} game={game} response={myResponse} busy={busy || offline} act={act} />
      : <Spectator state={state} />}
  </>;
}
