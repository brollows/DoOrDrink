import { Bot, Check, Dices, Hourglass } from 'lucide-react';
import { Avatar } from '../../components/Avatar';
import { TaskIcon } from '../TaskIcon';
import type { PhaseProps } from './types';

/** Step 1: the task is revealed and the chosen player accepts or passes it on. */
export function AssignmentPhase({ state, busy, offline, act }: PhaseProps) {
  const { game, me, round, task, performer, myResponse } = state;
  const disabled = busy || offline;
  const opponent = game.players.find(p => p.id === myResponse?.opponentId);

  return <>
    <span className="task-icon"><TaskIcon task={task} size={30} /></span>
    <span className="eyebrow">{performer ? `${performer.name.toUpperCase()} SIN TUR` : 'EN UTFORDRING FOR ALLE'}</span>
    <h1>{task.title}</h1>
    <p className="task-description">{task.description}</p>

    {task.answer.method === 'rps' && myResponse && (
      <div className="performer-card">
        {opponent ? <Avatar player={opponent} /> : <span className="avatar color-3" aria-hidden="true"><Bot size={22} /></span>}
        <div><strong>{opponent?.name ?? 'Maskinen'}</strong><span>Din motstander</span></div>
      </div>
    )}

    {performer && (
      <div className="performer-card">
        <Avatar player={performer} />
        <div><strong>{performer.name}</strong><span>{round.transferred ? '+10 poeng for å ta over' : '+5 poeng for å fullføre'}</span></div>
      </div>
    )}

    {round.accepted ? (
      <div className="waiting"><Check size={20} /> {task.kind === 'everyone' ? 'Alle er med på denne oppgaven' : `${performer?.name} tar utfordringen`}</div>
    ) : me.id === round.performerId ? (
      <div className="choice-buttons">
        <button className="button primary wide" disabled={disabled} onClick={() => void act('accept')}>Jeg tar den! <Check size={19} /></button>
        <button className="button secondary wide" disabled={disabled} onClick={() => void act('decline')}><Dices size={19} /> Gi til en tilfeldig spiller</button>
      </div>
    ) : (
      <div className="waiting"><Hourglass size={19} /> Venter på {performer?.name}</div>
    )}
  </>;
}
