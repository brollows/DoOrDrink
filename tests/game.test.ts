import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { rankingPoints } from '../src/model';

const db = new PGlite();
const users = Array.from({ length: 10 }, (_, i) => `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`);
type State = { id: string; code: string; meId: string; hostId: string; hostPlays: boolean; status: string; players: { id: string; score: number; completed: boolean }[]; round: { id: string; phase: string; performerId: string; actual: number | null; transferred: boolean; responses: { playerId: string; submitted: boolean; guess: number | null; actual: number | null; points: number; rank: number | null }[]; winners: string[]; allocations: { giverId: string; recipientId: string }[] } };
async function identity(index: number) { await db.query("select set_config('test.user_id',$1,false)", [users[index]]); }
async function rpc(name: string, args: unknown[]) {
  const result = await db.query<{ value: State }>(`select public.${name}(${args.map((_, i) => `$${i + 1}`).join(',')}) as value`, args);
  return result.rows[0].value;
}
async function create(count = 6) {
  await identity(0);
  let game = await rpc('create_game', ['Host']);
  for (let i = 1; i < count; i++) { await identity(i); await rpc('join_game', [game.code, i === 2 ? 'Duplicate' : 'Duplicate']); }
  await identity(0);
  game = await rpc('game_state', [game.id]);
  return game;
}
async function act(game: State, action: string, payload: Record<string, unknown> = {}) {
  return rpc('game_action', [game.id, action, { roundId: game.round?.id, phase: game.round?.phase, ...payload }]);
}
async function asPlayer(game: State, id: string) {
  const result = await db.query<{ user_id: string }>('select user_id::text from game_private.players where id=$1', [id]);
  await db.query("select set_config('test.user_id',$1,false)", [result.rows[0].user_id]);
}
before(async () => {
  await db.exec(`create role anon; create role authenticated; create schema auth;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.user_id',true),'')::uuid$$;`);
  // 002 schedules cleanup with pg_cron, which PGlite does not provide.
  for (const migration of ['001_game.sql', '003_host_plays.sql'])
    await db.exec(await readFile(new URL(`../supabase/migrations/${migration}`, import.meta.url), 'utf8'));
});
after(async () => { await db.close(); });
beforeEach(async () => { await db.exec('delete from game_private.sessions'); });

test('position scores follow the stated bonuses, including a two-player round', () => {
  assert.deepEqual(Array.from({ length: 9 }, (_, i) => rankingPoints(9, 9 - i)), [1, 2, 3, 4, 5, 6, 7, 9, 12]);
  assert.deepEqual(Array.from({ length: 5 }, (_, i) => rankingPoints(5, 5 - i)), [1, 2, 3, 5, 8]);
  assert.equal(rankingPoints(1, 1), 1);
  assert.deepEqual([rankingPoints(2, 2), rankingPoints(2, 1)], [1, 4]);
});

test('IDs allow duplicate names, rejoining restores identity, strangers cannot read or control', async () => {
  let game = await create();
  assert.equal(new Set(game.players.map(p => p.id)).size, 6);
  await identity(2);
  const restored = await rpc('join_game', [game.code, 'Renamed']);
  assert.equal(restored.players.length, 6);
  await assert.rejects(() => act(game, 'start'), /Bare verten/);
  await identity(9);
  await assert.rejects(() => rpc('game_state', [game.id]), /utløpt/);
  await identity(0);
  game = await act(game, 'start');
  await identity(8);
  await assert.rejects(() => rpc('join_game', [game.code, 'Late']), /har startet/);
});

test('declining moves the task once per candidate and awards takeover bonus; secrets stay private', async () => {
  let game = await create();
  game = await act(game, 'start');
  const original = game.round.performerId;
  await asPlayer(game, original);
  game = await act(game, 'decline');
  assert.notEqual(game.round.performerId, original);
  assert.equal(game.round.transferred, true);
  const performer = game.round.performerId;
  await asPlayer(game, performer); game = await act(game, 'accept');
  await identity(0); game = await act(game, 'next');
  const guessers = game.players.filter(p => p.id !== performer);
  for (const [i, p] of guessers.entries()) { await asPlayer(game, p.id); await act(game, 'guess', { value: i === 0 ? 60 : 40 - i }); }
  await identity(0); game = await act(game, 'next');
  await asPlayer(game, performer); game = await act(game, 'timer_start');
  await db.query("update game_private.responses set started_at=clock_timestamp()-interval '70 seconds' where round_id=$1 and player_id=$2", [game.round.id, performer]);
  game = await act(game, 'timer_stop', { value: 70 });
  assert.equal(game.round.actual, 70);
  await asPlayer(game, guessers[0].id);
  const hidden = await rpc('game_state', [game.id]);
  assert.equal(hidden.round.actual, null);
  assert.equal(hidden.round.responses.find(q => q.playerId === performer)!.actual, null);
  assert.equal(hidden.round.responses.find(q => q.playerId === guessers[1].id)!.guess, null);
  await identity(0); game = await act(game, 'next');
  assert.equal(game.round.actual, 70);
  assert.equal(game.round.responses.find(q => q.playerId === guessers[0].id)!.rank, 1);
  assert.equal(game.round.responses.find(q => q.playerId === performer)!.points, 10);
  assert.equal(game.players.find(p => p.id === performer)!.completed, true);
  assert.equal(game.players.find(p => p.id === original)!.completed, false);
  const scores = game.players.map(p => p.score);
  game = await act(game, 'back');
  await asPlayer(game, performer);
  await assert.rejects(() => act(game, 'timer_start'), /kan ikke/);
  await identity(0); game = await act(game, 'next');
  assert.deepEqual(game.players.map(p => p.score), scores);
  await assert.rejects(() => act(game, 'next', { roundId: '00000000-0000-4000-8000-999999999999' }), /Runden er endret/);
});

test('ties use best occupied position and skipped responses score zero', async () => {
  let game = await create(10);
  game = await act(game, 'start');
  const performer = game.round.performerId;
  await asPlayer(game, performer); game = await act(game, 'accept');
  await identity(0); game = await act(game, 'next');
  const guessers = game.players.filter(p => p.id !== performer);
  const values = [10, 10, 12, 15, 18, 25, 40, 40];
  for (let i = 0; i < values.length; i++) { await asPlayer(game, guessers[i].id); await act(game, 'guess', { value: values[i] }); }
  await identity(0); game = await act(game, 'next');
  await asPlayer(game, performer); game = await act(game, 'timer_start');
  await db.query("update game_private.responses set started_at=clock_timestamp()-interval '10 seconds' where round_id=$1 and player_id=$2", [game.round.id, performer]);
  game = await act(game, 'timer_stop', { value: 10 });
  await identity(0); game = await act(game, 'next');
  const response = (index: number) => game.round.responses.find(q => q.playerId === guessers[index].id)!;
  assert.equal(response(0).points, 12); assert.equal(response(1).points, 12);
  assert.equal(response(2).rank, 3); assert.equal(response(2).points, 7);
  assert.equal(response(6).points, 3); assert.equal(response(7).points, 3);
  assert.equal(response(8).points, 0);
});

test('sip recipient is exclusive, winners are immune, countdown task is collective and expires at 20', async () => {
  let game = await create(); game = await act(game, 'start');
  const performer = game.round.performerId;
  await asPlayer(game, performer); game = await act(game, 'accept');
  await identity(0); game = await act(game, 'next');
  const guessers = game.players.filter(p => p.id !== performer);
  for (const [i, p] of guessers.entries()) { await asPlayer(game, p.id); await act(game, 'guess', { value: 10 + i }); }
  await identity(0); game = await act(game, 'next');
  await asPlayer(game, performer); game = await act(game, 'timer_start');
  await db.query("update game_private.responses set started_at=clock_timestamp()-interval '10 seconds' where round_id=$1 and player_id=$2", [game.round.id, performer]);
  game = await act(game, 'timer_stop', { value: 10 });
  await identity(0); game = await act(game, 'next'); game = await act(game, 'next'); game = await act(game, 'next');
  const winners = game.round.winners;
  assert.equal(winners.length, 3);
  const recipient = game.players.find(p => !winners.includes(p.id))!.id;
  await asPlayer(game, winners[0]);
  await assert.rejects(() => act(game, 'allocate', { recipientId: winners[1] }), /kan ikke få/);
  game = await act(game, 'allocate', { recipientId: recipient });
  await asPlayer(game, winners[1]);
  await assert.rejects(() => act(game, 'allocate', { recipientId: recipient }), /valgte spilleren først/);
  await identity(0); game = await act(game, 'next');
  assert.equal(game.round.performerId, null);
  game = await act(game, 'next');
  const times = [10.01, 9.97, 10.2, 11, 20];
  for (let i = 0; i < times.length; i++) {
    await asPlayer(game, game.players[i].id); await act(game, 'timer_start');
    await db.query("update game_private.responses set started_at=clock_timestamp()-($1::numeric * interval '1 second') where round_id=$2 and player_id=$3", [times[i], game.round.id, game.players[i].id]);
    game = await act(game, 'timer_stop', { value: times[i] });
    const privateState = await rpc('game_state', [game.id]);
    assert.equal(privateState.round.responses.find(q => q.playerId === game.players[i].id)!.actual, null);
  }
  await identity(0); game = await act(game, 'next');
  assert.equal(game.round.responses.find(q => q.playerId === game.players[4].id)!.points, 0);
  assert.equal(game.round.responses.find(q => q.playerId === game.players[5].id)!.points, 0);
  assert.equal(game.round.responses.find(q => q.playerId === game.players[0].id)!.rank, 1);
  game = await act(game, 'next'); game = await act(game, 'next'); game = await act(game, 'next');
  assert.equal(game.status, 'finished');
});

test('expired sessions cannot be resumed and cascading cleanup removes all personal game data', async () => {
  const game = await create();
  await db.query("update game_private.sessions set expires_at=now()-interval '1 second' where id=$1", [game.id]);
  await assert.rejects(() => rpc('game_state', [game.id]), /utløpt/);
  await db.query('delete from game_private.sessions where expires_at<=now()');
  for (const table of ['players', 'rounds']) {
    const result = await db.query<{ count: number }>(`select count(*)::int as count from game_private.${table} where session_id=$1`, [game.id]);
    assert.equal(result.rows[0].count, 0);
  }
});

test('private tables and update streams are protected by actual database roles', async () => {
  const game = await create();
  await identity(0);
  await db.exec('grant usage on schema auth to authenticated; set role authenticated');
  try {
    await assert.rejects(() => db.query('select * from game_private.responses'), /permission denied/);
    await assert.rejects(() => db.query('update public.session_updates set version=100'), /permission denied/);
    const signals = await db.query('select * from public.session_updates');
    assert.equal(signals.rows.length, 1);
    const snapshot = await rpc('game_state', [game.id]);
    assert.equal(snapshot.meId, game.hostId);
    await identity(9);
    const hidden = await db.query('select * from public.session_updates');
    assert.equal(hidden.rows.length, 0);
    await db.exec('reset role; set role anon');
    await assert.rejects(() => rpc('game_state', [game.id]), /permission denied/);
  } finally { await db.exec('reset role'); }
});

test('manual results support units, host entry, hidden answers and tied last places', async () => {
  const definition = { id: 'weight_test', title: 'Gjett vekten', description: 'Gjett vekten i gram.', kind: 'individual',
    answer: { method: 'manual', enteredBy: 'host', unit: 'gram', min: 0, max: 1000 } };
  await db.query('insert into game_private.tasks(id,definition) values($1,$2)', ['weight_test', definition]);
  let game = await create();
  await db.query('update game_private.sessions set task_order=$1 where id=$2', [['weight_test'], game.id]);
  game = await act(game, 'start');
  const performer = game.round.performerId;
  await asPlayer(game, performer); game = await act(game, 'accept');
  await identity(0);
  const stale = game;
  game = await act(game, 'next');
  await assert.rejects(() => act(stale, 'next'), /Steget er endret/);
  const guessers = game.players.filter(p => p.id !== performer);
  const values = [100, 110, 120, 150, 150];
  for (const [index, player] of guessers.entries()) {
    await asPlayer(game, player.id); await act(game, 'guess', { value: values[index] });
  }
  await identity(0); game = await act(game, 'next');
  const nonHost = game.players.find(p => p.id !== game.hostId)!;
  await asPlayer(game, nonHost.id);
  await assert.rejects(() => act(game, 'manual_result', { value: 100 }), /Bare verten/);
  await identity(0); game = await act(game, 'manual_result', { value: 100 });
  await asPlayer(game, guessers.find(p => p.id !== game.hostId)!.id);
  const hidden = await rpc('game_state', [game.id]);
  assert.equal(hidden.round.actual, null);
  await identity(0); game = await act(game, 'next');
  assert.equal(game.round.actual, 100);
  assert.equal(game.round.responses.find(q => q.playerId === guessers[3].id)!.points, 2);
  assert.equal(game.round.responses.find(q => q.playerId === guessers[4].id)!.points, 2);
  assert.equal(game.round.responses.find(q => q.playerId === performer)!.points, 5);
});

test('a non-playing host runs the game without tasks, guesses, points or sips', async () => {
  let game = await create(4);
  assert.equal(game.hostPlays, true);
  await asPlayer(game, game.players[1].id);
  await assert.rejects(() => act(game, 'host_plays', { value: false }), /Bare verten/);
  await identity(0);
  await assert.rejects(() => act(game, 'host_plays', { value: 'nei' }), /Ugyldig/);
  game = await act(game, 'host_plays', { value: false });
  assert.equal(game.hostPlays, false);
  game = await act(game, 'start');
  await assert.rejects(() => act(game, 'host_plays', { value: true }), /før spillet starter/);
  assert.notEqual(game.round.performerId, game.hostId);
  assert.equal(game.round.responses.length, 3);
  assert.ok(game.round.responses.every(q => q.playerId !== game.hostId));
  const performer = game.round.performerId;
  await asPlayer(game, performer); game = await act(game, 'accept');
  await identity(0); game = await act(game, 'next');
  await assert.rejects(() => act(game, 'guess', { value: 10 }), /deltar ikke/);
  const guessers = game.players.filter(p => p.id !== performer && p.id !== game.hostId);
  await asPlayer(game, guessers[0].id); await act(game, 'guess', { value: 10 });
  await identity(0);
  const monitored = await rpc('game_state', [game.id]);
  assert.equal(monitored.round.responses.find(q => q.playerId === guessers[0].id)!.submitted, true);
  await asPlayer(game, guessers[1].id); await act(game, 'guess', { value: 20 });
  await identity(0); game = await act(game, 'next');
  await assert.rejects(() => act(game, 'timer_start'), /deltar ikke/);
  await asPlayer(game, performer); game = await act(game, 'timer_start');
  await db.query("update game_private.responses set started_at=clock_timestamp()-interval '10 seconds' where round_id=$1 and player_id=$2", [game.round.id, performer]);
  game = await act(game, 'timer_stop', { value: 10 });
  await identity(0); game = await act(game, 'next'); game = await act(game, 'next'); game = await act(game, 'next');
  assert.equal(game.players.find(p => p.id === game.hostId)!.score, 0);
  assert.ok(!game.round.winners.includes(game.hostId));
  await asPlayer(game, game.round.winners[0]);
  await assert.rejects(() => act(game, 'allocate', { recipientId: game.hostId }), /kan ikke få/);
});

test('a non-playing host still needs two players to start', async () => {
  let game = await create(2);
  game = await act(game, 'host_plays', { value: false });
  await assert.rejects(() => act(game, 'start'), /minst to/);
  game = await act(game, 'host_plays', { value: true });
  game = await act(game, 'start');
  assert.equal(game.status, 'playing');
});
