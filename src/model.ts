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
  /** Topp 5: the player's words, normalized. Hidden from others until the reveal. */
  words?: string[] | null;
  /**
   * Samme bølgelengde: '0'/'1' per question. Others see '?' for an answer to the current question
   * until its result is shown.
   */
  answers?: (string | null)[] | null;
};
export type TopWord = { word: string; count: number; players: string[] };
export type Round = {
  id: string; number: number; taskId: string; task?: Task; phase: Phase; performerId: string | null;
  accepted: boolean; transferred: boolean; awarded: boolean; actual: number | null;
  /** Topp 5: seconds left to write, counted by the server so every phone agrees. */
  secondsLeft?: number | null;
  /** Topp 5: the most written words after the reveal. */
  topWords?: TopWord[] | null;
  /** Mim det: the word, for the performer and after the reveal. */
  word?: string | null;
  /** Mim det: hints, given with 60 and 30 seconds left. */
  wordLength?: number | null;
  firstLetter?: string | null;
  /** Samme bølgelengde: indexes into task.questions, the current question (0-based) and whether its result is shown. */
  wlQuestions?: number[] | null;
  wlStep?: number | null;
  wlShown?: boolean | null;
  responses: Response[]; winners: string[];
  allocations: { giverId: string; recipientId: string }[];
};
export type Game = {
  id: string; code: string; hostId: string;
  /** False when the host only runs the game (e.g. on a TV) and does not play. */
  hostPlays: boolean;
  meId: string; status: 'lobby' | 'playing' | 'finished';
  expiresAt: string; taskCount: number; players: Player[]; round: Round | null;
  /** Demo only: started from the hidden test page (/test). */
  test?: boolean;
};
export type Task = {
  id: string; title: string; description: string;
  /** challenge: one player performs and the others guess, once per player. everyone: all players take part. */
  kind: 'challenge' | 'everyone';
  /** How many times the task appears in a game (default 1). */
  repeat?: number;
  /** allocate (default): the round's top three hand out sips. losers: losers drink automatically. */
  sips?: 'allocate' | 'losers';
  /** How many sips losers drink (default 3). */
  sipCount?: number;
  /** Shown to the performer of a manual challenge. */
  question?: string;
  /** Shown to guessers; {name} is replaced with the performer's name. */
  guessQuestion?: string;
  /** The two alternatives of a would-you-rather task. */
  options?: [string, string];
  /** Samme bølgelengde: the question pool; each round uses answer.questions of them. */
  questions?: WavelengthQuestion[];
  answer: {
    method: 'stopwatch' | 'manual' | 'rps' | 'choice' | 'words' | 'highest' | 'mime' | 'wavelength';
    /** Samme bølgelengde: questions per round. */
    questions?: number; enteredBy?: 'host' | 'performer';
    /** Topp 5: how many words each player may write. */
    words?: number;
    /** counter: the performer taps once per attempt instead of typing the result. */
    input?: 'counter';
    unit: string; min: number; max: number; step?: number; target?: number; timeout?: number;
  };
};

export type WavelengthQuestion = { question: string; options: [string, string] };

const wavelengthQuestions: WavelengthQuestion[] = [
  ['Hva er verst dagen derpå?', 'Hodepine', 'Kvalme'],
  ['Hva er mest attraktivt?', 'Humor', 'Selvtillit'],
  ['Hva er verst på byen?', 'Bli avvist', 'Bli kastet ut'],
  ['Hvilken superkraft ville du valgt?', 'Usynlighet', 'Tankelesing'],
  ['Hva er mest irriterende?', 'Folk som avbryter', 'Folk som skryter'],
  ['Hva ville du helst vunnet?', '1 million kroner', 'Gratis ferier resten av livet'],
  ['Hva er mest flaut?', 'Falle foran mange folk', 'Bli tatt i å lyve'],
  ['Hva er mest irriterende i en vennegjeng?', 'Han som alltid er sen', 'Han som aldri betaler'],
  ['Hva er viktigst hos en partner?', 'Samme humor', 'Samme interesser'],
  ['Hva er best etter en fyllekule?', "McDonald's", 'Kebab'],
  ['Hva er verst på en fest?', 'En som blir for full', 'En som starter drama'],
  ['Hva er best på ferie?', 'Syden', 'Storby'],
  ['Hva ville du helst opplevd?', 'Reise 100 år tilbake', 'Reise 100 år frem'],
  ['Hva er verst på en første date?', 'Dårlig ånde', 'Dårlig humor'],
  ['Hva er best?', 'Pepsi Max', 'Coca-Cola'],
  ['Hva ville du helst hatt?', 'Ubegrenset penger', 'Ubegrenset fritid'],
  ['Hva ville du helst vært?', 'Verdens beste idrettsutøver', 'Verdens beste musiker'],
  ['Hva er verst i et forhold?', 'Utroskap', 'Konstant sjalusi'],
  ['Hva ville du helst sluppet resten av livet?', 'Å vaske klær', 'Å lage mat'],
  ['Hva er best på en lørdagskveld?', 'Hjemmefest', 'Bytur'],
].map(([question, a, b]) => ({ question, options: [a, b] }));

const wouldYouRather = (id: string, options: [string, string]): Task => ({
  id, title: 'Ville du helst …', description: 'Alle velger. Flertallet får 3 poeng, mindretallet tar 3 slurker.',
  kind: 'everyone', sips: 'losers', options, answer: { method: 'choice', unit: '', min: 0, max: 0 },
});

const topFive = (id: string, title: string, theme: string): Task => ({
  id, title: `Topp 5: ${title}`, question: theme,
  description: 'Skriv 3 ord du forbinder med temaet. Bare ett ord per felt. 2 poeng for hvert ord som havner på topp 5.',
  kind: 'everyone', answer: { method: 'words', words: 3, timeout: 60, unit: '', min: 0, max: 0 },
});

/** Same definitions as game_private.tasks on the server. Used by the local demo and as a fallback. */
export const tasks: Record<string, Task> = {
  beer: { id: 'beer', title: 'Bånn i bøtta', description: 'Drikk en øl så fort du kan. De andre gjetter hvor mange sekunder du bruker.',
    guessQuestion: 'Hvor mange sekunder bruker {name} på å drikke ølen?',
    kind: 'challenge', repeat: 2, answer: { method: 'stopwatch', unit: 'sekunder', min: 0, max: 60 } },
  ten_seconds: { id: 'ten_seconds', title: 'Perfekte 10', description: 'Start din egen timer. Stopp så nær 10 sekunder som mulig. Tiden forsvinner når du stopper.',
    kind: 'everyone', answer: { method: 'stopwatch', unit: 'sekunder', min: 0, max: 20, target: 10, timeout: 20 } },
  height: { id: 'height', title: 'Kjenn kompisen', description: 'Svar ærlig i appen, og ikke si svaret høyt. De andre gjetter.',
    question: 'Hvor høy er du?', guessQuestion: 'Hvor høy er {name}?',
    kind: 'challenge', answer: { method: 'manual', enteredBy: 'performer', unit: 'cm', min: 150, max: 250, step: 1 } },
  steps: { id: 'steps', title: 'Skritteller', description: 'Sjekk helse-appen og svar i appen, uten å si det høyt. De andre gjetter.',
    question: 'Hvor mange skritt har du gått i dag?', guessQuestion: 'Hvor mange skritt har {name} gått i dag?',
    kind: 'challenge', answer: { method: 'manual', enteredBy: 'performer', unit: 'skritt', min: 0, max: 30000, step: 100 } },
  snap_streak: { id: 'snap_streak', title: 'Snap-streak', description: 'Sjekk Snapchat og svar i appen, uten å si det høyt. De andre gjetter.',
    question: 'Hvor lang er den største snap-streaken din?', guessQuestion: 'Hvor lang er den største snap-streaken til {name}?',
    kind: 'challenge', answer: { method: 'manual', enteredBy: 'performer', unit: 'dager', min: 0, max: 5000, step: 1 } },
  cup_flip: { id: 'cup_flip', title: 'Hvor mange?', description: 'Sett en kopp på bordkanten og flipp den så den lander andre veien opp. De andre gjetter hvor mange forsøk du trenger.',
    guessQuestion: 'Hvor mange forsøk bruker {name} på å flippe koppen?',
    kind: 'challenge', answer: { method: 'manual', enteredBy: 'performer', input: 'counter', unit: 'forsøk', min: 1, max: 200, step: 1 } },
  mime: { id: 'mime', title: 'Mim det!', description: 'Velg ett ord og mim det uten å si noe. De andre har 120 sekunder på å gjette. Raskest får mest poeng.',
    guessQuestion: 'Hva mimer {name}? Svaret er ett ord.',
    kind: 'challenge', repeat: 2, answer: { method: 'mime', timeout: 120, unit: 'sekunder', min: 0, max: 120 } },
  wavelength: { id: 'wavelength', title: 'Samme bølgelengde',
    description: 'Svar likt som den som er trukket ut, på 5 spørsmål. Svarer du ulikt, er du ute. 1 poeng for hvert like svar.',
    kind: 'challenge', repeat: 2, questions: wavelengthQuestions, answer: { method: 'wavelength', questions: 5, unit: '', min: 0, max: 0 } },
  rps: { id: 'rps', title: 'Stein, saks, papir', description: 'Alle får en tilfeldig motstander. Vinneren får 3 poeng, taperen tar 3 slurker.',
    kind: 'everyone', sips: 'losers', answer: { method: 'rps', unit: '', min: 0, max: 0 } },
  top5_sex: topFive('top5_sex', 'Sex', 'Sex'),
  top5_drunk: topFive('top5_drunk', 'Ord for å være full', 'Ord for å være full'),
  top5_vors: topFive('top5_vors', 'Vorspiel', 'Ting man finner på et vorspiel'),
  top5_food: topFive('top5_food', 'Fyllemat', 'Fyllemat'),
  top5_regret: topFive('top5_regret', 'Dagen derpå', 'Ting man angrer på dagen derpå'),
  second_highest: { id: 'second_highest', title: 'Nest mest', description: 'Velg et tall fra 0 til 100. Høyest taper og tar 5 slurker. Nest høyest vinner.',
    kind: 'everyone', sips: 'losers', sipCount: 5, answer: { method: 'highest', unit: '', min: 0, max: 100, step: 1 } },
  wyr_naked: wouldYouRather('wyr_naked', ['Hatt en kjæreste som gråter hver gang du kler av deg', 'Hatt en kjæreste som ler hver gang du kler av deg']),
  wyr_honest: wouldYouRather('wyr_honest', ['Måttet si høyt alt du tenker resten av kvelden', 'Ikke fått si et eneste ord resten av kvelden']),
  wyr_history: wouldYouRather('wyr_history', ['Fått nettleserhistorikken din vist på storskjerm', 'Fått alle meldingene dine lest høyt for familien']),
  wyr_wake_up: wouldYouRather('wyr_wake_up', ['Våknet ved siden av eksen din', 'Våknet ved siden av sjefen din']),
  wyr_beer: wouldYouRather('wyr_beer', ['Bare drukket lunken øl resten av livet', 'Aldri drukket alkohol igjen']),
};

/** Suggested words for Mim det, one is offered from each level. */
export const mimeWords = {
  Lett: ['Katt', 'Kanin', 'Slange', 'Løve', 'Kenguru', 'Hund', 'Sel', 'Bjørn', 'Fisk', 'Pingvin', 'Sykle', 'Skiskyting', 'Støvsuge',
    'Baby', 'Brannmann', 'Frisør', 'Lærer', 'Politi', 'Konge', 'Banan', 'Kake', 'Is', 'Sitron', 'Suppe'],
  Middels: ['Forkjølet', 'Forelsket', 'Sulten', 'Kvalm', 'Edderkopp', 'Brennmanet', 'Maur', 'Mygg', 'Snegle', 'Sykepleier', 'Tyv',
    'Ballettdanser', 'Kunstner', 'Journalist', 'Bestemor', 'Fjellklatrer', 'Baker', 'Skuespiller', 'Drømme', 'Gravemaskin', 'Buss',
    'Motorsykkel', 'Heisekran', 'Telt', 'Hengekøye', 'Fiskestang', 'Redningsvest', 'Matpakke', 'Termos', 'Blomst', 'Vulkan', 'Snøball',
    'Regnvær', 'Storm'],
  Vanskelig: ['Tannfeen', 'Supermann', 'Sirkusklovn', 'Julaften', 'Nyttårsaften', 'Bursdag', '17.mai', 'Sommerferie', 'Julenissen',
    'Snømann', 'Ridder', 'Sjørøver', 'Spøkelse', 'TV', 'Monopol', 'Kortstokk', 'Yatzy'],
};
/** One suggestion per level, the same on every reload of a round. */
export function mimeSuggestions(seed: string) {
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return Object.entries(mimeWords).map(([level, words], index) => ({ level, word: words[(hash + index * 7919) % words.length] }));
}

export type Hand = 'rock' | 'paper' | 'scissors';
export const hands: Record<Hand, string> = { rock: 'Stein', paper: 'Papir', scissors: 'Saks' };
export function beats(a: string, b: string) {
  return (a === 'rock' && b === 'scissors') || (a === 'scissors' && b === 'paper') || (a === 'paper' && b === 'rock');
}
export function losersDrink(task: Task) {
  return task.sips === 'losers';
}
export function sipCount(task: Task) {
  return task.sipCount ?? 3;
}

/** One word, compared without case, spaces or punctuation (same as normalize_word on the server). */
export function normalizeWord(word: string) {
  return word.toLocaleLowerCase('nb-NO').replace(/[\s\p{P}\p{S}]/gu, '').slice(0, 24);
}
function editDistance(a: string, b: string) {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++)
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    previous = current;
  }
  return previous[b.length];
}
/** Equal, or one typo when both words have 7+ letters (same_word on the server). Short words must match exactly. */
export function sameWord(a: string, b: string) {
  return a === b || (Math.min(a.length, b.length) >= 7 && editDistance(a, b) <= 1);
}
/** The five most written word groups (at least two writers). Mirrors award_round on the server. */
export function topWords(responses: Response[]): TopWord[] {
  const writers = new Map<string, Set<string>>();
  for (const q of responses) for (const word of q.words ?? []) writers.set(word, (writers.get(word) ?? new Set()).add(q.playerId));
  const ordered = [...writers].sort(([a, x], [b, y]) => y.size - x.size || (a < b ? -1 : 1));
  const groups: { word: string; players: Set<string> }[] = [];
  for (const [word, players] of ordered) {
    const group = groups.find(g => sameWord(word, g.word));
    if (group) players.forEach(id => group.players.add(id));
    else groups.push({ word, players: new Set(players) });
  }
  return groups.map((g, index) => ({ ...g, index })).filter(g => g.players.size >= 2)
    .sort((a, b) => b.players.size - a.players.size || a.index - b.index).slice(0, 5)
    .map(g => ({ word: g.word, count: g.players.size, players: [...g.players] }));
}
/** Mim det: the same rule as Topp 5 (mime_match on the server). Both words normalized. */
export function mimeMatch(guess: string, word: string) {
  return sameWord(guess, word);
}
/** Samme bølgelengde: how many of the first `steps` questions were answered like the performer, in a row (wl_streak). */
export function wlStreak(mine: (string | null)[] | null | undefined, fasit: (string | null)[] | null | undefined, steps: number) {
  for (let i = 0; i < steps; i++) if (mine?.[i] == null || fasit?.[i] == null || mine[i] !== fasit[i]) return i;
  return steps;
}
/** Samme bølgelengde: where the round stands, derived from the round and the answers. */
export function wavelengthStatus(round: Round) {
  const task = roundTask(round);
  const total = task.answer.questions ?? 5;
  const step = round.wlStep ?? 0;
  const shown = Boolean(round.wlShown);
  const fasit = round.responses.find(q => q.playerId === round.performerId)?.answers ?? [];
  const guessers = round.responses.filter(q => q.playerId !== round.performerId);
  // Still in the game at the current question: every earlier answer matched.
  const alive = guessers.filter(q => wlStreak(q.answers, fasit, step) === step);
  const survivors = shown ? alive.filter(q => q.answers?.[step] === fasit[step]) : alive;
  const done = shown && (step === total - 1 || survivors.length === 0);
  const index = round.wlQuestions?.[step];
  return { total, step, shown, done, fasit, guessers, alive, survivors,
    question: index == null ? undefined : task.questions?.[index] };
}
/** Every task `repeat` times in a random order, without the same task twice in a row when possible (shuffled_tasks). */
export function shuffledTasks(random = Math.random) {
  const ids = Object.values(tasks).flatMap(task => Array<string>(Math.max(1, task.repeat ?? 1)).fill(task.id));
  let order = ids;
  for (let attempt = 0; attempt < 50; attempt++) {
    order = ids.map(id => ({ id, order: random() })).sort((a, b) => a.order - b.order).map(({ id }) => id);
    if (order.every((id, i) => i === 0 || id !== order[i - 1])) break;
  }
  return order;
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
  const definition = task || tasks[taskId];
  // Mim det and Samme bølgelengde have no separate guessing step: the others play along in the performing step.
  return definition?.kind === 'challenge' && !['mime', 'wavelength'].includes(definition.answer.method)
    ? ['assignment', 'guessing', 'performing', 'reveal', 'sips', 'leaderboard']
    : ['assignment', 'performing', 'reveal', 'sips', 'leaderboard'];
}
