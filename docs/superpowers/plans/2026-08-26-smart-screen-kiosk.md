# Plan — Smart-screen kitchen kiosk (Phase 1a)

Derived from `docs/superpowers/specs/2026-08-26-kitchen-companion-design.md` **Feature 1**
(smart-screen kitchen view) and the approved prototypes `01-smart-screen.html` /
`02-orientation.html`. This is the first slice of the Kitchen Companion phasing.

## Scope (this slice only)

A read-only **kiosk** route in the web app at `/screen` that renders the companion at-a-glance
view and **auto-switches between landscape and portrait** when the device rotates — the behaviour
the user asked for ("horizontal, and it switches automatically when I rotate the phone").

- **Landscape (primary):** two columns — a wellness hero (left/inline-start) beside the
  timer + hydration mini-cards (right/inline-end).
- **Portrait:** the same content stacked.
- Status bar: clock (locale-formatted, Latin digits per spec §7 `formatDate`), household name,
  a companion wordmark. Bottom nav: timers / recipes / notes / alerts.

## Honesty constraints (what this slice does NOT fabricate)

The timers engine (Feature 3) and the reminder **firing / occurrences** engine (Feature 2 engine)
are not built. This slice therefore composes **only over data that already exists** and shows
truthful placeholders for the rest:

- **Hydration mini-card** shows the real **daily goal** from `reminder_settings.hydrationGoalCups`
  — not a fabricated "5 of 8 consumed" count (there are no occurrences to count).
- **Timer mini-card** shows an honest "no active timer" empty state (`web.states.comingSoon`)
  until the timers engine ships.
- **Wellness hero** shows a truthful summary of the user's **enabled** nudges (from real settings)
  labelled as the day's plan — not a fake live "speaking now" alert.
- No new contract surface, no new DB tables, no edits to `packages/contracts`.

## Build steps

1. **i18n** — append a `web.screen` namespace to `web.en.ts` + `web.ar.ts` (Arabic authored
   natively). Reuse `web.states.comingSoon`, `web.reminders.*`, `web.nav.recipes`.
2. **`lib/useOrientation.ts`** — a `matchMedia('(orientation: landscape)')` + `resize`/
   `orientationchange` hook returning `'landscape' | 'portrait'`. SSR/first-paint default is
   `landscape` (primary), corrected on mount, so there is no hydration mismatch. This JS signal
   drives the layout so the auto-rotate is **unit-testable**.
3. **`lib/screen.ts`** — pure `hasAnyNudge(settings)` + `wellnessPlanLines(settings, t, locale)`
   deriving the hero summary and hydration goal string from settings only.
4. **`components/screen/SmartScreenView.tsx`** — the kiosk, using `useHousehold`,
   `useReminderSettings`, the clock, and `useOrientation`. Tokens only (no hex, no `text-primary`
   on text, no opacity tints) so the token-usage / palette guards stay green.
5. **Route** — `app/(screen)/layout.tsx` (`AuthGate` only, full-bleed, no `AppShell` sidebar) +
   `app/(screen)/screen/page.tsx`.
6. **Entry** — a "Kitchen screen" card/link on the Settings view → `/screen`.

## Verification (every check falsifiable, proven by fault injection)

- `lib/useOrientation.test.tsx` — mock `matchMedia`; assert the hook reports `portrait`, then flips
  to `landscape` on a `change` event. Fault-inject by dropping the listener → assertion reddens.
- `lib/screen.test.ts` — assert enabled-nudge lines + goal string; empty when all off.
- `components/screen/SmartScreenView.test.tsx` — renders household name + goal + plan lines;
  empty-state when nudges off; Arabic renders without throwing.
- `lib/token-usage.test.ts` + `app/palette.test.ts` — must stay green unchanged.
- `pnpm --filter @kitchen/web lint` + `typecheck`.
- Playwright MCP at `localhost:3100`: landscape viewport → two columns side-by-side; portrait
  viewport → stacked; Arabic → `dir=rtl`, mirrored, native headings, 0 console errors.

## Follow-ons (explicitly out of scope here)

Reminder firing engine + `reminder_occurrences`, cooking timers (Feature 3), voice/personalization
(Feature 4), and the live camera + voice assistant (Feature 5). Each is its own specced slice; the
hydration "consumed" count and the live hero come alive once the firing engine lands.
