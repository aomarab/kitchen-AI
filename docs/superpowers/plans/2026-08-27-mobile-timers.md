# Plan — Mobile cooking timers

Derived from the approved prototype `04-cooking-timers.html` and the timer engine shipped in the
web slice. The API and the web surface already had timers; the phone — the device most likely to be
in your hand while the pot is on — had none.

## Scope (this slice only)

- Contract: lift the timer **state machine** out of the API into `packages/contracts/src/timers.ts`
  as `applyTimerAction(timer, body, now)`, so one implementation serves the server, the web mocks
  and the mobile mocks.
- API: `TimersService.transition` deleted; the service now calls `applyTimerAction` and maps each
  refusal to its `AppError`.
- Web: the MSW timer `PATCH` handler calls `applyTimerAction` instead of its own copy.
- Mobile: `timers` in the mock db plus four resolvers, `src/hooks/timers.ts`, `src/lib/timers.ts`
  (tick, ordering, dial), the `/timers` screen, and a row on the **More** tab.
- i18n: a `mobile.timers` namespace in `mobile.en.ts` / `mobile.ar.ts`.

## Honesty constraints (what this slice does NOT fabricate)

- **No third copy of the state machine.** The rules already existed twice — in
  `TimersService.transition` and in the web MSW handler. Writing a third for mobile would have let
  the phone and the server disagree about what "extend a finished timer" means, and nothing would
  have caught it. The lift is the point of the slice; the mobile screen is what made it necessary.
- **No local notification when a timer ends.** The phone shows the finished state while the screen
  is open and nothing more. Firing a real notification needs a permission prompt, a scheduling
  strategy and a story for timers changed on another device — none of which this slice has. The
  screen therefore never implies it will alert you in the background; the copy says the timer keeps
  running, which is true, not that you will be told.
- **No background execution claim.** iOS suspends the app; the timer lives on the server and is
  re-derived from `endsAt` on every read, so it is correct after a suspend — but nothing in the app
  claims the phone is counting while it is closed.
- **The dial is decoration.** The remaining time is real text inside the ring, and `Ring` is hidden
  from assistive tech. A colour-only countdown would be the only reading for nobody.

## Design decisions

- **Refusals travel in the contract's own vocabulary.** `applyTimerAction` returns
  `{ ok: false, reason: 'not_running' | 'not_paused' | 'too_long' }` rather than throwing. The API
  is the only caller that owes an error envelope, so it owns the `reason → AppError` map; the mock
  layers answer 409 and nothing has to import Nest's error types into a shared package.
- **The tick stops when nothing is counting down.** `useTimerTick(active)` only runs an interval
  while at least one timer is projected `running`. A phone left open on the counter would otherwise
  re-render every second for the whole bake.
- **Ordering is by who needs a hand.** `sortTimers` puts finished first, then running by how soon
  they finish, then paused by age. It sorts the *projected* timers, so a row the server still calls
  `running` but whose deadline has passed is ranked — and rendered — as finished.
- **The ring rounds up.** `ringTicks` uses `Math.ceil`, so a timer with any time left keeps at least
  one lit segment. Rounding to nearest empties the ring in the final seconds, which reads as
  "finished" while the food is still cooking.
- **Extending a paused timer stays paused.** That rule already existed in the API; the mobile
  screen inherits it for free from the lift, and a contract test now pins it.

## Verification

| Claim                                                          | Check                                                                                        |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| The API really runs the shared machine                          | `packages/contracts` `refuses an extension past the maximum duration` **and** API `refuses to extend past the maximum supported duration` both go red when the shared guard is removed |
| The ring never reads "finished" while time remains              | mobile `keeps one tick lit while any time remains…`                                          |
| Every route the mobile app calls has a mock                     | `apps/mobile/src/mocks/coverage.spec.ts` — red when `listTimers` is dropped                   |
| Ordering uses the projected status                              | mobile `ranks by the projected status, not the one the server last wrote`                     |
| The whole lifecycle works on a device                           | iOS simulator: create → 0:57 counting down → **Pause** → **+1 min** → 1:40 and still paused    |

### Fault injections (each restored byte-for-byte, `shasum -a 256` verified)

| Broken                                                   | Check that went red                                        |
| -------------------------------------------------------- | ---------------------------------------------------------- |
| `durationSec > MAX_TIMER_DURATION_SEC` → `false`          | contracts + API max-duration tests (one edit, two suites)   |
| `ringTicks` `Math.ceil` → `Math.round`                    | mobile `keeps one tick lit while any time remains…`         |
| `listTimers` resolver deleted from the mobile mocks       | `mock coverage > implements every route the app calls`      |

## Not verified

The timers screen was **not** photographed in Arabic on the simulator. Two separate environment
faults blocked it, both diagnosed rather than assumed:

1. A second project's Metro (`/Users/aomr/projects/skin`) was listening on port 8081, so the Kitchen
   dev build fetched the wrong bundle and that project's app kept taking the foreground. Fixed by
   killing that packager and rebuilding.
2. The build itself was corrupt — an interrupted `expo run:ios` had left `ios/Pods` half-installed,
   so the app bundle shipped 14 frameworks and no `ExpoSecureStore.framework` (verified with
   `ls MamasKitchen.app/Frameworks`). Fixed with `pod install` plus a clean rebuild; the app then
   launched correctly and rendered the English home screen.
3. After the rebuild the macOS Simulator lost its device window (`System Events` reports
   `count windows of process "Simulator"` = 0 while the device stays booted). `simctl` can still
   screenshot, but every tap in this workflow is a synthetic click into that window, so navigation
   became impossible. Restarting the Simulator app and re-opening the device from
   *File ▸ Open Simulator* did not restore the window.

The **English** run of this screen was captured on device earlier: create "Rice" 1 min → 0:57
counting down → Pause (label "Paused") → +1 min → 1:40 still paused. The Arabic **More** list was
also captured, showing مؤقّتات الطبخ with a mirrored chevron. Only the Arabic timers screen itself is
missing. What *is* checked: the RTL lint rule
(`baseConfig({ styleKeys: true })`) rejects every physical-direction style key in the app and passes
on this screen, `Ring` positions its ticks with `start`/`end`, and `mobile.ar.ts` is typed against
`mobile.en.ts` so a missing Arabic string is a build error. That is coverage of the mechanism, not
of the rendered result — treat the Arabic screenshot as outstanding.

## Follow-ups

- A local notification when a timer finishes (needs permissions + a cross-device story).
- The kiosk/phone pair currently poll every 30 s; a push or SSE channel would make a timer paused on
  one surface visible on the other immediately.
