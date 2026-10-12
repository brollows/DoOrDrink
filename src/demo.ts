import {
  beats,
  normalizeWord,
  participants,
  rankingPoints,
  roundPhases,
  tasks,
  topWords,
  type Game,
  type Hand,
  type Player,
  type Response,
} from "./model";

/** Local single-device game. Mirrors the server rules in supabase/migrations. */
type DemoGame = Game & {
  taskOrder: string[];
  /** When the current round entered the performing step (Topp 5 countdown). */
  performingStartedAt?: number | null;
  usedTasks: string[];
  declined: string[];
};
const key = "do-or-drink-demo";
const uuid = () => crypto.randomUUID();
const pick = <T,>(items: T[]) =>
  items[Math.floor(Math.random() * items.length)];
const shuffle = <T,>(items: T[]) =>
  items
    .map((item) => ({ item, order: Math.random() }))
    .sort((a, b) => a.order - b.order)
    .map(({ item }) => item);
const handNames: Hand[] = ["rock", "paper", "scissors"];
const read = (): DemoGame => {
  const raw = localStorage.getItem(key);
  if (!raw) throw new Error("Prøvespillet er avsluttet.");
  return JSON.parse(raw);
};
const save = (game: DemoGame) => {
  localStorage.setItem(key, JSON.stringify(game));
};

export function createDemo(name: string): Game {
  const players: Player[] = [
    name || "Erik",
    "Elias",
    "Joachim",
    "Tore",
    "Nora",
    "Emma",
  ].map((name) => ({ id: uuid(), name, score: 0, completed: false }));
  const taskOrder = shuffle(Object.keys(tasks));
  const game: DemoGame = {
    id: "demo",
    code: "123456",
    hostId: players[0].id,
    hostPlays: true,
    meId: players[0].id,
    status: "lobby",
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
    taskCount: taskOrder.length,
    players,
    round: null,
    taskOrder,
    usedTasks: [],
    declined: [],
  };
  save(game);
  return game;
}

/** What one player is allowed to see, like game_state on the server. */
export function demoState(meId?: string): Game {
  const game = structuredClone(read());
  if (meId && game.players.some((p) => p.id === meId)) game.meId = meId;
  const round = game.round;
  const { timeout, method } = round ? tasks[round.taskId].answer : { timeout: 0, method: "" };
  if (round && method === "words" && game.performingStartedAt)
    round.secondsLeft = Math.max(
      0,
      timeout! - (Date.now() - game.performingStartedAt) / 1000,
    );
  if (round && !["reveal", "leaderboard", "sips"].includes(round.phase)) {
    const challenge = tasks[round.taskId].kind === "challenge";
    if (game.meId !== round.performerId) round.actual = null;
    round.winners = [];
    round.responses = round.responses.map((q) => {
      const mine = q.playerId === game.meId;
      return {
        ...q,
        guess: mine ? q.guess : null,
        actual: mine && challenge ? q.actual : null,
        startedAt: mine ? q.startedAt : null,
        choice: mine ? q.choice : null,
        words: mine ? q.words : null,
        botChoice: null,
        drinks: false,
        points: 0,
        rank: null,
      };
    });
  } else if (round) {
    round.responses = round.responses.map((q) => ({
      ...q,
      startedAt: q.playerId === game.meId ? q.startedAt : null,
    }));
  }
  return game;
}

function nextRound(game: DemoGame) {
  const pool = participants(game).filter((p) => !p.completed);
  // Challenges only while someone still has their challenge left; everyone-tasks always.
  const taskId = game.taskOrder.find(
    (t) =>
      !game.usedTasks.includes(t) &&
      (tasks[t].kind === "everyone" || pool.length > 0),
  );
  if (!taskId) {
    game.status = "finished";
    return;
  }
  const task = tasks[taskId];
  const challenge = task.kind === "challenge";
  game.usedTasks.push(taskId);
  game.declined = [];
  game.performingStartedAt = null;
  game.status = "playing";
  const responses: Response[] = participants(game).map((p) => ({
    playerId: p.id,
    submitted: false,
    guess: null,
    actual: null,
    startedAt: null,
    finished: false,
    points: 0,
    rank: null,
    choice: null,
    opponentId: null,
    botChoice: null,
    tieChoice: null,
    drinks: false,
    words: null,
  }));
  if (task.answer.method === "rps") {
    // Random pairs; with an odd number the last player meets the machine.
    const order = shuffle(responses);
    for (let i = 0; i + 1 < order.length; i += 2) {
      order[i].opponentId = order[i + 1].playerId;
      order[i + 1].opponentId = order[i].playerId;
    }
  }
  game.round = {
    id: uuid(),
    number: game.usedTasks.length,
    taskId,
    task,
    phase: "assignment",
    performerId: challenge ? pick(pool).id : null,
    accepted: !challenge,
    transferred: false,
    awarded: false,
    actual: null,
    winners: [],
    allocations: [],
    responses,
  };
}

function awardRps(responses: Response[]) {
  for (const q of responses) {
    const opponent = responses.find((o) => o.playerId === q.opponentId);
    const won =
      q.choice !== null &&
      (q.opponentId === null
        ? beats(q.choice, q.botChoice!)
        : opponent?.choice == null || beats(q.choice, opponent.choice));
    if (won) q.points = 3;
    else q.drinks = true;
  }
}

function awardChoice(responses: Response[]) {
  const first = responses.filter((q) => q.choice === "0").length;
  const second = responses.filter((q) => q.choice === "1").length;
  const minority = first < second ? "0" : second < first ? "1" : null;
  for (const q of responses) {
    q.drinks = q.choice === null || q.choice === minority;
    // The majority wins; a tie has no majority.
    q.points = minority !== null && q.choice !== null && q.choice !== minority ? 3 : 0;
  }
}

function awardHighest(responses: Response[]) {
  // The highest number drinks; the rest are ranked from the top, so the second highest wins.
  const numbers = responses.filter((q) => q.choice !== null).map((q) => Number(q.choice));
  const top = Math.max(...numbers);
  for (const q of responses) q.drinks = q.choice !== null && Number(q.choice) === top;
  const ranked = responses
    .filter((q) => q.choice !== null && !q.drinks)
    .sort((a, b) => Number(b.choice) - Number(a.choice));
  const count = responses.filter((q) => !q.drinks).length;
  ranked.forEach((q) => {
    q.rank = ranked.findIndex((other) => other.choice === q.choice) + 1;
    q.points = rankingPoints(count, q.rank);
  });
}

function awardScores(game: DemoGame) {
  const r = game.round!;
  const task = tasks[r.taskId];
  const { min, max, target, timeout } = task.answer;
  const challenge = task.kind === "challenge";
  if (!challenge && timeout) {
    r.responses.forEach((q) => {
      if (
        q.startedAt &&
        !q.finished &&
        Date.now() - Date.parse(q.startedAt) >= timeout * 1000
      ) {
        q.finished = true;
        q.submitted = true;
        q.actual = timeout;
      }
    });
  }
  const guessers = r.responses.filter((q) => q.playerId !== r.performerId);
  const distance = (q: Response) =>
    challenge
      ? Math.abs(q.guess! - Math.max(min, Math.min(r.actual!, max)))
      : Math.abs(q.actual! - target!);
  const valid = guessers
    .filter((q) =>
      challenge
        ? q.guess !== null && r.actual !== null
        : q.finished && q.actual! < timeout!,
    )
    .sort((a, b) => distance(a) - distance(b));
  valid.forEach((q) => {
    q.rank = valid.findIndex((other) => distance(other) === distance(q)) + 1;
    q.points = rankingPoints(guessers.length, q.rank);
  });
  if (r.performerId && r.actual !== null) {
    r.responses.find((q) => q.playerId === r.performerId)!.points =
      r.transferred ? 10 : 5;
    game.players.find((p) => p.id === r.performerId)!.completed = true;
  }
}

function award(game: DemoGame) {
  const r = game.round!;
  if (r.awarded) return;
  const task = tasks[r.taskId];
  if (task.answer.method === "rps") awardRps(r.responses);
  else if (task.answer.method === "choice") awardChoice(r.responses);
  else if (task.answer.method === "highest") awardHighest(r.responses);
  else if (task.answer.method === "words") {
    r.topWords = topWords(r.responses);
    for (const q of r.responses)
      q.points = 2 * r.topWords.filter((t) => t.players.includes(q.playerId)).length;
  } else awardScores(game);
  // Only allocate-tasks have sip givers.
  r.winners =
    task.sips === "losers"
      ? []
      : [...r.responses]
          .filter((q) => q.points > 0)
          .sort((a, b) => b.points - a.points)
          .slice(0, 3)
          .map((q) => q.playerId);
  game.players.forEach((p) => {
    p.score += r.responses.find((q) => q.playerId === p.id)?.points ?? 0;
  });
  r.awarded = true;
}

function choose(r: NonNullable<Game["round"]>, q: Response, value: unknown) {
  const { method, min, max } = tasks[r.taskId].answer;
  if (r.phase !== "performing" || r.awarded || !["rps", "choice", "highest"].includes(method))
    throw new Error("Du kan ikke velge nå.");
  if (q.choice !== null) throw new Error("Du har allerede valgt.");
  const picked = String(value);
  if (method === "highest") {
    if (!/^\d{1,3}$/.test(picked) || Number(picked) < min || Number(picked) > max)
      throw new Error("Ugyldig tall.");
    q.choice = String(Number(picked));
    q.finished = true;
    return;
  }
  if (method === "choice") {
    if (!["0", "1"].includes(picked)) throw new Error("Ugyldig valg.");
    q.choice = picked;
    q.finished = true;
    return;
  }
  if (!handNames.includes(picked as Hand)) throw new Error("Ugyldig valg.");
  if (q.opponentId === null) {
    const machine = pick(handNames);
    if (machine === picked) q.tieChoice = picked;
    else Object.assign(q, { choice: picked, botChoice: machine, tieChoice: null, finished: true });
    return;
  }
  const opponent = r.responses.find((o) => o.playerId === q.opponentId)!;
  if (opponent.choice === picked) {
    // Same hand: both choose again.
    for (const player of [q, opponent])
      Object.assign(player, { choice: null, tieChoice: picked, finished: false });
  } else Object.assign(q, { choice: picked, tieChoice: null, finished: true });
}

export function demoAction(
  action: string,
  payload: Record<string, unknown>,
  meId: string,
): Game {
  const game = read();
  const r = game.round;
  const host = meId === game.hostId;
  if (["start", "next", "back", "end", "host_plays"].includes(action) && !host)
    throw new Error("Bare verten kan styre spillet.");
  if (action === "start" && game.status === "lobby") {
    if (participants(game).length < 2)
      throw new Error("Dere må være minst to spillere.");
    nextRound(game);
  } else if (action === "host_plays") {
    if (game.status !== "lobby")
      throw new Error("Dette kan bare endres før spillet starter.");
    if (typeof payload.value !== "boolean") throw new Error("Ugyldig valg.");
    game.hostPlays = payload.value;
  } else if (action === "end") game.status = "finished";
  else {
    if (!r || game.status !== "playing" || payload.roundId !== r.id)
      throw new Error("Runden er endret.");
    if (["next", "back"].includes(action) && payload.phase !== r.phase)
      throw new Error("Steget er endret.");
    const task = tasks[r.taskId];
    const challenge = task.kind === "challenge";
    const q = r.responses.find((q) => q.playerId === meId);
    if (["guess", "timer_start", "timer_stop", "choose", "words"].includes(action) && !q)
      throw new Error("Du deltar ikke i denne runden.");
    if (action === "accept" || action === "decline") {
      if (
        r.phase !== "assignment" ||
        r.accepted ||
        r.awarded ||
        meId !== r.performerId
      )
        throw new Error("Du kan ikke velge nå.");
      if (action === "accept") r.accepted = true;
      else {
        const pool = participants(game).filter(
          (p) => !p.completed && p.id !== meId && !game.declined.includes(p.id),
        );
        if (!pool.length)
          throw new Error(
            "Ingen andre kan ta oppgaven. Verten kan hoppe over.",
          );
        game.declined.push(meId);
        r.performerId = pick(pool).id;
        r.transferred = true;
      }
    } else if (action === "guess") {
      const value = Number(payload.value);
      if (
        r.phase !== "guessing" ||
        r.awarded ||
        q!.guess !== null ||
        meId === r.performerId ||
        !Number.isFinite(value) ||
        value < task.answer.min ||
        value > task.answer.max
      )
        throw new Error("Du kan ikke svare nå.");
      q!.guess = value;
      q!.submitted = true;
    } else if (action === "timer_start" || action === "timer_stop") {
      if (
        r.phase !== "performing" ||
        r.awarded ||
        q!.finished ||
        task.answer.method !== "stopwatch" ||
        (challenge && meId !== r.performerId)
      )
        throw new Error("Du kan ikke bruke timeren nå.");
      if (action === "timer_start") {
        if (q!.startedAt) throw new Error("Timeren går allerede.");
        q!.startedAt = new Date().toISOString();
      } else {
        if (!q!.startedAt) throw new Error("Timeren er ikke startet.");
        const value = Number(payload.value);
        q!.actual = challenge
          ? value
          : Math.min(task.answer.timeout!, value);
        q!.finished = true;
        q!.submitted = true;
        if (challenge) r.actual = q!.actual;
      }
    } else if (action === "manual_result") {
      const value = Number(payload.value);
      if (
        r.phase !== "performing" ||
        r.awarded ||
        r.actual !== null ||
        task.answer.method !== "manual" ||
        (task.answer.enteredBy === "host" ? !host : meId !== r.performerId)
      )
        throw new Error("Du kan ikke oppgi fasit nå.");
      if (!Number.isFinite(value) || value < 0)
        throw new Error("Oppgi en gyldig verdi.");
      r.actual = value;
      const performer = r.responses.find((o) => o.playerId === r.performerId)!;
      performer.actual = value;
      performer.finished = true;
    } else if (action === "choose") {
      choose(r, q!, payload.value);
    } else if (action === "words") {
      const { method, timeout, words = 3 } = task.answer;
      if (r.phase !== "performing" || r.awarded || method !== "words")
        throw new Error("Du kan ikke sende ord nå.");
      if (!game.performingStartedAt || Date.now() > game.performingStartedAt + (timeout! + 3) * 1000)
        throw new Error("Tiden er ute.");
      if (!Array.isArray(payload.value) || payload.value.length > words)
        throw new Error(`Du kan skrive inntil ${words} ord.`);
      q!.words = [...new Set(payload.value.map((w) => normalizeWord(String(w))).filter(Boolean))];
      q!.finished = q!.words.length > 0;
    } else if (action === "allocate") {
      const target = String(payload.recipientId);
      if (
        r.phase !== "sips" ||
        !r.winners.includes(meId) ||
        !participants(game).some((p) => p.id === target) ||
        r.winners.includes(target)
      )
        throw new Error("Du kan ikke velge denne spilleren.");
      if (
        r.allocations.some(
          (a) => a.recipientId === target || a.giverId === meId,
        )
      )
        throw new Error(
          "Noen valgte spilleren først, eller du har allerede valgt.",
        );
      r.allocations.push({ giverId: meId, recipientId: target });
    } else if (action === "next" || action === "back") {
      const phases = roundPhases(r.taskId);
      const index = phases.indexOf(r.phase);
      if (action === "back") {
        if (!index) throw new Error("Dette er første steg.");
        r.phase = phases[index - 1];
      } else if (r.phase === "leaderboard") nextRound(game);
      else if (r.phase === "assignment" && !r.accepted) {
        award(game);
        nextRound(game);
      } else {
        const phase = phases[index + 1];
        if (phase === "performing") game.performingStartedAt ??= Date.now();
        if (phase === "reveal") award(game);
        r.phase = phase;
      }
    } else throw new Error("Ukjent handling.");
  }
  save(game);
  return demoState(meId);
}
