import { createContext, useContext } from 'react';
import type { Player } from '../model';

const colorCount = 5;

/** The game's profile photos, {playerId: dataUrl}, provided by the game page. */
export const PhotoContext = createContext<Record<string, string>>({});

type Props = {
  player: Pick<Player, 'id' | 'name' | 'photo'>;
  small?: boolean;
  className?: string;
  /** Shows this photo instead of the player's own, e.g. a preview before joining. null shows the initial. */
  photo?: string | null;
};

/** The player's photo, or their initial on a colour when they have none. */
export function Avatar({ player, small = false, className = '', photo }: Props) {
  const photos = useContext(PhotoContext);
  const color = [...player.id].reduce((sum, char) => sum + char.charCodeAt(0), 0) % colorCount;
  const src = photo !== undefined ? photo : player.photo != null ? photos[player.id] : null;
  return (
    <span className={`avatar color-${color} ${small ? 'small' : ''} ${src ? 'has-photo' : ''} ${className}`} aria-hidden="true">
      {src ? <img src={src} alt="" /> : player.name.slice(0, 1).toUpperCase()}
    </span>
  );
}
