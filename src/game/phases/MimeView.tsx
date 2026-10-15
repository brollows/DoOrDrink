import { useEffect, useRef, useState } from 'react';
import { Check, Drama, Hourglass, Play, RefreshCw, X } from 'lucide-react';
import { formatTime, mimeSuggestions, type Round } from '../../model';
import { Countdown, useCountdown } from '../Countdown';
import type { PhaseProps } from './types';

const lengthHintAt = 60;
const letterHintAt = 30;

/** Strips spaces as you type: both the word and the guesses are one word. */
const oneWord = (value: string) => value.replace(/\s/g, '');
const wordInputProps = { maxLength: 24, autoCapitalize: 'none', autoComplete: 'off', autoCorrect: 'off', spellCheck: false } as const;

/** Fetches the hints from the server as soon as they are due. Retries every second until they arrive. */
function useHintRefresh(round: Round, seconds: number | null, refresh?: () => Promise<void>) {
  const due = seconds !== null && ((seconds <= lengthHintAt && !round.wordLength) || (seconds <= letterHintAt && !round.firstLetter));
  useEffect(() => { if (due) void refresh?.(); }, [due, seconds, refresh]);
}

/** Letter tiles: hidden until 60 seconds left, the first letter at 30 seconds left. */
function LetterHint({ round, seconds }: { round: Round; seconds: number | null }) {
  const { wordLength, firstLetter } = round;
  const wait = (at: number) => Math.max(0, (seconds ?? 0) - at);
  return (
    <div className="mime-hint" aria-live="polite">
      {wordLength ? (
        <div className="letter-tiles" aria-label={`${wordLength} bokstaver${firstLetter ? `, starter på ${firstLetter}` : ''}`}>
          {Array.from({ length: wordLength }, (_, i) => <span key={i}>{i === 0 && firstLetter ? firstLetter : ''}</span>)}
        </div>
      ) : <div className="letter-tiles pending" aria-hidden="true"><span>?</span></div>}
      <p className="muted">
        {!wordLength ? `Antall bokstaver vises om ${wait(lengthHintAt)} s`
          : !firstLetter ? `${wordLength} bokstaver · første bokstav om ${wait(letterHintAt)} s`
          : `${wordLength} bokstaver · starter på ${firstLetter}`}
      </p>
    </div>
  );
}

/** Who has guessed the word so far. */
function CorrectSoFar({ state }: { state: PhaseProps['state'] }) {
  const { game, round } = state;
  const guessers = round.responses.filter(q => q.playerId !== round.performerId);
  const correct = guessers.filter(q => q.finished).map(q => game.players.find(p => p.id === q.playerId)?.name);
  return (
    <p className="mime-progress">
      <strong className="lime">{correct.length}/{guessers.length}</strong> har gjettet riktig{correct.length > 0 && `: ${correct.join(', ')}`}
    </p>
  );
}

/** The performer picks a suggested word or writes their own. */
function WordPicker({ state, busy, offline, act, onDone }: PhaseProps & { onDone: () => void }) {
  const { round } = state;
  const [word, setWord] = useState('');
  const disabled = busy || offline || round.awarded;
  const choose = async (value: string) => { if (await act('mime_word', { value })) onDone(); };
  return (
    <div className="mime">
      <p className="task-description">Velg et ord å mime, eller finn på et selv. <strong>Bare ett ord.</strong></p>
      <div className="mime-suggestions">
        {mimeSuggestions(round.id).map(({ level, word: suggestion }) => (
          <button key={level} className="option-button" aria-label={`${level}: ${suggestion}`} disabled={disabled} onClick={() => void choose(suggestion)}>
            <span className="mime-level">{level}</span><strong>{suggestion}</strong>
          </button>
        ))}
      </div>
      <form className="mime-form" onSubmit={event => { event.preventDefault(); void choose(word); }}>
        <label htmlFor="mime-word">Eget ord</label>
        <input id="mime-word" placeholder="Ett ord" value={word} {...wordInputProps} onChange={event => setWord(oneWord(event.target.value))} />
        <p className="muted word-hint">Ett ord, uten mellomrom. De andre ser ikke ordet.</p>
        <button className="button secondary wide" disabled={disabled || !word}>Bruk dette ordet</button>
      </form>
    </div>
  );
}

function Performer(props: PhaseProps) {
  const { state, busy, offline, act } = props;
  const { round } = state;
  const [picking, setPicking] = useState(false);
  const seconds = useCountdown(round.secondsLeft);
  const started = round.secondsLeft != null;

  if (!started && (!round.word || picking)) return <WordPicker {...props} onDone={() => setPicking(false)} />;
  return (
    <div className="mime">
      {started && <Countdown seconds={seconds} />}
      <div className="private-result mime-word"><span>Ditt ord</span><strong>{round.word}</strong></div>
      {started ? <>
        <CorrectSoFar state={state} />
        {seconds === 0 ? <div className="waiting" role="status"><Hourglass size={19} /> Tiden er ute. Verten går videre til fasiten.</div>
          : <p className="muted">Ikke si noe. Bare mim!</p>}
      </> : <>
        <p className="muted">Når du trykker start, har de andre 120 sekunder på å gjette. Ikke si noe, bare mim!</p>
        <div className="choice-buttons">
          <button className="button primary wide timer-button" disabled={busy || offline || round.awarded} onClick={() => void act('mime_start')}><Play size={21} /> Start mimingen</button>
          <button className="button secondary wide" disabled={busy || offline} onClick={() => setPicking(true)}><RefreshCw size={18} /> Bytt ord</button>
        </div>
      </>}
    </div>
  );
}

function Guesser({ state, busy, offline, act, refresh }: PhaseProps) {
  const { round, performer, myResponse } = state;
  const [guess, setGuess] = useState('');
  const [wrong, setWrong] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const seconds = useCountdown(round.secondsLeft);
  useHintRefresh(round, seconds, refresh);
  const started = round.secondsLeft != null;
  const timeUp = seconds === 0;
  const send = async () => {
    const value = guess;
    if (await act('mime_guess', { value })) { setWrong(value); setGuess(''); }
    input.current?.focus();
  };

  if (!started) return (
    <div className="mime">
      <span className="large-icon"><Drama size={34} /></span>
      <h2>{performer?.name} velger et ord …</h2>
      <p className="muted">Når mimingen starter, har du 120 sekunder. Svaret er <strong>ett ord</strong>, og du kan gjette så mange ganger du vil.</p>
    </div>
  );
  if (myResponse!.finished) return (
    <div className="answer-saved">
      <span className="large-icon"><Check size={30} /></span>
      <h2>Riktig!</h2>
      <strong>{formatTime(myResponse!.actual ?? 0)} <small>sekunder</small></strong>
      <p className="muted">Så lang tid brukte du. Raskest får mest poeng.</p>
      <CorrectSoFar state={state} />
    </div>
  );
  return (
    <div className="mime">
      <Countdown seconds={seconds} />
      <LetterHint round={round} seconds={seconds} />
      {timeUp ? <div className="waiting" role="status"><Hourglass size={19} /> Tiden er ute. Ordet avsløres på fasiten.</div> : (
        <form className="mime-form" onSubmit={event => { event.preventDefault(); void send(); }}>
          <input ref={input} aria-label="Ditt svar" placeholder="Ett ord" value={guess} enterKeyHint="send" {...wordInputProps}
            onChange={event => { setGuess(oneWord(event.target.value)); setWrong(null); }} />
          {wrong ? <p className="mime-wrong" role="status"><X size={16} /> «{wrong}» er feil. Prøv igjen.</p>
            : <p className="muted word-hint">Svaret er ett ord. Store og små bokstaver spiller ingen rolle.</p>}
          <button className="button primary wide" disabled={busy || offline || !guess}>Gjett</button>
        </form>
      )}
      <CorrectSoFar state={state} />
    </div>
  );
}

/** A host who does not play: the countdown, the hints and who has guessed it. */
function Watcher({ state, refresh }: PhaseProps) {
  const { round, performer } = state;
  const seconds = useCountdown(round.secondsLeft);
  useHintRefresh(round, seconds, refresh);
  if (round.secondsLeft == null) return (
    <div className="mime">
      <span className="large-icon"><Drama size={34} /></span>
      <h2>{performer?.name} velger et ord …</h2>
      <p className="muted">De andre gjetter på mobilen sin når mimingen starter.</p>
    </div>
  );
  return (
    <div className="mime">
      <Countdown seconds={seconds} />
      <LetterHint round={round} seconds={seconds} />
      <CorrectSoFar state={state} />
    </div>
  );
}

/** Mim det: the performer picks a word and mimes it, the others guess before the time runs out. */
export function MimeView(props: PhaseProps) {
  const { state } = props;
  if (state.me.id === state.round.performerId) return <Performer {...props} />;
  if (state.myResponse) return <Guesser {...props} />;
  return <Watcher {...props} />;
}
