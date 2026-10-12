import { losersDrink, participants, roundTask, type Game, type Player, type Response, type Round, type Task } from '../model';

/** Everything the round screen needs, derived once from the current game state. */
export type RoundState = {
  game: Game;
  me: Player;
  isHost: boolean;
  round: Round;
  task: Task;
  performer: Player | undefined;
  /** Missing when the host only runs the game and does not play. */
  myResponse: Response | undefined;
  /** Players the host is still waiting for in the current phase. */
  waitingOn: Player[];
  /** Whether the host may see who has answered (a playing host not before answering themselves). */
  canMonitor: boolean;
  winners: Player[];
  /** Set when someone has given this player sips. */
  recipient: Round['allocations'][number] | undefined;
  /** Players who can still receive sips. */
  recipients: Player[];
  myAllocation: Round['allocations'][number] | undefined;
  /** Losers of a task where losers drink automatically (known after the reveal). */
  drinkers: Player[];
  /** This player has to drink in the sips step, either given sips or as a loser. */
  mustDrink: boolean;
  ready: boolean;
  readyCount: number;
  readyTotal: number;
};

const playerById = (game: Game, id: string) => game.players.find(p => p.id === id)!;

export function getRoundState(game: Game): RoundState | null {
  const round = game.round;
  const myResponse = round?.responses.find(q => q.playerId === game.meId);
  if (!round) return null;

  const task = roundTask(round);
  const me = playerById(game, game.meId);
  const isHost = game.hostId === game.meId;
  const performer = game.players.find(p => p.id === round.performerId);

  const expectedGuesses = round.responses.filter(q => task.kind !== 'challenge' || q.playerId !== round.performerId);
  const submittedGuesses = expectedGuesses.filter(q => q.submitted);
  const performingResponses = round.responses.filter(q => !round.performerId || q.playerId === round.performerId);

  const winners = round.winners.map(id => playerById(game, id));
  const recipients = participants(game).filter(p => !round.winners.includes(p.id) && !round.allocations.some(a => a.recipientId === p.id));

  let ready = true, readyCount = 0, readyTotal = 0;
  if (round.phase === 'assignment') { ready = round.accepted; readyCount = +ready; readyTotal = 1; }
  if (round.phase === 'guessing') { readyCount = submittedGuesses.length; readyTotal = expectedGuesses.length; ready = readyCount === readyTotal; }
  if (round.phase === 'performing') { readyCount = performingResponses.filter(q => q.finished).length; readyTotal = performingResponses.length; ready = readyCount === readyTotal; }
  if (round.phase === 'sips') { readyCount = round.allocations.length; readyTotal = winners.length; ready = readyCount === readyTotal || !recipients.length; }

  const waitingOn = (round.phase === 'guessing'
    ? expectedGuesses.filter(q => !q.submitted)
    : performingResponses.filter(q => !q.finished)
  ).map(q => playerById(game, q.playerId));

  const recipient = round.allocations.find(a => a.recipientId === game.meId);
  const drinkers = round.responses.filter(q => q.drinks).map(q => playerById(game, q.playerId));

  return {
    game, me, isHost, round, task, performer, myResponse, waitingOn,
    canMonitor: isHost && (!myResponse || round.phase !== 'guessing' || myResponse.submitted || me.id === round.performerId),
    winners,
    recipient,
    recipients,
    myAllocation: round.allocations.find(a => a.giverId === game.meId),
    drinkers,
    mustDrink: losersDrink(task) ? Boolean(myResponse?.drinks) : Boolean(recipient),
    ready, readyCount, readyTotal,
  };
}
