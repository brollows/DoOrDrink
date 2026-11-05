import { useState, type CSSProperties } from 'react';
import { Check, Hourglass } from 'lucide-react';
import { formatAnswer } from '../../model';
import type { PhaseProps } from './types';

/** Step 2 (challenges): everyone except the performer guesses the result. */
export function GuessingPhase({ state, busy, offline, act }: PhaseProps) {
  const { me, round, task, performer, myResponse } = state;
  const isPerformer = me.id === round.performerId;
  const name = performer?.name ?? '';
  const { min, max, unit, step = 0.1 } = task.answer;
  // Start in the middle, on a value the slider can actually land on.
  const [guess, setGuess] = useState(() => Number((min + Math.round((max - min) / 2 / step) * step).toFixed(6)));

  return <>
    {!myResponse?.submitted && <>
      {/* The heading alone asks the question, with the performer's name in lime. */}
      {isPerformer ? <h1>{task.title}</h1>
        : task.answer.method === 'stopwatch' ? <h1>Hvor rask er<br /><span className="lime">{name}?</span></h1>
        : task.guessQuestion ? <h1 className="guess-question">{task.guessQuestion.split('{name}').map((part, i) => <span key={i}>{i > 0 && <span className="lime">{name}</span>}{part}</span>)}</h1>
        : <h1>Gjett svaret til<br /><span className="lime">{name}?</span></h1>}
    </>}

    {isPerformer ? (
      <div className="waiting"><Hourglass size={20} /> {task.answer.method === 'stopwatch' ? 'De andre gjetter tiden din.' : 'De andre gjetter svaret ditt.'}</div>
    ) : !myResponse ? (
      <div className="waiting"><Hourglass size={20} /> Spillerne gjetter på mobilen sin.</div>
    ) : myResponse.submitted ? (
      <div className="answer-saved">
        <span className="large-icon"><Check size={30} /></span>
        <h2>Svaret er levert</h2>
        <strong>{formatAnswer(myResponse.guess!, task)} <small>{unit}</small></strong>
        <p className="muted">Venter på de andre.</p>
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
