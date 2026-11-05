import { Crown } from 'lucide-react';
import { Avatar } from '../components/Avatar';
import { participants, type Game } from '../model';
import { Ranking } from './Ranking';

/** At most this many winner photos side by side; a bigger tie is still named in the heading. */
const maxWinnerPhotos = 4;

/** "Erik", "Erik og Nora", "Erik, Nora og Tore". */
const listNames = (names: string[]) => names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} og ${names[names.length - 1]}`;

/** Final results after the game has ended: the winner large at the top, then everyone else. */
export function FinishedView({ game, onLeave }: { game: Game; onLeave: () => void }) {
  const players = participants(game);
  const topScore = Math.max(...players.map(p => p.score));
  const winners = players.filter(p => p.score === topScore);

  return (
    <main className="finished-main">
      <span className="eyebrow">KVELDENS RESULTAT</span>
      <div className={`winner-photos ${winners.length > 1 ? 'shared' : ''}`}>
        {winners.slice(0, maxWinnerPhotos).map(p => (
          <div className="winner-photo" key={p.id}>
            <Avatar player={p} className="avatar-winner" />
            <span className="winner-crown"><Crown size={18} /></span>
          </div>
        ))}
      </div>
      <h1>{listNames(winners.map(p => p.name))} {winners.length > 1 ? 'deler seieren!' : 'vinner!'}</h1>
      {winners.length > 0 && <p className="winner-score">{topScore} poeng</p>}
      <Ranking game={game} total podium />
      <button className="button secondary wide" onClick={onLeave}>{game.test ? 'Til testlisten' : 'Til forsiden'}</button>
    </main>
  );
}
