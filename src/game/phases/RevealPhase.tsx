import { Bot } from 'lucide-react';
import { Avatar } from '../../components/Avatar';
import { formatAnswer, formatTime, hands, participants, sameWord, sipCount, wavelengthStatus, wlStreak, type Hand, type Response } from '../../model';
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

/** Topp 5: the most written words, who wrote them, and which of your words made the list. */
function WordResults({ state }: { state: State }) {
  const { game, round, myResponse } = state;
  const top = round.topWords ?? [];
  const name = (id: string) => game.players.find(p => p.id === id)?.name ?? '';
  const myWords = myResponse?.words ?? [];
  return <>
    {top.length ? (
      <ol className="top-words">
        {top.map((entry, index) => (
          <li key={entry.word} className={entry.players.includes(game.meId) ? 'is-me' : ''}>
            <span className="rank podium">{index + 1}</span>
            <div><strong>{entry.word}</strong><span>{entry.players.map(name).join(', ')}</span></div>
            <span className="points">{entry.count}<small>svar</small></span>
          </li>
        ))}
      </ol>
    ) : <p className="task-description">Ingen ord ble skrevet av mer enn én. Ingen poeng denne gangen.</p>}
    {myResponse && (
      <p className="my-words">
        Dine ord: {myWords.length ? myWords.map(word => <span key={word} className={top.some(t => sameWord(word, t.word) && t.players.includes(game.meId)) ? 'hit' : ''}>{word}</span>) : 'ingen'}
        {' '}· +{myResponse.points} poeng
      </p>
    )}
  </>;
}

/** Nest mest: every number from the top, with the loser and the winner marked. */
function NumberResults({ state }: { state: State }) {
  const { game, round, task } = state;
  const rows = participants(game).map(player => ({ player, response: round.responses.find(q => q.playerId === player.id) }))
    .sort((a, b) => Number(b.response?.choice ?? -1) - Number(a.response?.choice ?? -1));
  return (
    <div className="ranking" role="region" aria-label="Alle tallene" tabIndex={0}>
      {rows.map(({ player, response }) => (
        <div className={`ranking-row ${player.id === game.meId ? 'is-me' : ''} ${response?.drinks ? 'too-high' : ''}`} key={player.id}>
          <span className={`rank ${response?.rank === 1 ? 'podium' : ''}`}>{response?.drinks ? '✕' : response?.rank ?? '–'}</span>
          <Avatar player={player} small />
          <div className="ranking-name">
            <strong>{player.name}{player.id === game.meId && <span> (deg)</span>}</strong>
            <span>{response?.drinks ? `Høyest – tar ${sipCount(task)} slurker` : response?.rank === 1 ? 'Nest høyest – vinner!' : response?.choice == null ? 'Valgte ikke' : ''}</span>
          </div>
          <span className="points">{response?.choice ?? '–'}<small>+{response?.points ?? 0} poeng</small></span>
        </div>
      ))}
    </div>
  );
}

/** Samme bølgelengde: the performer's answers to the questions that were played, and how many held on. */
function WavelengthResults({ state }: { state: State }) {
  const { round, task, performer } = state;
  const { total, step, shown, fasit, guessers } = wavelengthStatus(round);
  const played = step + (shown ? 1 : 0);
  const allTheWay = guessers.filter(q => wlStreak(q.answers, fasit, played) === played).length;
  return <>
    <p className="task-description">
      {played < total ? `Runden stoppet etter spørsmål ${played}. ${performer?.name} får 0 poeng.`
        : allTheWay ? `${allTheWay} av ${guessers.length} svarte likt på alle ${total}. ${performer?.name} får ${allTheWay} poeng.`
        : `Ingen svarte likt på alle ${total}. ${performer?.name} får 0 poeng.`}
    </p>
    <ol className="wl-recap">
      {(round.wlQuestions ?? []).slice(0, played).map((index, i) => {
        const question = task.questions?.[index];
        const answer = fasit[i];
        return (
          <li key={index}>
            <span>{question?.question}</span>
            <strong>{answer == null ? 'Ikke svart' : question?.options[Number(answer)]}</strong>
          </li>
        );
      })}
    </ol>
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
  if (method === 'words') return <>
    <span className="eyebrow">TEMA: {task.question?.toUpperCase()}</span>
    <h1>Topp 5.</h1>
    <WordResults state={state} />
  </>;
  if (method === 'highest') return <>
    <span className="eyebrow">ØYEBLIKKET ER HER</span>
    <h1>Nest mest.</h1>
    <NumberResults state={state} />
  </>;
  if (method === 'mime') return <>
    <span className="eyebrow">{performer?.name.toUpperCase()} MIMET</span>
    <h1>Fasiten.</h1>
    <div className="reveal-value">
      <span>Ordet var</span>
      <strong className="mime-answer">{round.word ?? '–'}</strong>
      <p className="muted">{round.word ? 'Raskest får mest poeng. De som ikke gjettet, får 0.' : 'Ingen ord ble valgt. Ingen poeng denne runden.'}</p>
    </div>
    <Ranking game={game} />
  </>;
  if (method === 'wavelength') return <>
    <span className="eyebrow">{performer?.name.toUpperCase()} VAR FASITEN</span>
    <h1>Samme bølgelengde.</h1>
    <WavelengthResults state={state} />
    <Ranking game={game} />
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
        <span>{performer?.name}{method === 'stopwatch' || task.answer.input === 'counter' ? ' brukte' : ' sitt svar'}</span>
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
