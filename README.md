# DoOrDrink

A Norwegian multiplayer PWA built with React, Vite, TypeScript, React Router, Supabase and Netlify. Tasks: the challenges **Bånn i bøtta**, **Kjenn kompisen**, **Skritteller**, **Snap-streak** and **Hvor mange?** (cup flip), **Mim det!** and **Samme bølgelengde**, and for everyone **Perfekte 10**, **Stein, saks, papir**, **Nest mest**, five **Topp 5** themes and five **Ville du helst** questions.

## Run locally

Use Node.js 22 or newer.

```powershell
cd C:\Users\Erik Faane\DoOrDrink
npm install
npm run dev
```

Open http://localhost:5173/test (hidden, not linked from the app). **Prøv hele spillet** plays the whole game, or pick one game to play it from its introduction to the final scores. Both create six test players; **Se som** switches between their screens. Return to the host to advance the game. Demo data is local to the browser and is not network multiplayer.

## Connect Supabase

The local project is connected to `https://mavqjmobgreyoyuqvquv.supabase.co`. Both migrations are installed, anonymous sign-in is enabled, and Realtime and the expiry scheduler were verified on 2026-10-07. The public connection values are in the ignored local `.env` file. The setup instructions below apply to a fresh project.

1. Create a dedicated Supabase project.
2. Enable **Authentication → Sign In / Providers → Anonymous Sign-Ins**. Players never need to provide an email or password.
3. Run `supabase/migrations/001_game.sql` in the SQL Editor, then `002_cleanup.sql` and `003`–`013` in numeric order (every file in `supabase/migrations/`). Run each migration once, in order; do not rerun earlier ones on an existing database. An existing database only needs the migrations it does not have yet. The host menu requires `012_host_settings.sql`, and the fixed round plan requires `013_round_plan_and_pace.sql`; run them before deploying the updated client.
4. Copy `.env.example` to `.env`, and enter the project's URL and public publishable/anon key. Never put a `service_role` or secret key in a `VITE_` variable.
5. Restart the development server.
6. Verify that `public.session_updates` is enabled in the `supabase_realtime` publication. The first migration adds it when the publication exists.
7. In **Integrations / Cron**, verify that `do-or-drink-expiry` is active and that its latest run succeeded.

The cleanup runs every minute and removes sessions expiring in the following minute, including players, rounds, responses and allocations through cascading foreign keys. This targets deletion just before the 24-hour deadline. Expired sessions cannot be accessed even if cleanup is delayed. A paused or unavailable database cannot execute scheduled deletion; verify the scheduler after project setup. Supabase's separate anonymous Auth identities do not contain player names and are not deleted by the session cleanup.

Player recovery uses Supabase's persisted anonymous identity plus local membership data. Same device, browser and origin restores the same player ID and name after a reload or closed tab. Clearing browser storage or switching to another browser creates a new identity. New players can join only in the lobby; existing players can rejoin during the game. Hosting does not transfer when the host disconnects.

## Deploy to Netlify

Connect this folder's Git repository to a Netlify site, or import the repository through the Netlify dashboard.

- Build command: `npm run build`
- Publish directory: `dist`
- Environment variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- Node version: 22, configured in `netlify.toml`

Deploy after setting the environment variables; Vite embeds them during the build. `netlify.toml` includes the client-side routing fallback and security headers. HTTPS, the manifest, service worker and PNG icons support adding the app to an iPhone home screen. Open the deployed URL in Safari, use Share, then **Add to Home Screen**.

The service worker caches the app shell, not Supabase data. Online multiplayer requires a connection. A new app version activates as soon as it is downloaded and is used on the next page load; open pages are never force-reloaded, so a running round is not interrupted. Join links (`/join/<code>`) always load from the network, so a phone with an outdated cached app still opens the join form with the code filled in.

## Game rules

- Everyone starts as a player. Only the host sees the lobby's **Spectator** checkboxes and may mark any member, including themselves or a separate TV user. Spectators get no tasks, responses, points or sips and are excluded from rankings. The host keeps control even as a spectator. Roles are locked at start; at least two active players are required. Names can be identical; all decisions use player IDs.
- Two independent lobby switches control **Spillere kan dele ut slurker** (top-three allocations) and **Spillet deler ut slurker** (automatic loser sips). Disabled sip steps disappear from forward/back navigation and the stepper; scoring stays the same. With both off, reveal goes straight to the overall leaderboard. **Bånn i bøtta** remains a drinking challenge: deselect its two occurrences to remove drinking entirely.
- **Velg oppgaver** opens a keyboard-accessible dialog grouped by challenge/everyone, then by title. Every repeated occurrence has its own checkbox. At least one occurrence is required; selection is locked at start and is shuffled when saved. Each challenge still needs an eligible performer, so selected tasks can fall away after everyone has completed one challenge.
- The host can **Hopp over runden** at any step, with confirmation. This consumes the current task occurrence and opens the next eligible round. Unrevealed work awards no points or completion; previously revealed points and completion remain. A stale request cannot skip a newer round or step.
- The host's lobby shows a QR code for `/join/<code>`, which opens **Bli med** with the code filled in.
- Every game defaults to all tasks in a random order; the host may choose a subset. At start, the task pool is capped to at most one challenge slot per active player (or every available challenge slot for larger groups); every everyone-task is retained. The fixed plan is shared by the server and demo, so the displayed round total matches the rounds played. Each task is used once, except tasks with `repeat` (Bånn i bøtta, Mim det and Samme bølgelengde have two selectable occurrences; adjacent repeats are avoided when possible). Tasks are either a **challenge** (one player performs, the others guess) or **everyone** (all players take part).
- Successfully completing a challenge removes that player from the challenge pool. Declining keeps the player eligible for a later challenge, but prevents them from being redrawn within the same refusal chain. Once every player has completed a challenge, the remaining challenges are skipped while everyone-tasks still run.
- Completing an individual task awards 5 points; completing a transferred task awards 10. Host advancement without a result awards no completion bonus and does not consume that player's individual turn.
- The game ends when no task can run anymore, or when the host ends it. Everyone-tasks never mark players as having completed their challenge.
- **Stein, saks, papir**: random pairs; with an odd number one player meets the machine. A tie means both choose again. The winner gets 3 points; the loser, or a player who did not choose, drinks 3 sips automatically.
- **Ville du helst**: everyone picks one of two options. The majority gets 3 points; the minority and players who did not answer drink 3 sips automatically. An exact tie gives no points and spares everyone who answered.
- **Topp 5**: everyone has 60 seconds (server-timed) to write up to 3 single words for a theme. Words are compared without case, spaces or punctuation, and words of 7+ letters may be one typo apart; shorter words must match exactly (`same_word`, also used by Mim det). The five most written words with at least two writers are shown with who wrote them; each listed word gives 2 points. The top three hand out sips.
- **Mim det!** (challenge, no guessing step): the performer picks one word (three suggestions, one per difficulty, or their own) and starts a 120-second server countdown. The others guess as often as they like; guesses ignore case, spaces and punctuation, and words of 7+ letters allow one typo. The number of letters is revealed with 60 seconds left and the first letter with 30 left. The fastest correct guesses get position scoring, no correct guess gives 0, and the performer gets 5 (10 if passed on) once they have started.
- **Samme bølgelengde** (challenge, no guessing step): 5 questions with two options, never a question used earlier in the same game. The performer and everyone still in answer each question; the result is shown when they all have answered or when the host shows it. A different answer (or none) puts a guesser out; the round ends after question 5 or when nobody is left. Guessers get 1 point per matching answer; the performer gets 1 point per guesser who matched all 5 (0 if the round ended early) and no completion bonus.
- **Nest mest**: everyone picks 0–100. The highest number (all tied on it) drinks 5 sips automatically; the rest get position scoring from the top, so the second highest wins.
- In Stein, saks, papir, Ville du helst and Nest mest nobody hands out sips; losers get the red drink screen directly.
- Ranking uses absolute distance to the answer. Individual answers are clamped to the task's guessing bounds for scoring and reveal. The beer task displays 60 if the result exceeds 60.
- Position scores start at 1 at the bottom. The increase is 1 up to third place, 2 between third and second, and 3 between second and first. Nine guessers: `1,2,3,4,5,6,7,9,12`. Five guessers: `1,2,3,5,8`. The latter follows the written rule rather than the conflicting example ending in 7. With one guesser the award is 1; with two it is `1,4`.
- Ties use competition ranking: two first places both receive first-place points; the next player is third. Two last places receive the better occupied position's points. The score schedule is fixed by the round's participant count; missing responses get 0 rather than changing the available point scale.
- The highest **round point totals**, including a performer with completion points, may each give 3 sips to one person. The giver limit uses active players only: 2 players → 0 givers, 3–4 → 1, 5–6 → 2, 7+ → 3. Equal point totals at the giver cutoff are ordered by join time, then player ID. Only the selected givers are immune; fewer are selected if fewer people scored. Recipients are exclusive per round; the database serializes concurrent choices. With too few non-immune players, some givers cannot select a recipient; the host can advance.
- The host sees waiting players only after submitting their own guess, unless they are the performer and therefore do not guess. At most three waiting names are displayed.
- Rounds run assignment → guessing (where applicable) → performing → reveal → sips → next round. Total standings appear only at natural completion or when the host ends early. Only the host advances, goes back within the current round, or ends the game. Back navigation preserves results and awards points only once. Completed rounds cannot be edited. Skipping an unaccepted task consumes that task. Back does not reopen a previous round after a new one starts.
- Timers are measured on the participant's device. The server records start time, rejects future/impossible durations and applies a small network tolerance. This is a casual game, not a tamper-proof timing competition. Only the beer performer can see their own stopped result before reveal. Ten-second results disappear immediately on stop and stay hidden until reveal, including from their owner. At 20 seconds the timer stops with 0 points. Expired unfinished timers are also handled when the host reveals the round.

## Architecture

- `src/model.ts`: typed task definitions, response/round/session models and scoring utility.
- `src/api.ts`: anonymous authentication, RPC actions, membership recovery and Realtime invalidation signals. A four-second refresh and visibility/reconnect refresh recover missed signals.
- `src/demo.ts`: isolated local demonstration adapter. It does not pretend to provide remote multiplayer.
- `src/App.tsx`: routes only. Screens live in `src/pages/`, shared UI in `src/components/`.
- `src/game/`: the game screen. `useGame.ts` loads and syncs state and sends actions; `roundState.ts` derives readiness, winners and recipients; `phases/` has one component per round phase.
- `supabase/migrations/001_game.sql`: private game tables, server-side state machine, ranking, authorization and filtered snapshots.
- `supabase/migrations/002_cleanup.sql`: session expiry scheduler.
- `supabase/migrations/003_host_plays.sql`: optional non-playing host.
- `supabase/migrations/004_sips_before_leaderboard.sql`: round order reveal → sips → leaderboard.
- `supabase/migrations/005_more_tasks.sql`: random task order, challenge/everyone kinds, rock paper scissors, would you rather and the height challenge.
- `supabase/migrations/006_would_you_rather_points.sql`: 3 points for the would-you-rather majority.
- `supabase/migrations/007_more_challenges.sql`: Skritteller, Snap-streak and the cup-flip attempt counter (`answer.input: 'counter'`).
- `supabase/migrations/008_top_five_and_second_highest.sql`: Topp 5 (word matching with typo tolerance, server countdown) and Nest mest.
- `supabase/migrations/009_mime.sql`: Mim det (hidden word, server-timed hints) and task `repeat`.
- `supabase/migrations/010_wavelength.sql`: Samme bølgelengde (question pool, elimination per question).
- `supabase/migrations/011_stricter_typos.sql`: one shared typo rule for Topp 5 and Mim det.
- `supabase/migrations/012_round_plan_and_pace.sql`: fixed participant-sized challenge plan, sip giver limits and final-only standings. Apply this migration before deploying the corresponding frontend; it updates existing RPCs without deleting game data.

Private tables cannot be read or written by client roles. The exposed functions check `auth.uid()`, membership, phase and host/performer permissions. Hidden answers never enter a spectator's pre-reveal snapshot or Realtime event. Realtime sends only a session ID and version. The database session lock and allocation uniqueness constraint make simultaneous allocations safe. Host next/back requests include their expected phase to prevent duplicate requests skipping steps.

Tasks are data-driven in `game_private.tasks.definition`; the field reference is at the top of `005_more_tasks.sql`, with later fields described at the top of `008`–`010`. Methods: `stopwatch`, `manual` (entered by host or performer), `rps`, `choice` (two `options`), `words` (Topp 5), `highest` (Nest mest), `mime` (Mim det) and `wavelength` (Samme bølgelengde, with a `questions` pool). New games include every row in `game_private.tasks` (`repeat` times, default once), so a new would-you-rather question or manual challenge only needs an insert. Add the same definition to `tasks` in `src/model.ts` so the local demo includes it.

## Validation

The host lobby includes a duration indicator that reacts to player count, selected task occurrences and the two sip switches. `npm run simulate:duration` reproduces the 10/11-player comparison. The model runs 800 seeded Monte Carlo sessions per scenario, reporting p10/p50/p90 minutes. These are planning assumptions, not empirical measurements or confidence intervals. A half-game scenario samples 12 of the 23 occurrences each run. Spectators do not count; completed challenge performers leave the pool as in the actual game.

The per-task assumptions in `src/duration.ts` include reading/setup, simultaneous answers and performance: beer 55/90/155 seconds, choice 20/35/60, mime 65/110/165 (word selection plus up to 120 seconds miming), and Topp 5 70/80/100 (including 60 seconds writing). Wavelength adds 12/20/35 seconds per question, stopping when nobody remains, with an assumed 62% chance of matching each answer. Every round additionally includes time to read reveal and total scores (12/20/35 and 8/13/23 seconds plus a player-count allowance). Sip steps add 10/18/35 seconds for automatic sips or 18/30/55 for allocations. A shared group pace, 93% challenge completion assumption and occasional short interruptions broaden the range. Lobby joining and long breaks are excluded. Tune these assumptions after observing real sessions.

For 10 active players: all tasks with sips **59–78 min** (median 67), without sip steps **47–63 min** (median 54); a random half with sips **31–42 min** (median 35), without **25–35 min** (median 29). The same task pool, including beer, is used in both comparisons. For a fully non-drinking selection, deselect beer too. Do not interpret a faster task choice, such as only would-you-rather rounds, as equivalent to a random half.

```powershell
npm test
npm run build
```

Tests execute the real SQL state machine in embedded PostgreSQL (PGlite), with a stub for Supabase Auth. They cover roles, recovery, duplicate names, refusal, secrecy, clamping, ranking ties, completion bonuses, idempotent scoring, stale transitions, sip exclusivity, timeouts, manual measurement and cascading expiry. They do not validate a deployed Supabase Auth/Realtime/Cron installation. Verify with at least two independent browser profiles or phones after connecting and deploying.

## Deployment smoke test

1. Create a game on one device; join with its code on another. Confirm both screens update.
2. Close and reopen the second device. Confirm its player is restored without a duplicate entry.
3. Accept or transfer a task, submit guesses, then start and stop as the performer. Confirm the host cannot see the result before reveal.
4. Advance early with one missing answer; verify 0 points. Go back and forward; verify no duplicate score.
5. Have two winners try the same recipient. Only one allocation should succeed. Confirm the recipient gets a red screen until the host advances.
6. Complete the ten-second task on multiple devices and let one timer expire. Verify hidden results and 0 for timeout.
7. Check the Cron job execution history and expired session deletion.

Live Supabase validation passed with four independent anonymous clients, duplicate names, joining, host authorization, private results, scoring, exclusive sip recipients and collective timeout. The test received 19 Realtime update signals. The expiry Cron job completed successfully. Netlify deployment remains to be configured; the connected local app can already use network multiplayer.
