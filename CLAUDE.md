# DoOrDrink

## UI/UX & responsive design

All UI work in this project (components, pages, layouts, styling) must follow the project skill
[`.claude/skills/ui-ux-guidelines/SKILL.md`](.claude/skills/ui-ux-guidelines/SKILL.md). Load it before
creating or changing UI.

Short version:

- Mobile-first and responsive: verify at ~320–390px, ~768px and ≥1280px. No horizontal scrolling, clipping or overlap.
- Reuse the existing design system: tokens on `:root` in `src/styles.css`, shared classes (`.button`, `.primary`, `.secondary`, `.pill`, `.eyebrow`, cards, `.waiting`, `.error`). No hardcoded colors when a token exists.
- Touch targets ≥44px, visible focus indicators, consistent hover/active/disabled states.
- Preserve existing design and functionality; prefer small consistent improvements over rewrites. No new UI frameworks.
- Use the hidden test page (`/test`) to visually verify game screens: play the whole game or one task at a time.

## Scoring rules for tasks

Every new or changed task must follow one of these two scoring systems:

- **Win/lose tasks** (a clear winner, e.g. Stein, saks, papir and Ville du helst): every winner gets **3 points**.
- **Closest-wins tasks** (guess or hit a value, e.g. Bånn i bøtta, Kjenn kompisen, Perfekte 10, Mim det!): use the
  same capped position scoring: 1st gets 10, 2nd 9, ... 9th 2, and everyone further down who made it gets 1. Ties
  share the best position, no answer gives 0 (`rankingPoints` in `src/model.ts`, `game_private.position_points` in
  the SQL). A challenge performer who completes gets 5 points,
  or 10 if the task was passed on to them. Nest mest uses this too, ranking from the top after the highest number
  is removed.
- **Deliberate exceptions** (decided by the owner):
  - Topp 5 gives **2 points per word** a player has on the top-five list.
  - Samme bølgelengde gives a guesser **1 point per answer** like the performer's (at most 5, out at the first
    different answer). The performer gets **1 point per guesser who matched all 5**, 0 if everyone was out
    earlier, and no 5/10 completion bonus.

Implement scoring on the server (a new `supabase/migrations/` file) and mirror it in `src/demo.ts`, with tests in
`tests/game.test.ts`.
