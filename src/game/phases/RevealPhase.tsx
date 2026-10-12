import { Bot } from 'lucide-react';
import { Avatar } from '../../components/Avatar';
import { formatAnswer, formatTime, hands, type Hand, type Response } from '../../model';
import { Ranking } from '../Ranking';
import { HandIcon } from '../TaskIcon';
import type { PhaseProps } from './types';

type State = PhaseProps['state'];

function MatchSide({ state, response, hand, machine = false }: { state: State; response?: Response; hand: string | null; machine?: boolean }) {
  const player = state.game.players.find(p => p.id === response?.playerId);
  const won = machine ? false : Boolean(response && response.points > 0);
  return (
    <div className={`match-side ${won ? 'won' : 'lost'}`}>
      {player ? <Avatar player={player} small /> : <span className="avatar small color-3" aria-hidden="true"><Bot size={18} /></span>}
      <strong>{player?.name ?? 'Maskinen'}{player?.id === state.game.meId && <span> (deg)</span>}</strong>
      <span className="match-hand">{hand ? <><HandIcon hand={hand as Hand} size={16} />{hands[hand as Hand]}</> : 'Valgte ikke'}</span>
    </div>
  );
}

/** Every rock paper scissors pair with both hands; winners in lime, losers drink. */
function MatchResults({ state }: { state: State }) {
  const seen = new Set<string>();
  const matches = state.round.responses.filter(q => {
    if (seen.has(q.playerId)) return false;
    seen.add(q.playerId);
    if (q.opponentId) seen.add(q.opponentId);
    return true;
  });
  return (
    <div className="match-list" role="region" aria-label="Kampene" tabIndex={0}>
      {matches.map(q => {
        const opponent = state.round.responses.find(o => o.playerId === q.opponentId);
        return (
          <div className={`match ${q.playerId === state.game.meId || q.opponentId === state.game.meId ? 'is-me' : ''}`} key={q.playerId}>
            <MatchSide state={state} response={q} hand={q.choice} />
            <span className="match-versus">mot</span>
            {opponent ? <MatchSide state={state} response={opponent} hand={opponent.choice} /> : <MatchSide state={state} hand={q.botChoice} machine />}
          </div>
        );
      })}
    </div>
  );
}

/** Would you rather: share of votes per option and the player's own pick. */
function VoteResults({ state }: { state: State }) {
  const { round, task, myResponse } = state;
  const counts = [0, 1].map(option => round.responses.filter(q => q.choice === String(option)).length);
  const answered = counts[0] + counts[1];
  const minority = counts[0] === counts[1] ? null : counts[0] < counts[1] ? 0 : 1;
  const missing = round.responses.length - answered;
  return <>
    <div className="vote-results">
      {task.options!.map((text, option) => {
        const percent = answered ? Math.round(counts[option] / answered * 100) : 0;
        return (
          <div key={option} className={`vote-option ${minority === option ? 'minority' : ''} ${myResponse?.choice === String(option) ? 'mine' : ''}`}>
            <div className="vote-head">
              <span className="option-letter">{option === 0 ? 'A' : 'B'}</span>
              <span className="vote-text">{text}</span>
              <strong>{percent}%</strong>
            </div>
            <div className="progress-track"><span style={{ width: `${percent}%` }} /></div>
            <small>{counts[option]} {counts[option] === 1 ? 'stemme' : 'stemmer'}{myResponse?.choice === String(option) && ' · ditt valg'}{minority === option ? ' · drikker' : minority !== null && ' · +3 poeng'}</small>
          </div>
        );
      })}
    </div>
    <p className="muted vote-summary">
      {minority === null ? 'Helt likt! Ingen poeng, og ingen drikker for valget sitt.' : 'Flertallet får 3 poeng. Mindretallet tar 3 slurker.'}
      {missing > 0 && ` ${missing} svarte ikke og drikker også.`}
    </p>
  </>;
}

/** Step 4: the actual result and this round's points. */
export function RevealPhase({ state }: PhaseProps) {
  const { game, round, task, performer } = state;
  const { min, max, unit, method, target } = task.answer;

  if (method === 'rps') return <>
    <span className="eyebrow">ØYEBLIKKET ER HER</span>
    <h1>Kampene.</h1>
    <p className="task-description">Vinnerne får 3 poeng. Taperne tar 3 slurker.</p>
    <MatchResults state={state} />
  </>;
  if (method === 'choice') return <>
    <span className="eyebrow">ØYEBLIKKET ER HER</span>
    <h1>Ville du helst …</h1>
    <VoteResults state={state} />
  </>;

  return <>
    <span className="eyebrow">ØYEBLIKKET ER HER</span>
    <h1>Fasiten.</h1>
    {task.kind === 'challenge' ? (
      <div className="reveal-value">
        <span>{performer?.name}{method === 'stopwatch' ? ' brukte' : ' sitt svar'}</span>
        <strong>{round.actual === null ? '–' : formatAnswer(Math.max(min, Math.min(round.actual, max)), task)}<small>{unit}</small></strong>
        <p className="muted">
          {round.actual === null ? 'Oppgaven ble ikke fullført. Ingen poeng denne runden.'
            : round.actual > max ? `Over ${max} ${unit}. Gjettingene vurderes mot ${max}.`
            : round.actual < min ? `Under ${min} ${unit}. Gjettingene vurderes mot ${min}.`
            : 'Så godt kjente dere hverandre.'}
        </p>
      </div>
    ) : (
      <p className="task-description">Målet var {formatTime(target!)} {unit}. Hvem traff best?</p>
    )}
    <Ranking game={game} />
  </>;
}
