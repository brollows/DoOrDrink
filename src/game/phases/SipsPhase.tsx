import { Check, Hourglass, ShieldCheck, Wine } from 'lucide-react';
import { Avatar } from '../../components/Avatar';
import type { PhaseProps } from './types';

/** Full-screen message for a player who has been given sips. */
function DrinkMessage({ state }: { state: PhaseProps['state'] }) {
  const { game, me, recipient } = state;
  const giver = game.players.find(p => p.id === recipient!.giverId);
  return (
    <div className="drink-content">
      <Wine size={60} />
      <span className="eyebrow">{giver?.name.toUpperCase()} HAR VALGT DEG</span>
      <h1>Ta 3<br />slurker.</h1>
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

/** Step 6: the round's top three hand out sips. */
export function SipsPhase(props: PhaseProps) {
  const { state } = props;
  const { game, me, round, winners, recipient, myAllocation } = state;
  if (recipient) return <DrinkMessage state={state} />;

  const hasAllocated = (playerId: string) => round.allocations.some(a => a.giverId === playerId);
  return <>
    <span className="eyebrow">RUNDE VINNERE</span>
    <h1>Del ut slurker.</h1>
    <p className="task-description">Topp tre gir 3 slurker hver. Velg samtidig – førstemann til mølla!</p>
    <div className="giver-list">
      {winners.map(p => (
        <div className="giver" key={p.id}>
          <Avatar player={p} small /><strong>{p.name}</strong><ShieldCheck size={17} />
          <span className={`allocation-status ${hasAllocated(p.id) ? 'done' : ''}`}>{hasAllocated(p.id) ? 'Har valgt' : 'Velger …'}</span>
        </div>
      ))}
    </div>

    {!round.winners.includes(me.id) ? (
      <div className="waiting"><Hourglass size={19} /> Vinnerne velger hvem som får slurker.</div>
    ) : myAllocation ? (
      <div className="waiting"><Check size={20} /> Du ga 3 slurker til {game.players.find(p => p.id === myAllocation.recipientId)?.name}</div>
    ) : (
      <RecipientPicker {...props} />
    )}
    <p className="immune-note"><ShieldCheck size={16} /> Utdelerne er immune denne runden.</p>
  </>;
}
