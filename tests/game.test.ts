import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { mimeMatch, mimeSuggestions, normalizeWord, rankingPoints, sameWord, shuffledTasks, plannedTasks, sipGiverCount, tasks as taskDefinitions } from '../src/model';
import { allTaskIds, simulateDuration, taskTiming } from '../src/duration';

const db = new PGlite();
const users = Array.from({ length: 40 }, (_, i) => `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`);
type State = { id: string; code: string; meId: string; hostId: string; hostPlays: boolean; status: string; taskCount: number; players: { id: string; score: number; completed: boolean }[]; round: { id: string; number: number; taskId: string; phase: string; secondsLeft: number | null; word: string | null; wordLength: number | null; firstLetter: string | null; wlQuestions: number[] | null; wlStep: number; wlShown: boolean; topWords: { word: string; count: number; players: string[] }[] | null; performerId: string; actual: number | null; transferred: boolean; responses: { playerId: string; submitted: boolean; finished: boolean; choice: string | null; words: string[] | null; answers: (string | null)[] | null; opponentId: string | null; tieChoice: string | null; drinks: boolean; guess: number | null; actual: number | null; points: number; rank: number | null }[]; winners: string[]; allocations: { giverId: string; recipientId: string }[] } };
async function identity(index: number) { await db.query("select set_config('test.user_id',$1,false)", [users[index]]); }
async function rpc(name: string, args: unknown[]) {
  const result = await db.query<{ value: State }>(`select public.${name}(${args.map((_, i) => `$${i + 1}`).join(',')}) as value`, args);
  return result.rows[0].value;
}
async function create(count = 6, order = ['beer', 'ten_seconds']) {
  await identity(0);
  let game = await rpc('create_game', ['Host']);
  for (let i = 1; i < count; i++) { await identity(i); await rpc('join_game', [game.code, i === 2 ? 'Duplicate' : 'Duplicate']); }
  // Fix the shuffled pool before start; start still applies the participant-sized challenge cap.
  await db.query('update game_private.sessions set task_order=$1 where id=$2', [order, game.id]);
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
  for (const migration of ['001_game.sql', '003_host_plays.sql', '004_sips_before_leaderboard.sql', '005_more_tasks.sql', '006_would_you_rather_points.sql', '007_more_challenges.sql', '008_top_five_and_second_highest.sql', '009_mime.sql', '010_wavelength.sql', '011_stricter_typos.sql', '012_host_settings.sql', '013_round_plan_and_pace.sql'])
    await db.exec(await readFile(new URL(`../supabase/migrations/${migration}`, import.meta.url), 'utf8'));
});
after(async () => { await db.close(); });
beforeEach(async () => { await db.exec('delete from game_private.sessions'); });

test('host can make any member a spectator; spectators never perform, respond, score or receive sips', async () => {
  let game = await create(6, ['height', 'ten_seconds']);
  const tv = game.players[1].id;
  for (const playerId of [game.hostId, tv]) game = await act(game, 'spectator', { playerId, value: true });
  await identity(1);
  await assert.rejects(() => act(game, 'spectator', { playerId: tv, value: false }), /Bare verten/);
  await assert.rejects(() => act(game, 'settings', { gameSips: false }), /Bare verten/);
  await assert.rejects(() => act(game, 'skip_round'), /Bare verten/);
  await identity(0);
  game = await act(game, 'start');
  assert.equal(game.round.responses.length, 4);
  assert.ok(![game.hostId, tv].includes(game.round.performerId));
  await identity(1);
  await assert.rejects(() => act(game, 'guess', { value: 180 }), /deltar ikke/);
  await identity(0);
  await assert.rejects(() => act(game, 'spectator', { playerId: tv, value: false }), /før spillet/);
  await asPlayer(game, game.round.performerId); game = await act(game, 'accept');
  await identity(0); game = await act(game, 'next'); game = await act(game, 'next');
  await asPlayer(game, game.round.performerId); game = await act(game, 'manual_result', { value: 180 });
  await identity(0); game = await act(game, 'next'); game = await act(game, 'next');
  assert.equal(game.round.phase, 'sips');
  await asPlayer(game, game.round.winners[0]);
  await assert.rejects(() => act(game, 'allocate', { recipientId: tv }), /kan ikke få/);
  for (const id of [game.hostId, tv]) assert.equal(game.players.find(p => p.id === id)!.score, 0);
});

test('spectator roles are reversible and at least two active players are required', async () => {
  let game = await create(3);
  game = await act(game, 'spectator', { playerId: game.players[1].id, value: true });
  game = await act(game, 'spectator', { playerId: game.hostId, value: true });
  await assert.rejects(() => act(game, 'start'), /minst to/);
  await assert.rejects(() => act(game, 'spectator', { playerId: game.hostId }), /Ugyldig/);
  game = await act(game, 'spectator', { playerId: game.hostId, value: false });
  game = await act(game, 'start');
  assert.equal(game.round.responses.length, 2);
});

test('each sip setting independently removes its step forwards and backwards without changing scores', async () => {
  for (const playerSips of [true, false]) for (const gameSips of [true, false]) {
    let game = await create(4, ['wyr_honest', 'ten_seconds']);
    game = await act(game, 'settings', { playerSips, gameSips });
    game = await act(game, 'start'); game = await act(game, 'next');
    for (const [i, player] of game.players.entries()) {
      await asPlayer(game, player.id); await act(game, 'choose', { value: i === 0 ? '0' : '1' });
    }
    await identity(0); game = await act(game, 'next');
    assert.deepEqual(game.round.responses.map(q => q.points).sort(), [0, 3, 3, 3]);
    assert.equal(game.round.responses.some(q => q.drinks), gameSips);
    game = await act(game, 'next');
    // Without a sips step, the reveal is the last step and the next round starts.
    if (gameSips) {
      assert.equal(game.round.phase, 'sips');
      game = await act(game, 'back'); assert.equal(game.round.phase, 'reveal');
      game = await act(game, 'next'); game = await act(game, 'next');
    }
    assert.equal(game.round.taskId, 'ten_seconds'); assert.equal(game.round.phase, 'assignment');
    game = await act(game, 'next'); game = await act(game, 'next');
    assert.equal(game.round.phase, 'reveal');
    game = await act(game, 'next');
    if (playerSips) assert.equal(game.round.phase, 'sips');
    else {
      assert.equal(game.status, 'finished');
      await assert.rejects(() => act(game, 'allocate', { recipientId: game.players[1].id }), /kan ikke dele|ikke i gang/);
    }
    await assert.rejects(() => act(game, 'settings', { playerSips: true }), /før spillet/);
  }
});

test('task selection validates repetitions, is host-only, persists and plays both chosen occurrences', async () => {
  let game = await create(4);
  for (const tasks of [[], ['missing'], ['beer', 'beer', 'beer'], ['height', 'height'], [null]])
    await assert.rejects(() => act(game, 'settings', { tasks }), /Velg minst|Ugyldig/);
  await assert.rejects(() => act(game, 'settings', { gameSips: 'false' }), /Ugyldig/);
  game = await act(game, 'settings', { tasks: ['beer', 'beer'] });
  const hostState = await rpc('game_state', [game.id]) as State & { selectedTasks: string[] };
  assert.deepEqual(hostState.selectedTasks, ['beer', 'beer']);
  await identity(1);
  const guest = await rpc('game_state', [game.id]) as State & { selectedTasks: null };
  assert.equal(guest.selectedTasks, null);
  await identity(0); game = await act(game, 'start');
  const previous = game.round.id;
  game = await act(game, 'skip_round'); assert.equal(game.round.taskId, 'beer'); assert.notEqual(game.round.id, previous);
  game = await act(game, 'skip_round'); assert.equal(game.status, 'finished');
});

test('skipping a round discards unawarded answers, retains revealed points, rejects stale requests', async () => {
  let game = await create(4, ['wyr_honest', 'wyr_beer', 'ten_seconds']);
  game = await act(game, 'start'); game = await act(game, 'next');
  await asPlayer(game, game.players[1].id); game = await act(game, 'choose', { value: '1' });
  await identity(0);
  const stale = game;
  game = await act(game, 'skip_round');
  assert.equal(game.players.every(p => p.score === 0 && !p.completed), true);
  await assert.rejects(() => act(stale, 'skip_round'), /Runden er endret/);
  game = await act(game, 'next');
  await asPlayer(game, game.players[1].id); game = await act(game, 'choose', { value: '1' });
  await identity(0); game = await act(game, 'next');
  const scores = game.players.map(p => p.score);
  assert.ok(scores.some(score => score > 0));
  game = await act(game, 'skip_round');
  assert.deepEqual(game.players.map(p => p.score), scores);
  assert.equal(game.round.taskId, 'ten_seconds');
});

test('duration simulation includes human time, task differences, player challenge limits and independent sip settings', () => {
  const opts = { playerSips: false, gameSips: false };
  const full = simulateDuration(allTaskIds, 10, opts);
  assert.deepEqual(full, simulateDuration(allTaskIds, 10, opts));
  assert.ok(full.low > 20 && full.high < 120);
  assert.ok(full.low < full.median && full.median < full.high);
  assert.ok(simulateDuration(allTaskIds, 10, { playerSips: true, gameSips: true }).median > full.median);
  assert.ok(simulateDuration(allTaskIds, 10, { ...opts, half: true }).median < full.median);
  assert.ok(simulateDuration(allTaskIds, 2, opts).rounds < full.rounds);
  assert.ok(taskTiming(taskDefinitions.beer)[1] > taskTiming(taskDefinitions.wyr_beer)[1]);
  assert.ok(simulateDuration(['beer'], 10, opts).median > simulateDuration(['wyr_beer'], 10, opts).median);
  assert.deepEqual(simulateDuration([], 10, opts), { low: 0, median: 0, high: 0, rounds: 0 });
});

test('sip giver thresholds exclude spectators, enforce immunity and leave someone unselected', async () => {
  for (const [count, hostPlays] of [[2, true], [3, true], [4, true], [5, true], [6, true], [7, true], [8, true], [30, true], [3, false], [5, false], [7, false]] as const) {
    await db.exec('delete from game_private.sessions');
    let game = await create(count, ['ten_seconds']);
    if (!hostPlays) game = await act(game, 'host_plays', { value: false });
    game = await act(game, 'start');
    // Equal scores exercise the stable join-time/ID tiebreak at the giver cutoff.
    await db.query('update game_private.responses set points=5 where round_id=$1', [game.round.id]);
    await db.query("update game_private.rounds set phase='sips',awarded=true where id=$1", [game.round.id]);
    game = await rpc('game_state', [game.id]);
    const activeCount = count - Number(!hostPlays);
    const expected = activeCount < 3 ? 0 : activeCount < 5 ? 1 : activeCount < 7 ? 2 : 3;
    assert.equal(sipGiverCount(activeCount), expected);
    assert.equal(game.round.winners.length, expected, `${count} players, host plays ${hostPlays}`);
    const active = game.players.filter(p => hostPlays || p.id !== game.hostId);
    assert.ok(game.round.winners.every(id => active.some(p => p.id === id)));
    const eligible = active.filter(p => !game.round.winners.includes(p.id));
    for (const [index, giver] of game.round.winners.entries()) {
      await asPlayer(game, giver);
      await assert.rejects(() => act(game, 'allocate', { recipientId: giver }), /kan ikke få/);
      game = await act(game, 'allocate', { recipientId: eligible[index].id });
    }
    assert.equal(game.round.allocations.length, expected);
    assert.ok(eligible.length > expected, 'at least one eligible player is spared');
    await asPlayer(game, eligible.at(-1)!.id);
    await assert.rejects(() => act(game, 'allocate', { recipientId: eligible[0].id }), /kan ikke dele ut/);
    await db.query('update game_private.responses set points=0 where round_id=$1', [game.round.id]);
    game = await rpc('game_state', [game.id]);
    assert.deepEqual(game.round.winners, []);
    await identity(0); await act(game, 'end');
  }
});

test('start fixes challenge count to active players and displayed total matches every round until finish', async () => {
  for (const [count, hostPlays] of [[2, true], [3, true], [6, true], [30, true], [4, false]] as const) {
    const order = shuffledTasks();
    let game = await create(count, order);
    if (!hostPlays) game = await act(game, 'host_plays', { value: false });
    const active = count - Number(!hostPlays);
    const expectedPlan = plannedTasks(order, active);
    assert.equal(game.taskCount, expectedPlan.length, 'lobby previews the actual total');
    game = await act(game, 'start');
    const planned = (await db.query<{ task_order: string[] }>('select task_order from game_private.sessions where id=$1', [game.id])).rows[0].task_order;
    assert.deepEqual(planned, expectedPlan);
    assert.equal(planned.filter(id => taskDefinitions[id].kind === 'challenge').length,
      Math.min(active, order.filter(id => taskDefinitions[id].kind === 'challenge').length));
    const rounds = new Set<string>();
    while (game.status === 'playing') {
      rounds.add(game.round.id);
      assert.equal(game.taskCount, expectedPlan.length);
      assert.notEqual(game.round.phase, 'leaderboard');
      assert.ok(game.round.number <= game.taskCount);
      game = await act(game, 'next');
    }
    assert.equal(rounds.size, expectedPlan.length);
    assert.equal(game.round.number, game.taskCount);
    await assert.rejects(() => act(game, 'next'), /ikke i gang/);
  }
});

test('host ending early preserves awarded scores and shows the finished state', async () => {
  let game = await create(3, ['height', 'ten_seconds']);
  game = await act(game, 'start');
  game = await playChallenge(game, 180);
  assert.equal(game.round.taskId, 'ten_seconds');
  const scores = game.players.map(p => p.score);
  assert.ok(scores.some(score => score > 0));
  await asPlayer(game, game.players[1].id);
  await assert.rejects(() => act(game, 'end'), /Bare verten/);
  await identity(0);
  game = await act(game, 'end');
  assert.equal(game.status, 'finished');
  assert.deepEqual(game.players.map(p => p.score), scores);
});

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
  await identity(0); game = await act(game, 'next'); game = await act(game, 'next');
  assert.equal(game.round.phase, 'sips');
  const winners = game.round.winners;
  assert.equal(winners.length, 2);
  const recipient = game.players.find(p => !winners.includes(p.id))!.id;
  await asPlayer(game, winners[0]);
  await assert.rejects(() => act(game, 'allocate', { recipientId: winners[1] }), /kan ikke få/);
  game = await act(game, 'allocate', { recipientId: recipient });
  await asPlayer(game, winners[1]);
  await assert.rejects(() => act(game, 'allocate', { recipientId: recipient }), /valgte spilleren først/);
  await identity(0); game = await act(game, 'next');
  assert.equal(game.round.phase, 'assignment');
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
  game = await act(game, 'next'); assert.equal(game.round.phase, 'sips');
  game = await act(game, 'next');
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
  const definition = { id: 'weight_test', title: 'Gjett vekten', description: 'Gjett vekten i gram.', kind: 'challenge',
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
  await identity(0); game = await act(game, 'next'); game = await act(game, 'next');
  assert.equal(game.round.phase, 'sips');
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

/** Plays a challenge round from assignment to the next round; the performer's result is `actual`. */
async function playChallenge(game: State, actual: number) {
  const performer = game.round.performerId;
  await asPlayer(game, performer); game = await act(game, 'accept');
  await identity(0); game = await act(game, 'next');
  const guesser = game.players.find(p => p.id !== performer)!;
  await asPlayer(game, guesser.id); await act(game, 'guess', { value: actual });
  await identity(0); game = await act(game, 'next');
  await asPlayer(game, performer);
  if (game.round.taskId === 'beer') {
    game = await act(game, 'timer_start');
    await db.query("update game_private.responses set started_at=clock_timestamp()-($1::numeric * interval '1 second') where round_id=$2 and player_id=$3", [actual, game.round.id, performer]);
    game = await act(game, 'timer_stop', { value: actual });
  } else game = await act(game, 'manual_result', { value: actual });
  await identity(0);
  for (let i = 0; i < 3; i++) game = await act(game, 'next');
  return game;
}

test('the lobby pool contains every task repeat in random order without adjacent duplicates', async () => {
  const orders = new Set<string>();
  const tasks = await db.query<{ id: string; repeat: number | null }>("select id,(definition->>'repeat')::integer as repeat from game_private.tasks");
  const expected = tasks.rows.flatMap(t => Array<string>(t.repeat ?? 1).fill(t.id)).sort();
  assert.equal(expected.filter(id => id === 'beer').length, 2);
  assert.equal(expected.filter(id => id === 'mime').length, 2);
  for (let i = 0; i < 8; i++) {
    await identity(i);
    const game = await rpc('create_game', ['Host']);
    const order = (await db.query<{ task_order: string[] }>('select task_order from game_private.sessions where id=$1', [game.id])).rows[0].task_order;
    assert.deepEqual([...order].sort(), expected);
    assert.ok(order.every((id, index) => index === 0 || id !== order[index - 1]), 'no task twice in a row');
    orders.add(order.join());
  }
  assert.ok(orders.size > 1);
  // The demo builds its order the same way.
  const demo = shuffledTasks();
  assert.deepEqual([...demo].sort(), Object.values(taskDefinitions).flatMap(t => Array<string>(t.repeat ?? 1).fill(t.id)).sort());
  assert.ok(demo.every((id, index) => index === 0 || id !== demo[index - 1]));
});

test('a task listed twice is played twice, by a new performer each time', async () => {
  let game = await create(3, ['beer', 'rps', 'beer']);
  game = await act(game, 'start');
  assert.equal(game.round.taskId, 'beer');
  const first = game.round.performerId;
  game = await playChallenge(game, 12);
  assert.equal(game.round.taskId, 'rps');
  for (let i = 0; i < 4; i++) game = await act(game, 'next');
  assert.equal(game.round.taskId, 'beer', 'the second copy comes after the everyone-task');
  assert.notEqual(game.round.performerId, first);
  game = await playChallenge(game, 15);
  assert.equal(game.status, 'finished');
});

test('challenges stop once everyone has done one, while everyone-tasks still run', async () => {
  const extra = { id: 'extra_challenge', title: 'Ekstra', description: 'Test', kind: 'challenge',
    answer: { method: 'manual', enteredBy: 'performer', unit: 'cm', min: 150, max: 250 } };
  await db.query('insert into game_private.tasks(id,definition) values($1,$2) on conflict do nothing', ['extra_challenge', extra]);
  let game = await create(2, ['beer', 'height', 'extra_challenge', 'rps']);
  game = await act(game, 'start');
  assert.equal(game.round.taskId, 'beer');
  const first = game.round.performerId;
  game = await playChallenge(game, 12);
  assert.equal(game.round.taskId, 'height');
  assert.notEqual(game.round.performerId, first);
  game = await playChallenge(game, 180);
  assert.ok(game.players.every(p => p.completed));
  assert.equal(game.round.taskId, 'rps', 'the remaining challenge is skipped, the everyone-task is not');
  // assignment -> performing -> reveal -> sips -> end
  for (let i = 0; i < 4; i++) game = await act(game, 'next');
  assert.equal(game.status, 'finished');
});

test('height challenge: the performer answers privately and guesses use the cm range', async () => {
  let game = await create(3, ['height']);
  game = await act(game, 'start');
  const performer = game.round.performerId;
  await asPlayer(game, performer); game = await act(game, 'accept');
  await identity(0); game = await act(game, 'next');
  const guesser = game.players.find(p => p.id !== performer)!;
  await asPlayer(game, guesser.id);
  await assert.rejects(() => act(game, 'guess', { value: 140 }), /utenfor/);
  await act(game, 'guess', { value: 181 });
  await identity(0); game = await act(game, 'next');
  await asPlayer(game, guesser.id);
  await assert.rejects(() => act(game, 'manual_result', { value: 180 }), /Bare den som har oppgaven/);
  await asPlayer(game, performer); game = await act(game, 'manual_result', { value: 180 });
  await asPlayer(game, guesser.id);
  assert.equal((await rpc('game_state', [game.id])).round.actual, null);
  await identity(0); game = await act(game, 'next');
  assert.equal(game.round.actual, 180);
  assert.equal(game.round.responses.find(q => q.playerId === guesser.id)!.rank, 1);
});

test('rock paper scissors: random pairs, the odd one plays the machine, ties replay, losers drink automatically', async () => {
  let game = await create(3, ['rps']);
  game = await act(game, 'start');
  assert.equal(game.round.phase, 'assignment');
  const machinePlayer = game.round.responses.find(q => q.opponentId === null)!.playerId;
  const [a, b] = game.round.responses.filter(q => q.opponentId !== null).map(q => q.playerId);
  assert.equal(game.round.responses.find(q => q.playerId === a)!.opponentId, b);
  assert.equal(game.round.responses.find(q => q.playerId === b)!.opponentId, a);
  game = await act(game, 'next');
  await asPlayer(game, a); game = await act(game, 'choose', { value: 'rock' });
  await assert.rejects(() => act(game, 'choose', { value: 'paper' }), /allerede/);
  await asPlayer(game, b);
  assert.equal((await rpc('game_state', [game.id])).round.responses.find(q => q.playerId === a)!.choice, null, 'hidden from the opponent');
  game = await act(game, 'choose', { value: 'rock' });
  const tied = game.round.responses.find(q => q.playerId === a)!;
  assert.deepEqual([tied.choice, tied.tieChoice, tied.finished], [null, 'rock', false]);
  game = await act(game, 'choose', { value: 'paper' });
  await asPlayer(game, a);
  await assert.rejects(() => act(game, 'choose', { value: 'lizard' }), /Ugyldig/);
  game = await act(game, 'choose', { value: 'scissors' });
  await identity(0); game = await act(game, 'next');
  assert.equal(game.round.responses.find(q => q.playerId === a)!.points, 3);
  assert.equal(game.round.responses.find(q => q.playerId === b)!.drinks, true);
  assert.equal(game.round.responses.find(q => q.playerId === machinePlayer)!.drinks, true, 'not choosing loses');
  game = await act(game, 'next');
  assert.equal(game.round.phase, 'sips');
  assert.deepEqual(game.round.winners, [], 'nobody hands out sips');
  await asPlayer(game, a);
  await assert.rejects(() => act(game, 'allocate', { recipientId: b }), /kan ikke dele ut/);
});

test('rock paper scissors against the machine replays ties until someone wins', async () => {
  let game = await create(3, ['rps']);
  game = await act(game, 'start'); game = await act(game, 'next');
  const player = game.round.responses.find(q => q.opponentId === null)!.playerId;
  await asPlayer(game, player);
  for (let i = 0; i < 30 && !game.round.responses.find(q => q.playerId === player)!.finished; i++) {
    game = await act(game, 'choose', { value: 'rock' });
    const own = game.round.responses.find(q => q.playerId === player)!;
    if (!own.finished) assert.equal(own.tieChoice, 'rock');
  }
  assert.equal(game.round.responses.find(q => q.playerId === player)!.choice, 'rock');
  await identity(0); game = await act(game, 'next');
  const result = game.round.responses.find(q => q.playerId === player)!;
  assert.ok(result.points === 3 || result.drinks);
  assert.ok(!(result.points === 3 && result.drinks));
});

test('would you rather: the majority scores 3, the minority and non-answerers drink; a tie does neither', async () => {
  let game = await create(4, ['wyr_naked', 'wyr_beer']);
  game = await act(game, 'start'); game = await act(game, 'next');
  const [p0, p1, p2, p3] = game.players.map(p => p.id);
  for (const [id, value] of [[p0, '0'], [p1, '0'], [p2, '1']] as const) { await asPlayer(game, id); game = await act(game, 'choose', { value }); }
  await asPlayer(game, p3);
  await assert.rejects(() => act(game, 'choose', { value: '2' }), /Ugyldig/);
  await identity(0); game = await act(game, 'next');
  const drinks = (id: string) => game.round.responses.find(q => q.playerId === id)!.drinks;
  assert.deepEqual([drinks(p0), drinks(p1), drinks(p2), drinks(p3)], [false, false, true, true]);
  const points = (id: string) => game.round.responses.find(q => q.playerId === id)!.points;
  assert.deepEqual([points(p0), points(p1), points(p2), points(p3)], [3, 3, 0, 0]);
  assert.equal(game.players.find(p => p.id === p0)!.score, 3);
  game = await act(game, 'next');
  assert.deepEqual(game.round.winners, [], 'the majority does not hand out sips');
  game = await act(game, 'next');
  assert.equal(game.round.taskId, 'wyr_beer');
  game = await act(game, 'next');
  for (const [id, value] of [[p0, '0'], [p1, '1'], [p2, '0'], [p3, '1']] as const) { await asPlayer(game, id); game = await act(game, 'choose', { value }); }
  await identity(0); game = await act(game, 'next');
  assert.ok(game.round.responses.every(q => !q.drinks && q.points === 0));
});

test('steps, snap streak and cup flip are challenges with their own guess ranges', async () => {
  for (const [task, below, lowest, highest, above] of [['steps', -1, 0, 30000, 30001], ['snap_streak', -1, 0, 5000, 5001], ['cup_flip', 0, 1, 200, 201]] as const) {
    let game = await create(3, [task]);
    game = await act(game, 'start');
    assert.equal(game.round.taskId, task);
    assert.ok(game.round.performerId, 'a challenge has a performer');
    const performer = game.round.performerId;
    await asPlayer(game, performer); game = await act(game, 'accept');
    await identity(0); game = await act(game, 'next');
    const [first, second] = game.players.filter(p => p.id !== performer);
    await asPlayer(game, first.id);
    await assert.rejects(() => act(game, 'guess', { value: below }), /utenfor/);
    await assert.rejects(() => act(game, 'guess', { value: above }), /utenfor/);
    await act(game, 'guess', { value: lowest });
    await asPlayer(game, second.id); await act(game, 'guess', { value: highest });
    await identity(0); game = await act(game, 'next');
    await asPlayer(game, performer); game = await act(game, 'manual_result', { value: highest - 1 });
    await identity(0); game = await act(game, 'next');
    const rank = (id: string) => game.round.responses.find(q => q.playerId === id)!.rank;
    assert.deepEqual([rank(second.id), rank(first.id)], [1, 2], 'closest guess wins');
    assert.equal(game.round.responses.find(q => q.playerId === performer)!.points, 5);
  }
});

test('Topp 5: words ignore case, spaces and punctuation, need two writers, and give 2 points per listed word', async () => {
  let game = await create(5, ['top5_sex']);
  game = await act(game, 'start'); game = await act(game, 'next');
  assert.ok(game.round.secondsLeft! > 55 && game.round.secondsLeft! <= 60);
  const [p0, p1, p2, p3, p4] = game.players.map(p => p.id);
  const answers: [string, string[]][] = [
    [p0, ['Sex', 'Doggy', 'Anal']], [p1, ['sEx', 'doggy ', 'kondom']], [p2, ['sexc', 'Anal!', 'kyss']],
    [p3, ['SEX', 'kyss', 'pikk']], [p4, ['pikk', 'kondom', 'gruppe sex']]];
  for (const [id, words] of answers) { await asPlayer(game, id); game = await act(game, 'words', { value: words }); }
  await assert.rejects(() => act(game, 'words', { value: ['a', 'b', 'c', 'd'] }), /inntil 3/);
  assert.deepEqual(game.round.responses.find(q => q.playerId === p4)!.words!.sort(), ['gruppesex', 'kondom', 'pikk']);
  assert.equal(game.round.responses.find(q => q.playerId === p0)!.words, null, 'other players cannot see your words');
  await identity(0); game = await act(game, 'next');
  assert.deepEqual(game.round.topWords!.map(t => [t.word, t.count]), [['sex', 3], ['anal', 2], ['doggy', 2], ['kondom', 2], ['kyss', 2]]);
  assert.deepEqual([...game.round.topWords![0].players].sort(), [p0, p1, p3].sort(), 'sexc is not sex: short words must match exactly');
  const points = (id: string) => game.round.responses.find(q => q.playerId === id)!.points;
  assert.deepEqual([points(p0), points(p1), points(p2), points(p3), points(p4)], [6, 6, 4, 4, 2]);
});

test('typos: only words of 7+ letters may be one typo apart, the same on the server and in the demo', async () => {
  const cases: [string, string, boolean][] = [
    ['sol', 'sel', false], ['katt', 'kart', false], ['sexc', 'sex', false], ['kenguru', 'kengur', false],
    ['kondomer', 'kondomr', true], ['ballettdanser', 'balettdanser', true], ['ballettdanser', 'balettdanse', false]];
  for (const [a, b, expected] of cases) {
    const result = await db.query<{ same: boolean; mime: boolean }>('select game_private.same_word($1,$2) as same,game_private.mime_match($1,$2) as mime', [a, b]);
    assert.deepEqual([result.rows[0].same, result.rows[0].mime], [expected, expected], `${a} / ${b}`);
    assert.equal(sameWord(a, b), expected, `${a} / ${b} in the demo`);
  }
});

test('Topp 5: answers are rejected after the countdown', async () => {
  let game = await create(3, ['top5_food']);
  game = await act(game, 'start'); game = await act(game, 'next');
  await db.query("update game_private.rounds set started_at=clock_timestamp()-interval '64 seconds' where id=$1", [game.round.id]);
  await assert.rejects(() => act(game, 'words', { value: ['pizza'] }), /Tiden er ute/);
  game = await rpc('game_state', [game.id]);
  assert.equal(game.round.secondsLeft, 0);
});

test('Nest mest: the highest number drinks 5, the second highest wins with position scoring', async () => {
  let game = await create(5, ['second_highest']);
  game = await act(game, 'start'); game = await act(game, 'next');
  const [p0, p1, p2, p3, p4] = game.players.map(p => p.id);
  await asPlayer(game, p0);
  await assert.rejects(() => act(game, 'choose', { value: '101' }), /Ugyldig tall/);
  await assert.rejects(() => act(game, 'choose', { value: 'abc' }), /Ugyldig tall/);
  for (const [id, value] of [[p0, '98'], [p1, '93'], [p2, '80'], [p3, '98']] as const) { await asPlayer(game, id); game = await act(game, 'choose', { value }); }
  assert.equal(game.round.responses.find(q => q.playerId === p0)!.choice, null, 'numbers are hidden until the reveal');
  await identity(0); game = await act(game, 'next');
  const result = (id: string) => { const q = game.round.responses.find(q => q.playerId === id)!; return [q.choice, q.points, q.drinks]; };
  assert.deepEqual(result(p0), ['98', 0, true]);
  assert.deepEqual(result(p3), ['98', 0, true], 'everyone tied on the highest number drinks');
  assert.deepEqual(result(p1), ['93', 6, false], 'second highest wins');
  assert.deepEqual(result(p2), ['80', 3, false]);
  assert.deepEqual(result(p4), [null, 0, false], 'no answer gives no points');
  game = await act(game, 'next');
  assert.deepEqual(game.round.winners, [], 'nobody hands out sips');
});

test('Mim det: one secret word, server-timed hints, fastest correct guess wins, the performer scores for miming', async () => {
  let game = await create(5, ['mime']);
  game = await act(game, 'start');
  const performer = game.round.performerId;
  await asPlayer(game, performer); game = await act(game, 'accept');
  await identity(0); game = await act(game, 'next');
  assert.equal(game.round.phase, 'performing', 'no separate guessing step');
  assert.equal(game.round.secondsLeft, null, 'the countdown waits for the performer');
  const guessers = game.players.filter(p => p.id !== performer).map(p => p.id);
  await asPlayer(game, guessers[0]);
  await assert.rejects(() => act(game, 'mime_word', { value: 'Katt' }), /Bare den som mimer/);
  await assert.rejects(() => act(game, 'mime_guess', { value: 'katt' }), /kan ikke gjette/);
  await asPlayer(game, performer);
  await assert.rejects(() => act(game, 'mime_start'), /Velg et ord/);
  await assert.rejects(() => act(game, 'mime_word', { value: 'to ord' }), /ett ord/);
  game = await act(game, 'mime_word', { value: 'Katt' });
  game = await act(game, 'mime_word', { value: 'Ballettdanser' });
  assert.equal(game.round.word, 'Ballettdanser', 'the performer may change the word before starting');
  game = await act(game, 'mime_start');
  assert.ok(game.round.secondsLeft! > 118 && game.round.secondsLeft! <= 120);
  await assert.rejects(() => act(game, 'mime_word', { value: 'Katt' }), /allerede i gang/);

  await asPlayer(game, guessers[0]);
  game = await rpc('game_state', [game.id]);
  assert.equal(game.round.word, null, 'guessers cannot see the word');
  assert.equal(game.round.wordLength, null);
  game = await act(game, 'mime_guess', { value: 'danser' });
  assert.equal(game.round.responses.find(q => q.playerId === guessers[0])!.finished, false, 'a wrong guess can be followed by more guesses');
  await assert.rejects(() => act(game, 'mime_guess', { value: 'ballett danser' }), /ett ord/);

  const startedAgo = (seconds: number) =>
    db.query("update game_private.rounds set started_at=clock_timestamp()-($1::numeric * interval '1 second') where id=$2", [seconds, game.round.id]);
  await startedAgo(20);
  game = await act(game, 'mime_guess', { value: 'BALLETTDANSER' });
  const own = game.round.responses.find(q => q.playerId === guessers[0])!;
  assert.equal(own.finished, true, 'guesses ignore case');
  assert.ok(own.actual! >= 20 && own.actual! < 22);
  await assert.rejects(() => act(game, 'mime_guess', { value: 'ballettdanser' }), /allerede gjettet/);

  await startedAgo(65);
  await asPlayer(game, guessers[1]);
  game = await rpc('game_state', [game.id]);
  assert.equal(game.round.wordLength, 13, 'the number of letters with 60 seconds left');
  assert.equal(game.round.firstLetter, null);
  game = await act(game, 'mime_guess', { value: 'balettdanser' });
  assert.equal(game.round.responses.find(q => q.playerId === guessers[1])!.finished, true, 'one typo is allowed for long words');

  await startedAgo(95);
  await asPlayer(game, guessers[2]);
  game = await rpc('game_state', [game.id]);
  assert.equal(game.round.firstLetter, 'B', 'the first letter with 30 seconds left');
  await startedAgo(125);
  await assert.rejects(() => act(game, 'mime_guess', { value: 'ballettdanser' }), /Tiden er ute/);

  await identity(0); game = await act(game, 'next');
  assert.equal(game.round.word, 'Ballettdanser');
  const points = (id: string) => game.round.responses.find(q => q.playerId === id)!.points;
  assert.deepEqual(guessers.map(points), [rankingPoints(4, 1), rankingPoints(4, 2), 0, 0], 'position scoring among the guessers, no guess gives 0');
  assert.equal(points(performer), 5);
  assert.ok(game.players.find(p => p.id === performer)!.completed);
});

test('Mim det: short words must match exactly, a passed-on task gives 10, and not starting gives no points', async () => {
  assert.equal(mimeMatch(normalizeWord('Sol'), normalizeWord('Sel')), false);
  assert.equal(mimeMatch(normalizeWord('17. mai'), normalizeWord('17.mai')), true);
  assert.deepEqual(mimeSuggestions('round-a'), mimeSuggestions('round-a'), 'suggestions stay the same for a round');
  assert.deepEqual(mimeSuggestions('round-a').map(s => s.level), ['Lett', 'Middels', 'Vanskelig']);

  let game = await create(3, ['mime']);
  game = await act(game, 'start');
  await asPlayer(game, game.round.performerId); game = await act(game, 'decline');
  const next = game.round.performerId;
  await asPlayer(game, next); game = await act(game, 'accept');
  await identity(0); game = await act(game, 'next');
  await asPlayer(game, next); game = await act(game, 'mime_word', { value: 'Sel' }); game = await act(game, 'mime_start');
  const guesser = game.players.find(p => p.id !== next)!.id;
  await asPlayer(game, guesser);
  game = await act(game, 'mime_guess', { value: 'sol' });
  assert.equal(game.round.responses.find(q => q.playerId === guesser)!.finished, false);
  game = await act(game, 'mime_guess', { value: 'SEL' });
  assert.equal(game.round.responses.find(q => q.playerId === guesser)!.finished, true);
  await identity(0); game = await act(game, 'next');
  assert.equal(game.round.responses.find(q => q.playerId === next)!.points, 10);

  game = await create(3, ['mime']);
  game = await act(game, 'start');
  await asPlayer(game, game.round.performerId); game = await act(game, 'accept');
  await identity(0); game = await act(game, 'next'); game = await act(game, 'next');
  assert.ok(game.round.responses.every(q => q.points === 0));
  assert.ok(game.players.every(p => !p.completed), 'not miming does not use up the challenge');
});

async function startWavelength(count: number, order = ['wavelength']) {
  let game = await create(count, order);
  game = await act(game, 'start');
  const performer = game.round.performerId;
  await asPlayer(game, performer); game = await act(game, 'accept');
  await identity(0); game = await act(game, 'next');
  return { game, performer, guessers: game.players.filter(p => p.id !== performer).map(p => p.id) };
}
async function answer(game: State, answers: [string, string][]) {
  for (const [id, value] of answers) { await asPlayer(game, id); game = await act(game, 'wl_answer', { value }); }
  await identity(0);
  return rpc('game_state', [game.id]);
}

test('Samme bølgelengde: answer like the performer or be out; 1 point per matching answer, the performer 1 per survivor', async () => {
  let { game, performer, guessers } = await startWavelength(5);
  const [g0, g1, g2, g3] = guessers;
  assert.equal(game.round.phase, 'performing', 'no separate guessing step');
  assert.equal(game.round.wlQuestions!.length, 5);
  assert.equal(new Set(game.round.wlQuestions).size, 5);
  assert.equal(game.round.wlStep, 0);

  // Question 1: g3 answers differently and is out. The result shows once everyone still in has answered.
  game = await answer(game, [[g0, '0'], [performer, '0'], [g1, '0'], [g2, '0']]);
  assert.equal(game.round.wlShown, false);
  await asPlayer(game, g0);
  game = await rpc('game_state', [game.id]);
  assert.equal(game.round.responses.find(q => q.playerId === performer)!.answers![0], '?', 'the answer stays hidden until the result');
  await assert.rejects(() => act(game, 'wl_answer', { value: '1' }), /allerede svart/);
  game = await answer(game, [[g3, '1']]);
  assert.equal(game.round.wlShown, true);
  assert.equal(game.round.responses.find(q => q.playerId === performer)!.answers![0], '0');
  await asPlayer(game, [performer, ...guessers].find(id => id !== game.hostId)!);
  await assert.rejects(() => act(game, 'wl_next', { step: 0 }), /Bare verten/);
  await identity(0); game = await act(game, 'wl_next', { step: 0 });
  assert.deepEqual([game.round.wlStep, game.round.wlShown], [1, false]);
  await asPlayer(game, g3);
  await assert.rejects(() => act(game, 'wl_answer', { value: '0' }), /er ute/);

  // Question 2: g2 does not answer; the host shows the result anyway, which puts g2 out.
  game = await answer(game, [[performer, '1'], [g0, '1'], [g1, '1']]);
  assert.equal(game.round.wlShown, false);
  game = await act(game, 'wl_reveal', { step: 1 });
  assert.equal(game.round.wlShown, true);
  game = await act(game, 'wl_next', { step: 1 });
  // Questions 3–5: g1 misses question 4, g0 matches everything.
  game = await answer(game, [[performer, '0'], [g0, '0'], [g1, '0']]);
  game = await act(game, 'wl_next', { step: 2 });
  game = await answer(game, [[performer, '1'], [g0, '1'], [g1, '0']]);
  game = await act(game, 'wl_next', { step: 3 });
  game = await answer(game, [[performer, '1'], [g0, '1']]);
  assert.equal(game.round.wlShown, true, 'only players still in are waited for');
  await assert.rejects(() => act(game, 'wl_next', { step: 4 }), /ferdig/);

  game = await act(game, 'next');
  const points = (id: string) => game.round.responses.find(q => q.playerId === id)!.points;
  assert.deepEqual([points(g0), points(g1), points(g2), points(g3)], [5, 3, 1, 0]);
  assert.equal(points(performer), 1, 'one guesser matched all five');
  assert.ok(game.players.find(p => p.id === performer)!.completed);
});

test('Samme bølgelengde: the round ends when nobody is left, and the performer then gets 0', async () => {
  let { game, performer, guessers } = await startWavelength(3);
  game = await answer(game, [[performer, '0'], [guessers[0], '0'], [guessers[1], '1']]);
  game = await act(game, 'wl_next', { step: 0 });
  game = await answer(game, [[performer, '0'], [guessers[0], '1']]);
  await assert.rejects(() => act(game, 'wl_next', { step: 1 }), /ferdig/, 'nobody left after question 2');
  game = await act(game, 'next');
  const points = (id: string) => game.round.responses.find(q => q.playerId === id)!.points;
  assert.deepEqual([points(guessers[0]), points(guessers[1]), points(performer)], [1, 0, 0]);
  assert.ok(game.players.find(p => p.id === performer)!.completed);
});

test('Samme bølgelengde: the second round of a game gets five other questions', async () => {
  let game = await create(3, ['wavelength', 'wavelength']);
  game = await act(game, 'start');
  const first = game.round.wlQuestions!;
  game = await act(game, 'next');
  assert.equal(game.round.taskId, 'wavelength');
  const second = game.round.wlQuestions!;
  assert.equal(second.length, 5);
  assert.ok(second.every(i => !first.includes(i)), 'no question is used twice in one game');
});
