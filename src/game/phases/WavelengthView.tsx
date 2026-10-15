import { Check, Eye, Hourglass, X } from 'lucide-react';
import { Avatar } from '../../components/Avatar';
import { wavelengthStatus, wlStreak } from '../../model';
import type { PhaseProps } from './types';

/** After each question: everyone who was still in, and whether they answered like the performer. */
function QuestionResult({ state }: { state: PhaseProps['state'] }) {
  const { game, round } = state;
  const { step, fasit, alive } = wavelengthStatus(round);
  return (
    <ul className="wl-results" aria-label="Svarene på dette spørsmålet">
      {alive.map(q => {
        const player = game.players.find(p => p.id === q.playerId)!;
        const hit = q.answers?.[step] === fasit[step];
        return (
          <li key={q.playerId} className={`${hit ? 'hit' : 'miss'} ${q.playerId === game.meId ? 'is-me' : ''}`}>
            <Avatar player={player} small />
            <span>{player.name}{q.playerId === game.meId && ' (deg)'}</span>
            {hit ? <><Check size={18} /><span className="sr-only">likt</span></> : <><X size={18} /><span className="sr-only">ute</span></>}
          </li>
        );
      })}
    </ul>
  );
}

/** Samme bølgelengde: answer five questions like the chosen player. A different answer puts you out. */
export function WavelengthView({ state, busy, offline, act }: PhaseProps) {
  const { me, isHost, round, performer, myResponse } = state;
  const status = wavelengthStatus(round);
  const { step, total, shown, done, fasit, guessers, alive, survivors, question } = status;
  const isPerformer = me.id === round.performerId;
  const myAnswer = myResponse?.answers?.[step] ?? null;
  const out = Boolean(myResponse) && !isPerformer && !alive.some(q => q.playerId === me.id);
  const justOut = !isPerformer && shown && alive.some(q => q.playerId === me.id) && !survivors.some(q => q.playerId === me.id);
  const canAnswer = Boolean(myResponse) && !shown && myAnswer === null && !out;
  const required = [round.responses.find(q => q.playerId === round.performerId), ...alive];
  const answered = required.filter(q => q?.answers?.[step] != null).length;
  const disabled = busy || offline || round.awarded;
  const left = shown ? survivors.length : alive.length;

  return (
    <div className="wavelength">
      {performer && (
        <div className="performer-card wl-performer">
          <Avatar player={performer} />
          <div>
            <strong>{isPerformer ? 'Du er fasiten' : `Svar likt som ${performer.name}`}</strong>
            <span>{isPerformer ? 'De andre prøver å svare likt som deg' : `${performer.name} er fasiten`}</span>
          </div>
        </div>
      )}
      <div className="wl-meta">
        <span>Spørsmål {step + 1} av {total}</span>
        <span><strong className="lime">{left}/{guessers.length}</strong> igjen</span>
      </div>
      <h2 className="wl-question">{question?.question}</h2>
      <div className="option-buttons">
        {question?.options.map((text, index) => {
          const value = String(index);
          const isFasit = shown && fasit[step] === value;
          return (
            <button key={index} className={`option-button ${myAnswer === value ? 'selected' : ''} ${isFasit ? 'fasit' : ''}`}
              disabled={!canAnswer || disabled} aria-pressed={myAnswer === value} onClick={() => void act('wl_answer', { value })}>
              <span className="option-letter">{index === 0 ? 'A' : 'B'}</span>
              <span>{text}</span>
              {isFasit && <span className="wl-tag">{performer?.name}</span>}
            </button>
          );
        })}
      </div>

      {shown ? <>
        {isPerformer ? <p className="wl-note">{survivors.length} av {alive.length} svarte likt som deg.</p>
          : justOut ? <p className="wl-note miss"><X size={18} /> Du svarte ulikt og er ute. Du fikk {step} poeng.</p>
          : out ? <p className="wl-note">Du er ute. Du fikk {wlStreak(myResponse?.answers, fasit, step)} poeng.</p>
          : myResponse ? <p className="wl-note hit"><Check size={18} /> Likt! Du er fortsatt med.</p> : null}
        <QuestionResult state={state} />
        {done ? <div className="waiting" role="status"><Check size={19} /> Runden er ferdig. {isHost ? 'Gå videre til fasiten.' : 'Verten går videre til fasiten.'}</div>
          : isHost ? <button className="button primary wide wl-next" disabled={disabled} onClick={() => void act('wl_next', { step })}>Neste spørsmål</button>
          : <div className="waiting"><Hourglass size={19} /> Venter på at verten viser neste spørsmål.</div>}
      </> : <>
        {out ? <div className="waiting"><X size={19} /> Du er ute. Du fikk {wlStreak(myResponse?.answers, fasit, step)} poeng. Følg med på de andre!</div>
          : myAnswer !== null ? <div className="waiting" role="status"><Check size={19} /> Svaret er låst. {answered}/{required.length} har svart.</div>
          : <p className="muted wl-hint">{isPerformer ? 'Svar ærlig. De andre ser ikke svaret ditt før alle har svart.' : 'Svarer du ulikt, er du ute.'}</p>}
        {isHost && fasit[step] != null && answered < required.length && (
          <button className="button secondary wide wl-next" disabled={disabled} onClick={() => void act('wl_reveal', { step })}><Eye size={18} /> Vis svaret nå</button>
        )}
        {!myResponse && <div className="waiting"><Hourglass size={19} /> {answered}/{required.length} har svart.</div>}
      </>}
    </div>
  );
}
