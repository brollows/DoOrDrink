export type Phase = 'assignment' | 'guessing' | 'performing' | 'reveal' | 'leaderboard' | 'sips';
export type Player = { id: string; name: string; score: number; completed: boolean };
export type Response = {
  playerId: string; submitted: boolean; guess: number | null; actual: number | null;
  startedAt: string | null; finished: boolean; points: number; rank: number | null;
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
  id: string; title: string; description: string; kind: 'individual' | 'everyone';
  answer: { method: 'stopwatch' | 'manual'; enteredBy?: 'host' | 'performer'; unit: string; min: number; max: number; target?: number; timeout?: number };
};
export const tasks: Record<string, Task> = {
  beer: { id: 'beer', title: 'Bånn i bøtta', description: 'Drikk en øl så fort du kan. De andre gjetter hvor mange sekunder du bruker.',
    kind: 'individual', answer: { method: 'stopwatch', unit: 'sekunder', min: 0, max: 60 } },
  ten_seconds: { id: 'ten_seconds', title: 'Perfekte 10', description: 'Start din egen timer. Stopp så nær 10 sekunder som mulig. Tiden forsvinner når du stopper.',
    kind: 'everyone', answer: { method: 'stopwatch', unit: 'sekunder', min: 0, max: 20, target: 10, timeout: 20 } }
};
/** Players who take part in rounds: everyone, except a host who only runs the game. */
export function participants(game: Game): Player[] {
  return game.hostPlays === false ? game.players.filter(p => p.id !== game.hostId) : game.players;
}
export function roundTask(round: Round): Task {
  return round.task || tasks[round.taskId];
}
export const phaseNames: Record<Phase, string> = {
  assignment: 'Oppgaven', guessing: 'Gjett', performing: 'Gjør det', reveal: 'Fasit', leaderboard: 'Poengtavle', sips: 'Slurker'
};
export function rankingPoints(count: number, rank: number) {
  return count - rank + 1 + (rank <= 2 && count >= 3 ? 1 : 0) + (rank === 1 && count >= 2 ? 2 : 0);
}
export function formatTime(value: number) {
  return value.toLocaleString('nb-NO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
export function roundPhases(taskId: string, task?: Task): Phase[] {
  return (task || tasks[taskId])?.kind === 'individual'
    ? ['assignment', 'guessing', 'performing', 'reveal', 'leaderboard', 'sips']
    : ['assignment', 'performing', 'reveal', 'leaderboard', 'sips'];
}
