import { createClient } from '@supabase/supabase-js';
import type { Game } from './model';
import { createDemo, demoAction, demoState } from './demo';

const url = import.meta.env.VITE_SUPABASE_URL;
const publicKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const configured = Boolean(url && publicKey && !url.includes('YOUR_PROJECT'));
export const supabase = configured ? createClient(url, publicKey) : null;
const storageKey = 'do-or-drink-membership';
export type Membership = { sessionId: string; playerId: string; name: string; expiresAt: string };

export function membership(): Membership | null {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey) || 'null') as Membership | null;
    if (value && Date.parse(value.expiresAt) > Date.now()) return value;
    localStorage.removeItem(storageKey);
  } catch { localStorage.removeItem(storageKey); }
  return null;
}
export function remember(game: Game) {
  localStorage.setItem(storageKey, JSON.stringify({ sessionId: game.id, playerId: game.meId,
    name: game.players.find(p => p.id === game.meId)?.name, expiresAt: game.expiresAt }));
}
export function leaveDevice() { localStorage.removeItem(storageKey); }

async function authenticate() {
  if (!supabase) throw new Error('Spillet er ikke koblet til ennå. Du kan prøve et lokalt spill.');
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (!data.session) {
    const { error } = await supabase.auth.signInAnonymously();
    if (error) throw error;
  }
}
async function rpc(name: string, args: Record<string, unknown>): Promise<Game> {
  await authenticate();
  const { data, error } = await supabase!.rpc(name, args);
  if (error) throw new Error(error.message);
  return data as Game;
}
export async function createGame(name: string, demo = false) {
  const game = demo ? createDemo(name) : await rpc('create_game', { p_name: name });
  remember(game);
  return game;
}
export async function joinGame(code: string, name: string) {
  const game = await rpc('join_game', { p_code: code, p_name: name });
  remember(game);
  return game;
}
export async function fetchGame(sessionId: string, playerId?: string) {
  if (sessionId === 'demo') return demoState(playerId || membership()?.playerId);
  return rpc('game_state', { p_session: sessionId });
}
export async function performAction(game: Game, action: string, payload: Record<string, unknown> = {}) {
  const values = { ...payload, roundId: game.round?.id, phase: game.round?.phase };
  return game.id === 'demo' ? demoAction(action, values, game.meId)
    : rpc('game_action', { p_session: game.id, p_action: action, p_payload: values });
}
export function watchGame(sessionId: string, refresh: () => void) {
  if (sessionId === 'demo') {
    const listener = (event: StorageEvent) => { if (event.key === 'do-or-drink-demo') refresh(); };
    window.addEventListener('storage', listener);
    return () => window.removeEventListener('storage', listener);
  }
  const channel = supabase?.channel(`game:${sessionId}`).on('postgres_changes', {
    event: 'UPDATE', schema: 'public', table: 'session_updates', filter: `session_id=eq.${sessionId}`
  }, refresh).subscribe();
  return () => { if (channel) void supabase?.removeChannel(channel); };
}
