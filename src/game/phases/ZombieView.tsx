import { useEffect, useMemo } from 'react';
import { Check, Hourglass, Skull } from 'lucide-react';
import { Avatar } from '../../components/Avatar';
import type { Player } from '../../model';
import { Countdown, useCountdown } from '../Countdown';
import type { PhaseProps } from './types';

/** Players in a new random order for every bite round, so nobody just picks the top name. */
function shuffled(players: Player[], seed: string) {
  const score = (id: string) => { let hash = 0; for (const char of seed + id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0; return hash; };
  return [...players].sort((a, b) => score(a.id) - score(b.id));
}

/**
 * Asks the server to resolve the bite round when the countdown has run out. The server only acts after its own
 * deadline (one second after the phones reach zero), so this retries until the round moves on.
 */
function useZombieTick({ state, act }: PhaseProps, seconds: number | null) {
  const { round } = state;
  const timeUp = seconds === 0;
  useEffect(() => {
    if (!timeUp) return;
    const interval = window.setInterval(() => void act('zombie_tick'), 1200);
    return () => window.clearInterval(interval);
  }, [timeUp, act, round.zombieStep]);
}

function ZombieRound(props: PhaseProps) {
  const { state, busy, offline, act } = props;
  const { game, round, myResponse } = state;
  const seconds = useCountdown(round.secondsLeft);
  useZombieTick(props, seconds);
  // The red screen itself is set on the game layout (zombie-mode in GamePage).
  const amZombie = myResponse?.zombieRound != null;

  const player = (id: string) => game.players.find(p => p.id === id)!;
  const zombies = round.responses.filter(q => q.zombieRound != null);
  const humans = round.responses.filter(q => q.zombieRound == null);
  const picked = new Set(zombies.map(q => q.choice).filter(Boolean));
  const list = useMemo(() => shuffled(humans.map(q => player(q.playerId)), `${round.id}:${round.zombieStep}:${game.meId}`),
    // A new order for every bite round, not on every update.
    [round.id, round.zombieStep, game.meId, humans.length]);
  const myChoice = myResponse?.choice ? player(myResponse.choice) : null;

  return (
    <div className="zombie">
      <Countdown seconds={seconds} />
      <p className="zombie-round">Bitterunde {round.zombieStep} · {zombies.length} {zombies.length === 1 ? 'zombie' : 'zombier'} · {humans.length} {humans.length === 1 ? 'menneske' : 'mennesker'}</p>
      {amZombie ? <>
        <h2 className="zombie-title"><Skull size={26} /> Du er zombie!</h2>
        {myChoice ? (
          <div className="waiting" role="status"><Check size={20} /> Du biter {myChoice.name}. Venter på de andre zombiene …</div>
        ) : <>
          <p className="task-description">Velg hvem du vil bite.</p>
          <div className="zombie-targets">
            {list.map(target => {
              const taken = picked.has(target.id);
              return (
                <button key={target.id} className={`zombie-target ${taken ? 'taken' : ''}`} disabled={taken || busy || offline || round.awarded}
                  onClick={() => void act('bite', { targetId: target.id })}>
                  <Avatar player={target} small /><span>{target.name}</span>{taken && <small>Valgt</small>}
                </button>
              );
            })}
          </div>
          {seconds === 0 && <p className="muted">Tiden er ute. Du biter en tilfeldig.</p>}
        </>}
      </> : <>
        <h2>{myResponse ? 'Du lever fortsatt!' : 'Zombiene jakter'}</h2>
        <p className="task-description">Zombiene velger hvem de biter.</p>
      </>}
      <div className="zombie-list" role="region" aria-label="Zombiene" tabIndex={0}>
        {zombies.map(q => (
          <div key={q.playerId} className="zombie-row">
            <Avatar player={player(q.playerId)} small />
            <strong>{player(q.playerId).name}{q.playerId === game.meId && <span> (deg)</span>}</strong>
            <span>{q.choice ? <><Check size={15} /> har valgt</> : <><Hourglass size={15} /> velger …</>}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Zombie: the first zombie is drawn when the host starts the step; every zombie then bites one human per round. */
export function ZombieView(props: PhaseProps) {
  if (props.state.round.zombieStep == null) return (
    <div className="zombie">
      <span className="large-icon"><Skull size={34} /></span>
      <h2>Den første zombien trekkes …</h2>
    </div>
  );
  // Keyed by bite round so the countdown starts over.
  return <ZombieRound key={props.state.round.zombieStep} {...props} />;
}
