# Cook-mode step timers

**Branch:** `feat/cook-mode-timers` (based on `feat/stretch-toggle-honesty`, PR #14)

## The problem

`apps/mobile/src/app/recipe/[id]/cook.tsx` already existed: full-screen cook mode, one step at
a time, holding a wake lock via `useKeepAwake()` so the display never sleeps mid-recipe
(spec §6.3). A step with a `durationMinutes` rendered that duration as a static `Badge`.

Static is the whole problem. "Simmer for 20 minutes" told the cook how long to wait and gave
them no way to be told when the wait was over. To set a timer they had to leave cook mode —
losing the wake lock, losing their place in the recipe, and navigating a phone with wet hands.

## What shipped

A pure core plus one control.

- **`apps/mobile/src/lib/cook-timers.ts`** (new). `stepTimerLabel`, `stepTimerPlan`,
  `existingStepTimer`. No React, no hooks, no I/O — the whole decision of *whether* a step can
  have a timer and *what request would create it* lives here and is directly testable.
- **`cook.tsx`** gains `useTimers()` / `useCreateTimer()` and a `StepTimerControl` that shows
  either a "Start N min timer" button or the live remaining time for the timer already running
  for this step.
- **i18n** — `stepWord`, `startStepTimer`, `stepTimerRunning`, `stepTimerDone` in en and ar.

### Three decisions worth recording

**The label is truncated before the step marker is appended, never after.** A naive
`slice(0, MAX_TIMER_LABEL_LENGTH)` on `"<long recipe title> · Step 4"` cuts the marker off the
end, so every step of a long recipe produces a byte-identical label — and `existingStepTimer`
then reports step 2's timer as already covering step 7. The title is trimmed to fit *around*
the marker instead.

**A step longer than `MAX_TIMER_DURATION_SEC` renders no button at all.** `stepTimerPlan`
returns `{ ok: false, reason: 'too_long' }` and the control returns `null`. A button that the
contract would refuse is worse than no button. This is deliberately silent: nobody stands in
front of a phone waiting out a twelve-hour prove, so there is no user to explain it to.

**Remaining time comes from `projectTimer(existing, now)`, never from the stored status.** Cook
mode stays open for the length of a recipe. A timer that ran out five minutes ago is finished
whatever the last-written row says.

## Verified

Full workspace gate green: `pnpm build && pnpm typecheck && pnpm lint && pnpm test` —
**1,727 tests** (1,702 before, +25).

Five fault injections, each reddening its *named* check, each restored and confirmed
byte-for-byte with `shasum -a 256 -c`:

| # | Break | Check that went red |
| - | ----- | ------------------- |
| 1 | `stepTimerLabel` truncates naively | `keeps the step marker when the recipe name is too long` **and** `never exceeds the contract limit, for any step of any name` |
| 2 | Remove the `MAX_TIMER_DURATION_SEC` guard | `refuses a step longer than the contract allows` |
| 3 | `existingStepTimer` stops ignoring `done` | `ignores a finished timer, so a second batch can be started` |
| 4 | Screen hand-rolls the create request | `builds the timer request through the contract-checked planner` |
| 5 | Screen reads the stored status | `reads remaining time from the projection, not the stored status` |

Injections 4 and 5 are source sweeps (`src/lib/cook-screen.spec.ts`), because mobile has no
render harness — the same idiom as `reminder-surfaces.spec.ts`. Both carry an anti-vacuity test
so an empty or moved file reddens rather than silently passing.

**An existing guard caught a real bug in this work.** The sweep was first written as
`src/app/recipe/[id]/cook-screen.spec.ts`, and the repo's own check failed it: Expo Router
bundles everything under `src/app` into the app, so that file would have shipped inside the
binary and crashed it at launch by importing `vitest` at runtime. Moved to `src/lib`.

## A defect this found, that only the device could find

The button first shipped as a flat i18n string, `ابدأ مؤقتًا {minutes} دقيقة`. On the simulator it
rendered **`ابدأ مؤقتًا 5 دقيقة`** directly beneath a badge reading **`الطهي 5 دقائق`** — two controls,
same number, same screen, disagreeing about the word for "minutes". Arabic takes the plural for
3–10 and the singular accusative for 11–99, and `recipe.cookTime` already used the repo's CLDR
`plural()` helper while my new key did not.

Fixed by making `startStepTimer` a `plural()` message with `one`/`two`/`few`/`many`/`other`. Two
checks now pin it in `packages/i18n/src/plural.spec.ts`; reverting the key to a flat string reddens
both, verified and restored byte-for-byte.

The cross-check compares the grammatical **number** the two controls chose, not the surface form —
`الطهي دقيقتان` (nominative) and `ابدأ مؤقتًا دقيقتين` (accusative) are both correct, and an earlier
draft of the test wrongly demanded they match exactly. The rule was fixed, not the strings.

## Verified on device

iPhone 17 simulator, locale Arabic, driven with `idb`:

1. Cook mode opens with `الخطوة 1 من 4`; previous/next are mirrored (`السابق` right, `التالي` left).
2. Steps 1 and 2 have no duration and show **no** timer button — the refusal is real, not styling.
3. Step 3 shows `ابدأ مؤقتًا 30 دقيقةً`, step 4 `ابدأ مؤقتًا 5 دقائق`; both agree with their badge.
4. Tapping the step-4 button replaced it with `المؤقت يعمل · 4:54`, and eight seconds later it read
   `4:45` — the tick and `projectTimer` are live, not a static render.

## Not verified

- **The #13 timer notification has still never been observed firing**, so the end of this loop —
  the step timer that tells you it is done while you are elsewhere — remains unproven.
- Only the mock data set was exercised; no step in the fixtures exceeds `MAX_TIMER_DURATION_SEC`,
  so the `too_long` refusal is proven by test only, never seen on a screen.
- English cook mode was not re-checked on device after the plural change (the Arabic path was).
