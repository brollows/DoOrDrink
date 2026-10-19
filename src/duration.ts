import { tasks, type Task } from './model';

/** Every selectable occurrence has its own stable key, including identical repeats. */
export const taskSlots = Object.values(tasks)
  .sort((a, b) => a.kind.localeCompare(b.kind) || a.title.localeCompare(b.title, 'nb') || a.id.localeCompare(b.id))
  .flatMap(task => Array.from({ length: task.repeat ?? 1 }, (_, index) => ({ task, index, key: `${task.id}:${index}` })));
export const allTaskIds = taskSlots.map(slot => slot.task.id);

/** Assumptions in seconds: setup/reading, guessing and performance (low / typical / high).
 * These are planning assumptions, not observations from real sessions. Score reading and social
 * pauses are added separately. Simultaneous responses are not multiplied by the player count.
 */
export function taskTiming(task: Task): [number, number, number] {
  switch (task.id) {
    case 'beer': return [55, 90, 155]; // get a drink, accept, guesses, perform and reset
    case 'cup_flip': return [45, 75, 145];
    case 'height': return [30, 45, 75];
    case 'steps': case 'snap_streak': return [45, 65, 110]; // find the value in another app
  }
  switch (task.answer.method) {
    case 'mime': return [65, 110, 165]; // word selection plus up to 120 seconds of miming
    case 'wavelength': return [20, 30, 45]; // setup; question time is simulated separately
    case 'words': return [70, 80, 100]; // includes the full 60-second writing window
    case 'choice': return [20, 35, 60];
    case 'rps': return [25, 45, 80]; // includes ties and reselecting
    case 'highest': return [20, 30, 50];
    default: return [25, 40, 65];
  }
}

type Options = { playerSips: boolean; gameSips: boolean; half?: boolean; runs?: number; seed?: number };
export type DurationEstimate = { low: number; median: number; high: number; rounds: number };

/** Seeded Monte Carlo. Returns p10 / p50 / p90 minutes; the interval is an assumption range,
 * not a measured confidence interval. Mirrors the one-completed-challenge-per-player rule.
 */
export function simulateDuration(ids: string[], players: number, options: Options): DurationEstimate {
  if (!ids.length || players < 2) return { low: 0, median: 0, high: 0, rounds: 0 };
  let seed = options.seed ?? 271828;
  const random = () => { seed = (Math.imul(1664525, seed) + 1013904223) >>> 0; return seed / 4294967296; };
  const triangular = (a: number, mode: number, b: number) => {
    const u = random(), f = (mode - a) / (b - a);
    return u < f ? a + Math.sqrt(u * (b - a) * (mode - a)) : b - Math.sqrt((1 - u) * (b - a) * (b - mode));
  };
  const times: number[] = [], counts: number[] = [];
  const canonicalIds = [...ids].sort();
  for (let run = 0; run < (options.runs ?? 800); run++) {
    const order = canonicalIds.map(id => ({ id, sort: random() })).sort((a, b) => a.sort - b.sort)
      .slice(0, options.half ? Math.ceil(ids.length / 2) : ids.length);
    const pace = triangular(0.85, 1, 1.4); // the same group's pace is correlated across rounds
    let completed = 0, seconds = triangular(45, 90, 180), rounds = 0;
    for (const { id } of order) {
      const task = tasks[id];
      if (!task || (task.kind === 'challenge' && completed >= players)) continue;
      rounds++;
      const [a, m, b] = taskTiming(task);
      seconds += triangular(a, m, b) * pace;
      if (task.answer.method === 'wavelength') {
        let alive = players - 1;
        for (let question = 0; question < (task.answer.questions ?? 5); question++) {
          seconds += triangular(12, 20, 35) * pace; // read, answer, react to result
          alive = Array.from({ length: alive }).filter(() => random() < 0.62).length;
          if (!alive) break;
        }
      }
      // Reveal + total leaderboard: time to find names, read scores and react.
      seconds += (triangular(12, 20, 35) + triangular(8, 13, 23) + Math.min(players, 20) * 1.1) * pace;
      const sipStep = task.sips === 'losers' ? options.gameSips : options.playerSips;
      if (sipStep) seconds += (task.sips === 'losers' ? triangular(10, 18, 35) : triangular(18, 30, 55)) * pace;
      // A failed/refused challenge leaves that player's challenge available later.
      if (task.kind === 'challenge' && random() < 0.93) completed++;
      // Ordinary small interruptions; excludes long breaks and time spent joining the lobby.
      if (random() < 0.12) seconds += triangular(15, 35, 90) * pace;
    }
    times.push(seconds / 60); counts.push(rounds);
  }
  times.sort((a, b) => a - b);
  counts.sort((a, b) => a - b);
  const quantile = (q: number) => Math.round(times[Math.floor((times.length - 1) * q)]);
  return { low: quantile(0.1), median: quantile(0.5), high: quantile(0.9), rounds: counts[Math.floor(counts.length / 2)] };
}
export const durationLabel = (estimate: DurationEstimate) => `${estimate.low}–${estimate.high} min`;
