import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDemo, demoAction, demoPhotos, demoState } from '../src/demo';
import { participants, sipGiverCount } from '../src/model';

test('demo mirrors participant-scaled givers, exclusive recipients and final-only standings', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const storage = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  } });
  try {
    for (const [count, hostPlays] of [[2, true], [3, true], [4, true], [5, true], [6, true], [7, true], [30, true], [3, false], [5, false], [7, false]] as const) {
      createDemo('Host', { tasks: ['height', 'ten_seconds'] });
      const saved = JSON.parse(storage.get('do-or-drink-demo')!);
      saved.players = Array.from({ length: count }, (_, i) => i === 0 ? saved.players[0]
        : { id: crypto.randomUUID(), name: `Player ${i}`, score: 0, completed: false });
      saved.hostPlays = hostPlays;
      storage.set('do-or-drink-demo', JSON.stringify(saved));
      let game = demoState();
      const act = (action: string, payload: Record<string, unknown> = {}, actor = game.hostId) => {
        game = demoAction(action, { roundId: game.round?.id, phase: game.round?.phase, ...payload }, actor);
        return game;
      };
      act('start');
      assert.equal(game.taskCount, 2);
      const performer = game.round!.performerId!;
      act('accept', {}, performer);
      act('next');
      for (const player of participants(game).filter(p => p.id !== performer)) act('guess', { value: 180 }, player.id);
      act('next');
      act('manual_result', { value: 180 }, performer);
      act('next');
      const scores = game.players.map(p => p.score);
      const expected = sipGiverCount(participants(game).length);
      assert.equal(game.round!.winners.length, expected);
      const winnerIds = [...game.round!.winners];
      act('next');
      const eligible = participants(game).filter(p => !winnerIds.includes(p.id));
      for (const [i, giver] of winnerIds.entries()) {
        assert.throws(() => act('allocate', { recipientId: giver }, giver), /kan ikke velge/);
        act('allocate', { recipientId: eligible[i].id }, giver);
      }
      assert.equal(game.round!.allocations.length, expected);
      act('next');
      assert.equal(game.round!.taskId, 'ten_seconds');
      assert.equal(game.round!.phase, 'assignment');
      assert.deepEqual(game.players.map(p => p.score), scores);
      for (let i = 0; i < 4; i++) act('next');
      assert.equal(game.status, 'finished');
      assert.deepEqual(game.players.map(p => p.score), scores);
    }
  } finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});

test('demo profile photos mirror set_photo: own photo, versions, removal, locked after the start', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const storage = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  } });
  try {
    let game = createDemo('Host');
    const photo = 'data:image/jpeg;base64,' + 'A'.repeat(100);
    const other = game.players[1].id;
    game = demoAction('photo', { value: photo }, other);
    const version = game.players.find(p => p.id === other)!.photo!;
    assert.ok(version);
    assert.equal(game.players.find(p => p.id === game.hostId)!.photo, null);
    assert.ok(!JSON.stringify(game).includes('AAAA'), 'the game state only carries the version');
    assert.deepEqual(demoPhotos([other, game.hostId]), { [other]: photo });
    assert.throws(() => demoAction('photo', { value: 'data:image/png;base64,AAAA' }, other), /kunne ikke lagres/);
    game = demoAction('photo', { value: photo + 'B' }, other);
    assert.ok(game.players.find(p => p.id === other)!.photo! > version);
    game = demoAction('photo', { value: null }, other);
    assert.equal(game.players.find(p => p.id === other)!.photo, null);
    game = demoAction('start', {}, game.hostId);
    assert.throws(() => demoAction('photo', { value: photo }, other), /før spillet starter/);
    createDemo('Host');
    assert.deepEqual(demoPhotos([other]), {}, 'a new demo starts without photos');
  } finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});
