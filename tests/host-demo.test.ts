import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createDemo, demoAction, demoState } from '../src/demo';
import { participants, roundPhases, type Game } from '../src/model';

const storage = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', { value: {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
}, configurable: true });
beforeEach(() => storage.clear());
const act = (game: Game, action: string, payload: Record<string, unknown> = {}, actor = game.hostId) =>
  demoAction(action, { roundId: game.round?.id, phase: game.round?.phase, ...payload }, actor);

test('local demo mirrors spectator selection, permissions, task repetitions and round skipping', () => {
  let game = createDemo('Host');
  const tv = game.players[1].id;
  for (const playerId of [tv, game.hostId]) game = act(game, 'spectator', { playerId, value: true });
  assert.equal(participants(game).length, 4);
  assert.throws(() => act(game, 'settings', { tasks: ['beer'] }, tv), /Bare verten/);
  assert.throws(() => act(game, 'settings', { tasks: ['beer', 'beer', 'beer'] }), /Ugyldig/);
  game = act(game, 'settings', { tasks: ['beer', 'beer'] });
  assert.equal(game.taskCount, 2);
  assert.deepEqual(demoState(game.hostId).selectedTasks, ['beer', 'beer']);
  assert.equal(demoState(tv).selectedTasks, undefined);
  game = act(game, 'start');
  assert.equal(game.round!.responses.length, 4);
  assert.ok(![tv, game.hostId].includes(game.round!.performerId!));
  assert.throws(() => act(game, 'skip_round', {}, tv), /Bare verten/);
  const stale = game;
  game = act(game, 'skip_round');
  assert.notEqual(game.round!.id, stale.round!.id);
  assert.throws(() => act(stale, 'skip_round'), /Runden er endret/);
  game = act(game, 'skip_round');
  assert.equal(game.status, 'finished');
  assert.ok(game.players.every(p => p.score === 0 && !p.completed));
});

test('local demo mirrors both sip switches and preserves score when skipping after reveal', () => {
  for (const playerSips of [true, false]) for (const gameSips of [true, false]) {
    let game = createDemo('Host', { tasks: ['wyr_honest', 'ten_seconds'] });
    game = act(game, 'settings', { playerSips, gameSips });
    game = act(game, 'start'); game = act(game, 'next');
    for (const [i, player] of game.players.entries()) game = act(game, 'choose', { value: i === 0 ? '0' : '1' }, player.id);
    game = act(game, 'next');
    assert.equal(game.round!.responses.some(q => q.drinks), gameSips);
    const scores = game.players.map(p => p.score);
    assert.ok(scores.some(score => score > 0));
    game = act(game, 'next'); assert.equal(game.round!.phase, gameSips ? 'sips' : 'leaderboard');
    game = act(game, 'back'); assert.equal(game.round!.phase, 'reveal');
    game = act(game, 'skip_round'); assert.deepEqual(game.players.map(p => p.score), scores);
    game = act(game, 'next'); game = act(game, 'next'); game = act(game, 'next');
    assert.equal(game.round!.phase, playerSips ? 'sips' : 'leaderboard');
    assert.equal(roundPhases('ten_seconds', undefined, game).includes('sips'), playerSips);
    assert.throws(() => act(game, 'settings', { playerSips: true }), /før spillet/);
  }
});
