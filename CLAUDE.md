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
- Use demo mode ("Prøv et lokalt spill") to visually verify game screens.
