---
name: ui-ux-guidelines
description: Project-wide UI/UX and responsive design guidelines for DoOrDrink. Use whenever creating, modifying, or refactoring UI components, pages, layouts, or styling (src/App.tsx, src/styles.css, src/mobile.css, index.html), or when auditing the app for responsiveness and visual consistency.
---

# Project-Wide UI/UX & Responsive Design Guidelines

You are responsible for maintaining a consistent, modern, responsive, and scalable user interface throughout this project.

These instructions apply only to the current project and must be followed whenever you create, modify, or refactor UI components, pages, layouts, or styling.

## Project context (DoOrDrink)

- React 19 + Vite PWA, plain CSS. No UI framework — do not add one.
- Styling lives in `src/styles.css` (base + desktop-first breakpoints at 950px and 700px) and `src/mobile.css` (mobile game layout, ≤700px, plus short-height tweaks ≤720px).
- Design tokens are CSS custom properties on `:root` in `src/styles.css` (`--bg`, `--panel`, `--panel-raised`, `--line`, `--text`, `--muted`, `--lime`, `--on-lime`, `--red`, `--radius`, …). Use them instead of hardcoded colors.
- Shared patterns: `.button` + `.primary` / `.secondary` / `.wide`, `.pill`, `.eyebrow`, `.muted`, `.side-card` / `.players-card` / `.round-card` / `.entry-card` panels, `.waiting`, `.error`, `.offline`, `.avatar`, `.modal`.
- Icons come from `lucide-react`.
- The UI language is Norwegian (bokmål). Keep new copy in Norwegian.
- The hidden test page (`/test`, not linked from the app) runs the full game flow locally without Supabase, either the whole game or one task at a time — use it for visual verification.

## 1. Responsive Design — Mobile, Tablet & Desktop

The entire application must work seamlessly across different screen sizes.

- Follow a mobile-first design approach.
- Support mobile phones, tablets, laptops, and desktop monitors.
- Use responsive layouts that adapt naturally to the available screen space.
- Prefer flexible sizing (`rem`, `%`, `clamp()`, `minmax()`, Flexbox, CSS Grid) over fixed pixel dimensions where appropriate.
- Use breakpoints based on actual layout requirements rather than device-specific assumptions.
- Avoid unnecessary fixed widths, heights, and absolute positioning.
- Prevent unintended horizontal scrolling, clipped content, and overlapping elements.
- Ensure tables, forms, navigation, dialogs, and other complex components remain usable on smaller screens.
- Adapt layouts intelligently. For example, multi-column desktop layouts should stack or reorganize on mobile when necessary.
- Use responsive typography, spacing, and component sizing while maintaining readability.

Important: Responsive design does not mean simply shrinking the desktop interface. Each screen size must provide a practical and intuitive user experience.

## 2. Consistent Design System

The application must maintain a unified visual identity across all pages.

Before implementing new UI elements:

1. Inspect existing components, layouts, and styles.
2. Identify the project's established design patterns.
3. Reuse existing components and styling conventions whenever possible.
4. Ensure new elements look and behave as if they belong to the same application.

Maintain consistency in:

- Colors and semantic color usage
- Typography and font hierarchy
- Spacing and padding
- Buttons and interactive controls
- Input fields and forms
- Cards, panels, and containers
- Borders, border radii, and shadows
- Icons and icon sizing
- Navigation and page structure
- Loading, empty, success, and error states
- Hover, focus, active, and disabled states

Avoid introducing new visual patterns when an existing pattern already serves the same purpose.

## 3. Reusable Components & Centralized Styling

Prioritize maintainability and consistency.

- Reuse shared UI components instead of duplicating styling.
- Prefer existing design tokens, CSS variables, themes, and shared style definitions.
- If the project lacks centralized styling conventions, establish them incrementally when appropriate.
- Avoid hardcoded colors, spacing, or font sizes when reusable design tokens are available.
- Keep styling organized according to the project's existing architecture.
- Avoid unnecessary CSS overrides, duplicated rules, and excessive specificity.
- Do not introduce a new UI framework or styling library unless explicitly requested.

Changes to shared components must be evaluated for their impact across the entire application.

## 4. Visual Hierarchy & User Experience

Every screen should feel polished, intentional, and easy to navigate.

- Maintain clear visual hierarchy.
- Use consistent alignment and spacing.
- Group related information logically.
- Keep interfaces clean without unnecessary visual clutter.
- Make primary actions visually distinguishable from secondary actions.
- Ensure interactive elements are easy to identify.
- Maintain sufficient contrast and readable font sizes.
- Provide comfortable touch targets for mobile interaction (at least 44×44px).
- Support keyboard navigation and visible focus indicators.
- Avoid sacrificing functionality for visual appearance.

The application should feel like one cohesive product, not a collection of independently styled pages.

## 5. Preserve Existing Design & Functionality

Do not redesign the application unnecessarily.

- Respect the existing visual identity.
- Improve inconsistencies rather than replacing working design patterns.
- Preserve existing functionality, business logic, navigation, and user interactions.
- Avoid unrelated changes when implementing a specific feature.
- Prefer minimal, maintainable improvements over large styling rewrites.

If an existing design pattern is problematic, improve it consistently rather than introducing a different solution on individual pages.

## 6. Continuous Design Validation

Whenever you create or modify UI:

1. Verify that the layout works on narrow mobile screens (approximately 320–390px).
2. Verify that it adapts correctly to tablets (approximately 768px).
3. Verify that it works on desktop screens (approximately 1280px and above).
4. Check for overflow, clipped text, broken alignment, and awkward spacing.
5. Compare the result with existing pages and components.
6. Ensure the result follows the project's established visual identity.
7. Check that responsive behavior does not break existing functionality.

If browser-based testing is available, visually inspect the application at multiple viewport sizes (`npm run dev`, then open `/test` to reach the game screens). Otherwise, inspect the CSS and component structure and clearly state what has not been visually verified.

## 7. Apply These Rules to All Future UI Work

These guidelines are not limited to a single task.

Whenever implementing a new feature or changing an existing page, automatically consider:

- How will this look and behave on mobile?
- How will it scale to larger screens?
- Does it match the rest of the application?
- Can existing components or styles be reused?
- Will this change introduce visual inconsistencies elsewhere?

Treat responsive behavior and visual consistency as default acceptance criteria for all UI-related work.

## 8. Project Scope

These rules apply exclusively to the current project. Do not modify global Claude settings or other projects.

The goal is a responsive, scalable, visually consistent, and maintainable application across every screen size.
