# DoOrDrink

A Norwegian multiplayer PWA built with React, Vite, TypeScript, React Router, Supabase and Netlify. The first release contains **Bånn i bøtta** and **Perfekte 10**.

## Run locally

Use Node.js 22 or newer.

```powershell
cd C:\Users\Erik Faane\DoOrDrink
npm install
npm run dev
```

Open http://localhost:5173. Without environment variables, use **Prøv et lokalt spill**. This creates six test players; **Se som** switches between their screens. Return to the host to advance the game. Demo data is local to the browser and is not network multiplayer.

## Connect Supabase

The local project is connected to `https://mavqjmobgreyoyuqvquv.supabase.co`. Both migrations are installed, anonymous sign-in is enabled, and Realtime and the expiry scheduler were verified on 2026-10-07. The public connection values are in the ignored local `.env` file. The setup instructions below apply to a fresh project.

1. Create a dedicated Supabase project.
2. Enable **Authentication → Sign In / Providers → Anonymous Sign-Ins**. Players never need to provide an email or password.
3. Run `supabase/migrations/001_game.sql` in the SQL Editor, then `002_cleanup.sql`, then `003_host_plays.sql`. Run each migration once, in order; do not rerun earlier ones on an existing database.
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

The service worker caches the app shell, not Supabase data. Online multiplayer requires a connection. A new app version activates after the old tabs are closed, avoiding a forced reload during a round.

## Game rules

- By default the host plays and participates in the random pool. In the lobby the host can turn off **Jeg spiller med** to only run the game, for example on a TV. A non-playing host gets no tasks, guesses, timers, points or sips, is left out of rankings, and sees answer status immediately. The setting is locked once the game starts, and at least two other players are then required. Names can be identical; all decisions use player IDs.
- The host's lobby shows a QR code for `/join/<code>`, which opens **Bli med** with the code filled in.
- Each task is used once per session. Successfully completing an individual task removes that player from the individual pool. Declining keeps the player eligible for a later task, but prevents them from being redrawn within the same refusal chain.
- Completing an individual task awards 5 points; completing a transferred task awards 10. Host advancement without a result awards no completion bonus and does not consume that player's individual turn.
- The game ends after the last task or when the individual pool is empty. Collective tasks do not mark every player as having completed an individual turn. This prevents the ten-second task from immediately using up everyone's turn.
- Ranking uses absolute distance to the answer. Individual answers are clamped to the task's guessing bounds for scoring and reveal. The beer task displays 60 if the result exceeds 60.
- Position scores start at 1 at the bottom. The increase is 1 up to third place, 2 between third and second, and 3 between second and first. Nine guessers: `1,2,3,4,5,6,7,9,12`. Five guessers: `1,2,3,5,8`. The latter follows the written rule rather than the conflicting example ending in 7. With one guesser the award is 1; with two it is `1,4`.
- Ties use competition ranking: two first places both receive first-place points; the next player is third. Two last places receive the better occupied position's points. The score schedule is fixed by the round's participant count; missing responses get 0 rather than changing the available point scale.
- The three highest **round point totals**, including a performer with completion points, may each give 3 sips to one person. Equal point totals at the three-person cutoff are ordered by join time, then player ID. Exactly three people are immune (or fewer if fewer people scored). Recipients are exclusive per round; the database serializes concurrent choices. With too few non-immune players, some givers cannot select a recipient; the host can advance.
- The host sees waiting players only after submitting their own guess, unless they are the performer and therefore do not guess. At most three waiting names are displayed.
- Only the host advances, goes back within the current round, or ends the game. Back navigation preserves results and awards points only once. Completed rounds cannot be edited. Skipping an unaccepted task consumes that task. Back does not reopen a previous round after a new one starts.
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

Private tables cannot be read or written by client roles. The exposed functions check `auth.uid()`, membership, phase and host/performer permissions. Hidden answers never enter a spectator's pre-reveal snapshot or Realtime event. Realtime sends only a session ID and version. The database session lock and allocation uniqueness constraint make simultaneous allocations safe. Host next/back requests include their expected phase to prevent duplicate requests skipping steps.

Tasks are data-driven in `game_private.tasks.definition`. Definitions declare `kind`, `answer.method`, `answer.enteredBy`, units, bounds and optional target/timeout. The engine supports individual stopwatches and manually entered individual results, including results entered by the host. Add a task definition and include its ID in future sessions' `task_order` to add a task without rewriting scoring. Only the two requested tasks are included in the initial order. Add corresponding entries in `src/model.ts` if the local demo should support them too.

## Validation

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
