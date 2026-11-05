import { Avatar } from '../components/Avatar';
import { formatAnswer, formatTime, participants, roundTask, type Game, type Player, type Response, type Round, type Task } from '../model';

type Props = {
  game: Game;
  /** Show total score for the whole game instead of points for the current round. */
  total?: boolean;
  /** Final results: leave out the winners (shown large above) and give 2nd and 3rd place bigger photos. */
  podium?: boolean;
  /** Standings after a round: the top three get bigger photos, and each row shows this round's points. */
  standings?: boolean;
};

function resultDetail(player: Player, total: boolean, standings: boolean, round: Round | null, task: Task | null, response: Response | undefined) {
  if (standings) return `+${response?.points ?? 0} denne runden`;
  if (total) return player.completed ? 'Oppgave fullført' : '';
  if (player.id === round?.performerId) return task?.answer.method === 'mime' ? 'Mimet' : task?.answer.method === 'wavelength' ? 'Var fasiten' : 'Utførte oppgaven';
  if (task?.answer.method === 'wavelength') return `${response?.points ?? 0} av ${task.answer.questions ?? 5} like svar`;
  if (task?.answer.method === 'mime') return response?.actual != null ? `Gjettet det på ${formatTime(response.actual)} s` : 'Gjettet ikke';
  if (task?.kind === 'challenge') return response && response.guess !== null ? `Gjettet ${formatAnswer(response.guess, task)} ${task.answer.unit}` : 'Ikke svart';
  if (!response || response.actual === null) return 'Ikke fullført';
  if (response.actual >= (task?.answer.timeout || Infinity)) return 'Tiden gikk ut';
  return `${formatTime(response.actual)} s · ${formatTime(Math.abs(response.actual - (task?.answer.target || 0)))} s unna`;
}

export function Ranking({ game, total = false, podium = false, standings = false }: Props) {
  const round = game.round;
  const task = round ? roundTask(round) : null;
  const responseOf = (player: Player) => round?.responses.find(q => q.playerId === player.id);
  const pointsOf = (player: Player) => responseOf(player)?.points || 0;
  const rows = [...participants(game)].sort((a, b) => total ? b.score - a.score : pointsOf(b) - pointsOf(a));

  return (
    <div className="ranking" role="region" aria-label={total ? 'Sammenlagt' : 'Rundens resultater'} tabIndex={0}>
      {rows.map((player, index) => {
        const response = responseOf(player);
        // Tied players share the best rank.
        const rank = total
          ? rows.findIndex(other => other.score === player.score) + 1
          : response?.points ? rows.findIndex(other => pointsOf(other) === response.points) + 1 : null;
        if (podium && rank === 1) return null;
        return (
          <div className={`ranking-row ${player.id === game.meId ? 'is-me' : ''} ${(podium || standings) && rank && rank <= 3 ? `place-${rank}` : ''}`} key={player.id}>
            <span className={`rank ${index < 3 ? 'podium' : ''}`}>{rank || '–'}</span>
            <Avatar player={player} small />
            <div className="ranking-name">
              <strong>{player.name}{player.id === game.meId && <span> (deg)</span>}</strong>
              <span>{resultDetail(player, total, standings, round, task, response)}</span>
            </div>
            <span className="points">{total ? player.score : `+${response?.points || 0}`}<small>poeng</small></span>
          </div>
        );
      })}
    </div>
  );
}
