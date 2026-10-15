import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchGame, membership, performAction, watchGame } from '../api';
import type { Game } from '../model';

export type Act = (action: string, payload?: Record<string, unknown>) => Promise<boolean>;

const pollInterval = 4000;

/**
 * Loads a game and keeps it in sync (realtime events, polling, reconnects).
 * `act` sends one player action at a time and resolves to whether it succeeded.
 */
export function useGame(sessionId: string) {
  const [game, setGame] = useState<Game | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [offline, setOffline] = useState(!navigator.onLine);
  const actor = useRef(membership()?.playerId);
  const inFlight = useRef(false);
  // Incremented on every request so a slow, outdated response never overwrites newer state.
  const sequence = useRef(0);
  const alive = useRef(true);

  const refresh = useCallback(async () => {
    const request = ++sequence.current;
    try {
      const value = await fetchGame(sessionId, actor.current);
      if (alive.current && request === sequence.current) { setGame(value); setError(''); }
    } catch (error) { if (alive.current && request === sequence.current) setError((error as Error).message); }
  }, [sessionId]);

  useEffect(() => {
    alive.current = true;
    void refresh();
    const cleanup = watchGame(sessionId, () => { if (!inFlight.current) void refresh(); });
    const interval = window.setInterval(() => { if (!inFlight.current && document.visibilityState === 'visible') void refresh(); }, pollInterval);
    const wake = () => { setOffline(!navigator.onLine); if (!inFlight.current) void refresh(); };
    window.addEventListener('online', wake);
    window.addEventListener('offline', wake);
    document.addEventListener('visibilitychange', wake);
    return () => {
      alive.current = false;
      cleanup();
      window.clearInterval(interval);
      window.removeEventListener('online', wake);
      window.removeEventListener('offline', wake);
      document.removeEventListener('visibilitychange', wake);
    };
  }, [refresh, sessionId]);

  const act: Act = useCallback(async (action, payload = {}) => {
    if (!game || inFlight.current || !navigator.onLine) return false;
    inFlight.current = true; ++sequence.current; setBusy(true); setError('');
    try {
      const value = await performAction(game, action, payload);
      ++sequence.current;
      if (alive.current) setGame(value);
      return true;
    } catch (error) { if (alive.current) setError((error as Error).message); return false; }
    finally { inFlight.current = false; if (alive.current) setBusy(false); }
  }, [game]);

  /** Demo only: view the game as another player. */
  const switchPlayer = useCallback(async (playerId: string) => {
    actor.current = playerId; ++sequence.current;
    setGame(await fetchGame('demo', playerId));
  }, []);

  return { game, error, setError, busy, offline, act, refresh, switchPlayer };
}
