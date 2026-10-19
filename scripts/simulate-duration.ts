import { allTaskIds, durationLabel, simulateDuration } from '../src/duration';

// Reproducible planning estimates. No browser, database or real session data required.
for (const players of [10, 11]) {
  console.log(`\n${players} aktive spillere, 800 simulerte økter per alternativ:`);
  for (const half of [false, true]) for (const drinking of [true, false]) {
    const estimate = simulateDuration(allTaskIds, players, { half, playerSips: drinking, gameSips: drinking });
    console.log(`${half ? 'Halvparten' : 'Alle oppgaver'}, ${drinking ? 'med slurker' : 'uten slurker'}: ${durationLabel(estimate)} (median ${estimate.median} min, ca. ${estimate.rounds} runder)`);
  }
}
