import { Trophy } from 'lucide-react';
import { participants, type Game } from '../model';
import { Ranking } from './Ranking';

/** Final results after the game has ended. */
export function FinishedView({ game, onLeave }: { game: Game; onLeave: () => void }) {
  const players = participants(game);
  const topScore = Math.max(...players.map(p => p.score));
  const winner = [...players].sort((a, b) => b.score - a.score)[0];
  const shared = players.filter(p => p.score === topScore).length > 1;

  return (
    <main className="finished-main">
      <span className="large-icon"><Trophy size={40} /></span>
      <span className="eyebrow">KVELDENS RESULTAT</span>
      <h1>{winner?.name} {shared ? 'deler seieren!' : 'vinner!'}</h1>
      <Ranking game={game} total />
      <button className="button secondary wide" onClick={onLeave}>{game.test ? 'Til testlisten' : 'Til forsiden'}</button>
    </main>
  );
}
