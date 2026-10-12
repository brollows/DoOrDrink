import { Dices } from 'lucide-react';
import { Avatar } from '../components/Avatar';
import { Brand } from '../components/Brand';
import type { Game, Player } from '../model';

export function GameHeader({ game, me, isHost }: { game: Game; me: Player; isHost: boolean }) {
  return (
    <header className="game-header">
      <Brand />
      <div className="session-label"><span>SPILLKODE</span><strong>{game.code}</strong></div>
      <div className="self-label"><Avatar player={me} small /><span>{me.name}{isHost && <small>Vert</small>}</span></div>
    </header>
  );
}

/** Demo only: lets one device view the game as any player. */
export function DemoBar({ game, onSwitchPlayer }: { game: Game; onSwitchPlayer: (playerId: string) => void }) {
  return (
    <div className="demo-bar">
      <Dices size={16} />
      <span>Lokalt prøvespill</span>
      <label htmlFor="demo-player">Se som:</label>
      <select id="demo-player" value={game.meId} onChange={e => onSwitchPlayer(e.target.value)}>
        {game.players.map(p => <option key={p.id} value={p.id}>{p.name}{p.id === game.hostId ? ' (vert)' : ''}</option>)}
      </select>
    </div>
  );
}
