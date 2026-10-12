import type { Player } from '../model';

const colorCount = 5;

export function Avatar({ player, small = false }: { player: Player; small?: boolean }) {
  const color = [...player.id].reduce((sum, char) => sum + char.charCodeAt(0), 0) % colorCount;
  return (
    <span className={`avatar color-${color} ${small ? 'small' : ''}`} aria-hidden="true">
      {player.name.slice(0, 1).toUpperCase()}
    </span>
  );
}
