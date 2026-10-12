import { useState, type CSSProperties } from 'react';
import { Check, Hourglass } from 'lucide-react';
import { formatAnswer, guessQuestion } from '../../model';
import type { PhaseProps } from './types';

/** Step 2 (challenges): everyone except the performer guesses the result. */
export function GuessingPhase({ state, busy, offline, act }: PhaseProps) {
  const { me, round, task, performer, myResponse } = state;
  const { min, max, unit, step = 0.1 } = task.answer;
  // Start in the middle, on a value the slider can actually land on.
  const [guess, setGuess] = useState(() => Number((min + Math.round((max - min) / 2 / step) * step).toFixed(6)));

  return <>
    {!myResponse?.submitted && <>
      <span className="eyebrow">HVA TROR DU?</span>
      <h1>{task.answer.method === 'stopwatch' ? 'Hvor rask er' : 'Gjett svaret til'}<br /><span className="lime">{performer?.name}?</span></h1>
      <p className="task-description">{guessQuestion(task, performer?.name ?? '')}</p>
    </>}

    {me.id === round.performerId ? (
      <div className="waiting"><Hourglass size={20} /> De andre gjetter. Snart er det din tur.</div>
    ) : !myResponse ? (
      <div className="waiting"><Hourglass size={20} /> Spillerne gjetter på mobilen sin.</div>
    ) : myResponse.submitted ? (
      <div className="answer-saved">
        <span className="large-icon"><Check size={30} /></span>
        <h2>Svaret er levert</h2>
        <strong>{formatAnswer(myResponse.guess!, task)} <small>{unit}</small></strong>
        <p className="muted">Venter på at verten går videre.</p>
      </div>
    ) : (
      <div className="guess-controls">
        <output htmlFor="guess-slider" className="guess-value">{guess.toLocaleString('nb-NO')}<span>{unit}</span></output>
        <input id="guess-slider" aria-label={`Gjett antall ${unit}`} type="range" min={min} max={max} step={step} value={guess} disabled={round.awarded}
          style={{ '--range-progress': `${(guess - min) / (max - min) * 100}%` } as CSSProperties}
          onChange={e => setGuess(Number(e.target.value))} />
        <div className="range-labels"><span>{min.toLocaleString('nb-NO')} {unit}</span><span>{max.toLocaleString('nb-NO')} {unit}</span></div>
        <button className="button primary wide" disabled={busy || offline || round.awarded} onClick={() => void act('guess', { value: guess })}>Oppgi svar <Check size={19} /></button>
      </div>
    )}
  </>;
}
