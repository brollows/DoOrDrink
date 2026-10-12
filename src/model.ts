export type Phase = 'assignment' | 'guessing' | 'performing' | 'reveal' | 'sips' | 'leaderboard';
export type Player = { id: string; name: string; score: number; completed: boolean };
export type Response = {
  playerId: string; submitted: boolean; guess: number | null; actual: number | null;
  startedAt: string | null; finished: boolean; points: number; rank: number | null;
  /** Rock paper scissors hand, or '0'/'1' for a would-you-rather option. Hidden from others until the reveal. */
  choice: string | null;
  /** Rock paper scissors opponent; null means playing against the machine. */
  opponentId: string | null;
  botChoice: string | null;
  /** Set when the last rock paper scissors attempt was a tie and the player must choose again. */
  tieChoice: string | null;
  /** Lost a task where losers drink automatically. */
  drinks: boolean;
};
export type Round = {
  id: string; number: number; taskId: string; task?: Task; phase: Phase; performerId: string | null;
  accepted: boolean; transferred: boolean; awarded: boolean; actual: number | null;
  responses: Response[]; winners: string[];
  allocations: { giverId: string; recipientId: string }[];
};
export type Game = {
  id: string; code: string; hostId: string;
  /** False when the host only runs the game (e.g. on a TV) and does not play. */
  hostPlays: boolean;
  meId: string; status: 'lobby' | 'playing' | 'finished';
  expiresAt: string; taskCount: number; players: Player[]; round: Round | null;
};
export type Task = {
  id: string; title: string; description: string;
  /** challenge: one player performs and the others guess, once per player. everyone: all players take part. */
  kind: 'challenge' | 'everyone';
  /** allocate (default): the round's top three hand out sips. losers: losers drink automatically. */
  sips?: 'allocate' | 'losers';
  /** Shown to the performer of a manual challenge. */
  question?: string;
  /** Shown to guessers; {name} is replaced with the performer's name. */
  guessQuestion?: string;
  /** The two alternatives of a would-you-rather task. */
  options?: [string, string];
  answer: {
    method: 'stopwatch' | 'manual' | 'rps' | 'choice'; enteredBy?: 'host' | 'performer';
    unit: string; min: number; max: number; step?: number; target?: number; timeout?: number;
  };
};

const wouldYouRather = (id: string, options: [string, string]): Task => ({
  id, title: 'Ville du helst …', description: 'Alle velger. Flertallet får 3 poeng, mindretallet tar 3 slurker.',
  kind: 'everyone', sips: 'losers', options, answer: { method: 'choice', unit: '', min: 0, max: 0 },
});

/** Same definitions as game_private.tasks on the server. Used by the local demo and as a fallback. */
export const tasks: Record<string, Task> = {
  beer: { id: 'beer', title: 'Bånn i bøtta', description: 'Drikk en øl så fort du kan. De andre gjetter hvor mange sekunder du bruker.',
    guessQuestion: 'Hvor mange sekunder bruker {name} på å drikke ølen?',
    kind: 'challenge', answer: { method: 'stopwatch', unit: 'sekunder', min: 0, max: 60 } },
  ten_seconds: { id: 'ten_seconds', title: 'Perfekte 10', description: 'Start din egen timer. Stopp så nær 10 sekunder som mulig. Tiden forsvinner når du stopper.',
    kind: 'everyone', answer: { method: 'stopwatch', unit: 'sekunder', min: 0, max: 20, target: 10, timeout: 20 } },
  height: { id: 'height', title: 'Kjenn kompisen', description: 'Svar ærlig i appen, og ikke si svaret høyt. De andre gjetter.',
    question: 'Hvor høy er du?', guessQuestion: 'Hvor høy er {name}?',
    kind: 'challenge', answer: { method: 'manual', enteredBy: 'performer', unit: 'cm', min: 150, max: 250, step: 1 } },
  rps: { id: 'rps', title: 'Stein, saks, papir', description: 'Alle får en tilfeldig motstander. Vinneren får 3 poeng, taperen tar 3 slurker.',
    kind: 'everyone', sips: 'losers', answer: { method: 'rps', unit: '', min: 0, max: 0 } },
  wyr_naked: wouldYouRather('wyr_naked', ['Hatt en kjæreste som gråter hver gang du kler av deg', 'Hatt en kjæreste som ler hver gang du kler av deg']),
  wyr_honest: wouldYouRather('wyr_honest', ['Måttet si høyt alt du tenker resten av kvelden', 'Ikke fått si et eneste ord resten av kvelden']),
  wyr_history: wouldYouRather('wyr_history', ['Fått nettleserhistorikken din vist på storskjerm', 'Fått alle meldingene dine lest høyt for familien']),
  wyr_wake_up: wouldYouRather('wyr_wake_up', ['Våknet ved siden av eksen din', 'Våknet ved siden av sjefen din']),
  wyr_beer: wouldYouRather('wyr_beer', ['Bare drukket lunken øl resten av livet', 'Aldri drukket alkohol igjen']),
};

export type Hand = 'rock' | 'paper' | 'scissors';
export const hands: Record<Hand, string> = { rock: 'Stein', paper: 'Papir', scissors: 'Saks' };
export function beats(a: string, b: string) {
  return (a === 'rock' && b === 'scissors') || (a === 'scissors' && b === 'paper') || (a === 'paper' && b === 'rock');
}
export function losersDrink(task: Task) {
  return task.sips === 'losers';
}
export function guessQuestion(task: Task, name: string) {
  return task.guessQuestion?.replace('{name}', name) || `Oppgi ditt tips i ${task.answer.unit}.`;
}
/** Players who take part in rounds: everyone, except a host who only runs the game. */
export function participants(game: Game): Player[] {
  return game.hostPlays === false ? game.players.filter(p => p.id !== game.hostId) : game.players;
}
export function roundTask(round: Round): Task {
  return round.task || tasks[round.taskId];
}
export const phaseNames: Record<Phase, string> = {
  assignment: 'Oppgaven', guessing: 'Gjett', performing: 'Gjør det', reveal: 'Fasit', sips: 'Slurker', leaderboard: 'Poengtavle'
};
export function rankingPoints(count: number, rank: number) {
  return count - rank + 1 + (rank <= 2 && count >= 3 ? 1 : 0) + (rank === 1 && count >= 2 ? 2 : 0);
}
export function formatTime(value: number) {
  return value.toLocaleString('nb-NO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
/** A guess or result in the task's precision: whole numbers for whole-step answers like cm. */
export function formatAnswer(value: number, task: Task) {
  return (task.answer.step ?? 0.1) >= 1 ? Math.round(value).toLocaleString('nb-NO') : formatTime(value);
}
export function roundPhases(taskId: string, task?: Task): Phase[] {
  return (task || tasks[taskId])?.kind === 'challenge'
    ? ['assignment', 'guessing', 'performing', 'reveal', 'sips', 'leaderboard']
    : ['assignment', 'performing', 'reveal', 'sips', 'leaderboard'];
}
