import { Check, Hourglass, ShieldCheck, Wine } from 'lucide-react';
import { Avatar } from '../../components/Avatar';
import { losersDrink, sipCount } from '../../model';
import type { PhaseProps } from './types';

/** Why this player drinks, as the eyebrow of the red drink screen. */
function drinkReason(state: PhaseProps['state']) {
  const { game, task, recipient, myResponse } = state;
  if (!losersDrink(task)) return `${game.players.find(p => p.id === recipient!.giverId)?.name.toUpperCase()} HAR VALGT DEG`;
  if (myResponse?.choice === null) return 'DU SVARTE IKKE';
  if (task.answer.method === 'highest') return 'DU HADDE HØYEST';
  return task.answer.method === 'rps' ? 'DU TAPTE' : 'DU HAVNET I MINDRETALL';
}

/** Full-screen message for a player who has been given sips or lost. */
function DrinkMessage({ state }: { state: PhaseProps['state'] }) {
  const { me, task } = state;
  const sips = losersDrink(task) ? sipCount(task) : 3;
  return (
    <div className="drink-content">
      <Wine size={60} />
      <span className="eyebrow">{drinkReason(state)}</span>
      <h1>Ta {sips}<br />slurker.</h1>
      <p>Denne er til deg, {me.name}.</p>
      <span className="pill">Venter på neste runde</span>
    </div>
  );
}

/** Lets a round winner pick who receives their sips. */
function RecipientPicker({ state, busy, offline, act }: PhaseProps) {
  const { recipients } = state;
  return (
    <div className="recipient-list">
      <h3>Hvem får dine 3 slurker?</h3>
      <div className="recipient-options" role="region" aria-label="Velg mottaker" tabIndex={0}>
        {recipients.length ? recipients.map(p => (
          <button className="recipient-button" key={p.id} disabled={busy || offline} onClick={() => void act('allocate', { recipientId: p.id })}>
            <Avatar player={p} small /><strong>{p.name}</strong><Wine size={19} /><span>3</span>
          </button>
        )) : <p className="muted">Ingen mottakere igjen. Verten kan gå videre.</p>}
      </div>
    </div>
  );
}

/** Losers drink automatically: everyone else sees who has to drink. */
function LosersDrink({ state }: { state: PhaseProps['state'] }) {
  const { drinkers, task } = state;
  return <>
    <span className="eyebrow">SLURKER</span>
    <h1>{drinkers.length ? 'Skål!' : 'Ingen drikker.'}</h1>
    <p className="task-description">{drinkers.length ? `Disse tar ${sipCount(task)} slurker hver:` : 'Ingen trenger å drikke denne runden.'}</p>
    {drinkers.length > 0 && (
      <div className="giver-list">
        {drinkers.map(p => <div className="giver" key={p.id}><Avatar player={p} small /><strong>{p.name}</strong><Wine size={17} /><span className="allocation-status">{sipCount(task)} slurker</span></div>)}
      </div>
    )}
  </>;
}

/** Right after the reveal: the round's top three hand out sips, or the losers drink. */
export function SipsPhase(props: PhaseProps) {
  const { state } = props;
  const { game, me, round, task, winners, myAllocation, mustDrink } = state;
  if (mustDrink) return <DrinkMessage state={state} />;
  if (losersDrink(task)) return <LosersDrink state={state} />;

  if (!winners.length) return <>
    <span className="eyebrow">SLURKER</span>
    <h1>Ingen deler ut.</h1>
    <p className="task-description">{round.responses.length < 3
      ? 'Med to spillere deler ingen ut slurker i denne typen runde.'
      : 'Ingen fikk poeng denne runden, så ingen deler ut slurker.'}</p>
    <div className="waiting"><Check size={20} /> Klar for {round.number >= game.taskCount ? 'sluttresultatet' : 'neste runde'}.</div>
  </>;

  const hasAllocated = (playerId: string) => round.allocations.some(a => a.giverId === playerId);
  return <>
    <span className="eyebrow">RUNDE VINNERE</span>
    <h1>{round.winners.includes(me.id) ? 'Du deler ut!' : 'Disse deler ut.'}</h1>
    <p className="task-description">{winners.length === 1 ? 'Rundens beste gir' : `De ${winners.length} beste i runden gir`} 3 slurker {winners.length === 1 ? 'til én spiller.' : 'hver til ulike spillere.'}</p>
    <div className="giver-list">
      {winners.map(p => (
        <div className="giver" key={p.id}>
          <Avatar player={p} small /><strong>{p.name}</strong><ShieldCheck size={17} />
          <span className={`allocation-status ${hasAllocated(p.id) ? 'done' : ''}`}>{hasAllocated(p.id) ? 'Har valgt' : 'Velger …'}</span>
        </div>
      ))}
    </div>

    {!round.winners.includes(me.id) ? (
      <div className="waiting"><Hourglass size={19} /> Du deler ikke ut denne runden. {round.allocations.length === winners.length ? 'Alle slurkene er fordelt.' : 'Utdelerne velger mottakere.'}</div>
    ) : myAllocation ? (
      <div className="waiting"><Check size={20} /> Du ga 3 slurker til {game.players.find(p => p.id === myAllocation.recipientId)?.name}</div>
    ) : (
      <RecipientPicker {...props} />
    )}
    <p className="immune-note"><ShieldCheck size={16} /> Utdelerne er immune denne runden.</p>
  </>;
}
