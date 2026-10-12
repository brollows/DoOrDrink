import { useState, type CSSProperties } from 'react';
import { Check, Hourglass } from 'lucide-react';
import { formatTime } from '../../model';
import type { PhaseProps } from './types';

/** Step 2 (individual tasks): everyone except the performer guesses the result. */
export function GuessingPhase({ state, busy, offline, act }: PhaseProps) {
  const { me, round, task, performer, myResponse } = state;
  const { min, max, unit } = task.answer;
  const [guess, setGuess] = useState((min + max) / 2);

  return <>
    {!myResponse?.submitted && <>
      <span className="eyebrow">HVA TROR DU?</span>
      <h1>{task.answer.method === 'stopwatch' ? 'Hvor rask er' : 'Gjett resultatet til'}<br /><span className="lime">{performer?.name}?</span></h1>
      <p className="task-description">{task.id === 'beer' ? `Hvor mange sekunder bruker ${performer?.name} på å drikke ølen?` : `Oppgi ditt tips i ${unit}.`}</p>
    </>}

    {me.id === round.performerId ? (
      <div className="waiting"><Hourglass size={20} /> De andre gjetter. Snart er det din tur.</div>
    ) : !myResponse ? (
      <div className="waiting"><Hourglass size={20} /> Spillerne gjetter på mobilen sin.</div>
    ) : myResponse.submitted ? (
      <div className="answer-saved">
        <span className="large-icon"><Check size={30} /></span>
        <h2>Svaret er levert</h2>
        <strong>{formatTime(myResponse.guess!)} <small>{unit}</small></strong>
        <p className="muted">Venter på at verten går videre.</p>
      </div>
    ) : (
      <div className="guess-controls">
        <output htmlFor="guess-slider" className="guess-value">{guess.toLocaleString('nb-NO')}<span>{unit}</span></output>
        <input id="guess-slider" aria-label={`Gjett antall ${unit}`} type="range" min={min} max={max} step="0.1" value={guess} disabled={round.awarded}
          style={{ '--range-progress': `${(guess - min) / (max - min) * 100}%` } as CSSProperties}
          onChange={e => setGuess(Number(e.target.value))} />
        <div className="range-labels"><span>{min} {unit}</span><span>{max} {unit}</span></div>
        <button className="button primary wide" disabled={busy || offline || round.awarded} onClick={() => void act('guess', { value: guess })}>Oppgi svar <Check size={19} /></button>
      </div>
    )}
  </>;
}
