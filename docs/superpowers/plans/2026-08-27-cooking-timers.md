# Plan — Cooking timers (Phase A)

Derived from `docs/superpowers/specs/2026-08-26-kitchen-companion-design.md` **Feature 3** (cooking
timers) and the approved prototype `04-cooking-timers.html`. It is the slice that turns the kiosk's
"no active timer" placeholder from Feature 1 into real data.

## Scope (this slice only)

Multiple concurrent, household-scoped cooking timers that survive a page close, plus the web UI
for them and the kiosk wiring.

- Contract: `listTimers` / `createTimer` / `updateTimer` / `deleteTimer` (all `auth` + `household`).
- DB: a `cooking_timers` table with the status enum and the invariants as check constraints.
- API: `TimersModule` — a state machine over the _projected_ timer.
- Web: `/timers` page (dial card grid, `+1 min` / pause / resume / stop, new-timer form with
  minute presets), a sidebar nav entry, and the kiosk timer card bound to the featured timer.

## Honesty constraints (what this slice does NOT fabricate)

- **No voice alert.** The spec's spoken "your timer is done" needs `TTS_PORT`, which is Feature 4
  and does not exist. A finished timer therefore gets a **visual** alerting state only. No
  "speaking now" banner over an engine that isn't there.
- **No server-side push when a timer ends.** There is no scheduler in this phase, so expiry is a
  **projection**, not a sweep: `projectTimer(timer, now)` reports a lapsed running timer as `done`
  on read, and `TimersService.update` computes every transition from the projected timer, which is
  how a stale `running` row materialises to `done`. Clients poll (30 s) and tick locally.
- **No per-household timer cap** was invented; the spec does not state one.
- No mobile UI in this slice (mobile's MSW coverage spec only requires resolvers for routes the
  app calls, so mobile stays untouched and green).

## Design decisions

- `endsAt` is authoritative while `running`; `remainingSec` is authoritative when `paused`/`done`
  and only a snapshot while running. The invariant `running ⇔ endsAt !== null` is enforced three
  times: a zod `superRefine` in the contract, the Postgres check constraint
  `cooking_timer_running_has_deadline`, and tests.
- `PATCH` takes a **discriminated union on `action`** (`pause` / `resume` / `stop` / `extend`), not
  a field patch, so a client cannot write an unreachable state.
- `stop` is idempotent (a no-op on an already-done timer, deliberately not a conflict); `pause` on
  a non-running timer and `resume` on a non-paused timer are `409` with `errors.timerNotRunning` /
  `errors.timerNotPaused`. `extend` **revives** a done timer to running — "+1 min" on a ringing
  card means give it another minute — and rejects `durationSec > MAX_TIMER_DURATION_SEC` (12 h)
  with `errors.timerTooLong`.
- `remainingSecAt` / `projectTimer` / `formatRemaining` live in `packages/contracts/src/timers.ts`
  so the server, the web client, and the MSW mocks share one derivation instead of three.

## Verification (every check falsifiable, proven by fault injection)

- `packages/contracts/src/timers.spec.ts` (19) — schema invariants + the pure derivations.
- `apps/api/src/timers/timers.service.spec.ts` (15) — live-Postgres integration; every transition
  and every refusal, with an injected clock.
- `apps/api/src/timers/timers.http.spec.ts` (8) — 401 without auth, 428 without household, 400 on
  a bad body, 404 on an unknown id, and the 409 conflict envelope shape.
- `apps/web/src/lib/timers.test.ts` (11) — tick gating and `featuredTimer` priority
  (done > soonest running > paused).
- `apps/web/src/components/timers/TimersView.test.tsx` (9) and the two added
  `SmartScreenView.test.tsx` cases.
- `lib/token-usage.test.ts` — the dial uses `stroke-primary` / `stroke-danger` / `stroke-muted`,
  never `text-primary`; the guard was **not** relaxed to make the dial pass.
- Whole workspace: `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm test` (1,581 tests).

Fault injection performed, each restored byte-for-byte (`shasum -a 256` match):

| Broken on purpose                           | Check that went red                                               |
| ------------------------------------------- | ----------------------------------------------------------------- |
| `projectTimer` expiry branch disabled       | "reports a lapsed timer as done", "refuses to pause a lapsed one" |
| `featuredTimer` done-filter removed         | "prefers a finished timer"                                        |
| Raw `INSERT status='running', ends_at=null` | rejected by `cooking_timer_running_has_deadline`                  |

Playwright MCP at `localhost:3100` (mock mode): created a timer, `+1 min` moved 4:44 → 5:44, pause
froze the countdown across 1.5 s, resume continued, stop rendered "Time is up" + Remove; the kiosk
card showed the live timer ("Ouzi in the oven 4:58"); Arabic gave `dir=rtl` with the sidebar
mirrored to the inline-end edge and native copy from the prototype (`مؤقّت جديد`, `+دقيقة`,
`إيقاف`); 0 application console errors.

## Follow-ons (explicitly out of scope here)

Mobile timers screen; the Feature 2 reminder **firing** engine (`reminder_occurrences` + a BullMQ
repeatable job), which would also turn the kiosk hydration placeholder into live data; and
Feature 4 voice/TTS, which is what unblocks the spec's spoken timer alerts.
