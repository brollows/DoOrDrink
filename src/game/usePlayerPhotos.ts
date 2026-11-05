import { useEffect, useState } from 'react';
import { fetchPhotos } from '../api';
import type { Game } from '../model';

const retryDelay = 5000;

/**
 * The game's profile photos, {playerId: dataUrl}. game_state only carries a version per player, so this fetches a
 * photo only when it is new or has changed, and keeps the rest.
 */
export function usePlayerPhotos(game: Game | null) {
  const [loaded, setLoaded] = useState<Record<string, { version: number; photo: string }>>({});
  const [attempt, setAttempt] = useState(0);
  const sessionId = game?.id;
  const players = game?.players ?? [];
  const missing = players.filter(p => p.photo != null && loaded[p.id]?.version !== p.photo);
  // A stable key, so the effect only runs when the set of missing photos changes.
  const wanted = missing.map(p => `${p.id}:${p.photo}`).join(',');

  useEffect(() => {
    if (!sessionId || !wanted) return;
    let active = true;
    const versions = new Map(wanted.split(',').map(entry => entry.split(':') as [string, string]));
    fetchPhotos(sessionId, [...versions.keys()])
      .then(photos => {
        if (!active) return;
        setLoaded(current => {
          const next = { ...current };
          for (const [id, photo] of Object.entries(photos)) next[id] = { version: Number(versions.get(id)), photo };
          return next;
        });
      })
      // Initials are shown meanwhile; try again in a moment.
      .catch(() => { if (active) window.setTimeout(() => setAttempt(n => n + 1), retryDelay); });
    return () => { active = false; };
  }, [sessionId, wanted, attempt]);

  // Only photos the players still have: a removed photo falls back to the initial at once.
  return Object.fromEntries(players.filter(p => p.photo != null && loaded[p.id]).map(p => [p.id, loaded[p.id].photo]));
}
