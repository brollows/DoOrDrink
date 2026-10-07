import { rankingPoints, roundPhases, type Game, type Player, type Response } from './model';

type DemoGame = Game & { usedTasks: string[]; declined: string[] };
const key = 'do-or-drink-demo';
const uuid = () => crypto.randomUUID();
const read = (): DemoGame => {
  const raw = localStorage.getItem(key);
  if (!raw) throw new Error('Prøvespillet er avsluttet.');
  return JSON.parse(raw);
};
const save = (game: DemoGame) => { localStorage.setItem(key, JSON.stringify(game)); };

export function createDemo(name: string): Game {
  const players: Player[] = [name || 'Deg', 'Elias', 'Joachim', 'Tore', 'Nora', 'Emma'].map(name => ({ id: uuid(), name, score: 0, completed: false }));
  const game: DemoGame = { id: 'demo', code: '123456', hostId: players[0].id, meId: players[0].id,
    status: 'lobby', expiresAt: new Date(Date.now() + 86400000).toISOString(), taskCount: 2,
    players, round: null, usedTasks: [], declined: [] };
  save(game);
  return game;
}

export function demoState(meId?: string): Game {
  const game = structuredClone(read());
  if (meId && game.players.some(p => p.id === meId)) game.meId = meId;
  const round = game.round;
  if (round && !['reveal', 'leaderboard', 'sips'].includes(round.phase)) {
    if (game.meId !== round.performerId) round.actual = null;
    round.winners = [];
    round.responses = round.responses.map(q => ({ ...q, guess: q.playerId === game.meId ? q.guess : null,
      actual: q.playerId === game.meId && round.taskId === 'beer' ? q.actual : null,
      startedAt: q.playerId === game.meId ? q.startedAt : null, points: 0, rank: null }));
  } else if (round) {
    round.responses = round.responses.map(q => ({ ...q, startedAt: q.playerId === game.meId ? q.startedAt : null }));
  }
  return game;
}

function nextRound(game: DemoGame) {
  const taskId = ['beer', 'ten_seconds'].find(t => !game.usedTasks.includes(t));
  const pool = game.players.filter(p => !p.completed);
  if (!taskId || !pool.length) { game.status = 'finished'; return; }
  const performer = pool[Math.floor(Math.random() * pool.length)];
  game.usedTasks.push(taskId);
  game.declined = [];
  game.status = 'playing';
  game.round = { id: uuid(), number: game.usedTasks.length, taskId, phase: 'assignment',
    performerId: taskId === 'beer' ? performer.id : null, accepted: taskId !== 'beer',
    transferred: false, awarded: false, actual: null, winners: [], allocations: [],
    responses: game.players.map(p => ({ playerId: p.id, submitted: false, guess: null,
      actual: null, startedAt: null, finished: false, points: 0, rank: null })) };
}

function award(game: DemoGame) {
  const r = game.round!;
  if (r.awarded) return;
  if (r.taskId === 'ten_seconds') {
    r.responses.forEach(q => {
      if (q.startedAt && !q.finished && Date.now() - Date.parse(q.startedAt) >= 20000) {
        q.finished = true; q.submitted = true; q.actual = 20;
      }
    });
  }
  const participants = r.responses.filter(q => q.playerId !== r.performerId);
  const distance = (q: Response) => r.taskId === 'beer' ? Math.abs(q.guess! - Math.min(r.actual!, 60)) : Math.abs(q.actual! - 10);
  const valid = participants.filter(q => r.taskId === 'beer' ? q.guess !== null && r.actual !== null : q.finished && q.actual! < 20).sort((a, b) => distance(a) - distance(b));
  valid.forEach(q => {
    q.rank = valid.findIndex(other => distance(other) === distance(q)) + 1;
    q.points = rankingPoints(participants.length, q.rank);
  });
  if (r.performerId && r.actual !== null) {
    r.responses.find(q => q.playerId === r.performerId)!.points = r.transferred ? 10 : 5;
    game.players.find(p => p.id === r.performerId)!.completed = true;
  }
  r.winners = [...r.responses].filter(q => q.points > 0).sort((a, b) => b.points - a.points).slice(0, 3).map(q => q.playerId);
  game.players.forEach(p => { p.score += r.responses.find(q => q.playerId === p.id)!.points; });
  r.awarded = true;
}

export function demoAction(action: string, payload: Record<string, unknown>, meId: string): Game {
  const game = read();
  const r = game.round;
  const host = meId === game.hostId;
  if (['start', 'next', 'back', 'end'].includes(action) && !host) throw new Error('Bare verten kan styre spillet.');
  if (action === 'start' && game.status === 'lobby') nextRound(game);
  else if (action === 'end') game.status = 'finished';
  else {
    if (!r || game.status !== 'playing' || payload.roundId !== r.id) throw new Error('Runden er endret.');
    if (['next','back'].includes(action) && payload.phase !== r.phase) throw new Error('Steget er endret.');
    const q = r.responses.find(q => q.playerId === meId)!;
    if (action === 'accept' || action === 'decline') {
      if (r.phase !== 'assignment' || r.accepted || r.awarded || meId !== r.performerId) throw new Error('Du kan ikke velge nå.');
      if (action === 'accept') r.accepted = true;
      else {
        const pool = game.players.filter(p => !p.completed && p.id !== meId && !game.declined.includes(p.id));
        if (!pool.length) throw new Error('Ingen andre kan ta oppgaven. Verten kan hoppe over.');
        game.declined.push(meId); r.performerId = pool[Math.floor(Math.random() * pool.length)].id; r.transferred = true;
      }
    } else if (action === 'guess') {
      const value = Number(payload.value);
      if (r.phase !== 'guessing' || r.awarded || q.guess !== null || meId === r.performerId || !Number.isFinite(value) || value < 0 || value > 60) throw new Error('Du kan ikke svare nå.');
      q.guess = value; q.submitted = true;
    } else if (action === 'timer_start' || action === 'timer_stop') {
      if (r.phase !== 'performing' || r.awarded || q.finished || (r.taskId === 'beer' && meId !== r.performerId)) throw new Error('Du kan ikke bruke timeren nå.');
      if (action === 'timer_start') { if (q.startedAt) throw new Error('Timeren går allerede.'); q.startedAt = new Date().toISOString(); }
      else {
        if (!q.startedAt) throw new Error('Timeren er ikke startet.');
        q.actual = r.taskId === 'beer' ? Number(payload.value) : Math.min(20, Number(payload.value));
        q.finished = true; q.submitted = true;
        if (r.taskId === 'beer') r.actual = q.actual;
      }
    } else if (action === 'allocate') {
      const target = String(payload.recipientId);
      if (r.phase !== 'sips' || !r.winners.includes(meId) || !game.players.some(p => p.id === target) || r.winners.includes(target)) throw new Error('Du kan ikke velge denne spilleren.');
      if (r.allocations.some(a => a.recipientId === target || a.giverId === meId)) throw new Error('Noen valgte spilleren først, eller du har allerede valgt.');
      r.allocations.push({ giverId: meId, recipientId: target });
    } else if (action === 'next' || action === 'back') {
      const phases = roundPhases(r.taskId);
      const index = phases.indexOf(r.phase);
      if (action === 'back') { if (!index) throw new Error('Dette er første steg.'); r.phase = phases[index - 1]; }
      else if (r.phase === 'sips') nextRound(game);
      else if (r.phase === 'assignment' && !r.accepted) { award(game); nextRound(game); }
      else { const phase = phases[index + 1]; if (phase === 'reveal') award(game); r.phase = phase; }
    } else throw new Error('Ukjent handling.');
  }
  save(game);
  return demoState(meId);
}
