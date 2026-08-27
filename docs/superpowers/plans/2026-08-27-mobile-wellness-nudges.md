# Mobile wellness nudges

**Date:** 2026-08-27 · **Branch:** `feat/screen-live-data` · **Stacked on:** `feat/mobile-timers`

## Scope

The wellness firing engine writes `reminder_occurrences`, and the web kiosk reads them. The phone had
nothing: it could edit reminder *settings* but could not see a single nudge the engine had fired, nor
answer one. This slice gives mobile that surface.

- A `/wellness` screen listing today's nudges — outstanding first, answered below — with an
  acknowledge action and a hydration progress card.
- An entry row on **More**.
- `listReminderOccurrences` / `acknowledgeReminder` reach mobile for the first time: hooks, MSW
  resolvers, and a seeded ledger so the screen works offline.

Nothing here invents data. Every row comes from an occurrence the engine wrote, and hydration counts
cups the household **acknowledged**, never nudges that were merely sent.

## Design decisions

**The pending-nudge rule moved into the contract.** `activeNudge` lived in `apps/web/src/lib/screen.ts`.
Mobile needed the same rule, and a second copy would have let the kiosk and the phone disagree about
which occurrence is outstanding — which matters, because acknowledging on one surface must clear the
same row on the other. `pendingNudge` / `pendingNudges` now live in `packages/contracts/src/reminders.ts`
next to `hydrationCupsDrunk`, and web's `activeNudge` delegates to it. One edit to the contract
reddens both suites; that is the point.

**Answered nudges stay on screen.** Showing only outstanding ones means a day where everything was
answered renders identically to a day the engine never fired. Those are different facts and the
screen must not conflate them.

**Hydration progress is clamped.** A household can acknowledge more cups than its goal — the engine
stops *nudging* at the goal but never refuses an acknowledgement — and a bar wider than its track is
a rendering bug, not a reward.

**"Minutes ago" is floored at zero.** Clock skew between phone and server can put `firedAt` slightly
in the future, and "fired -1 minutes ago" is worse than "just now".

**Mock seeds are anchored to the waking window, not to fixed offsets.** The ledger is read from
`wakingStart`, so a fixture placed "four hours ago" is *before* waking whenever the app is opened in
the morning — the seeded history would vanish exactly when someone first looks at the screen. The
seeds are placed at fractions of the elapsed waking window instead. This was not foreseen; the mock
integration test below caught it.

## Verification

Full gate: `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm test`.

New tests:

| Where | What |
| --- | --- |
| `packages/contracts/src/reminders.spec.ts` | `pendingNudge` / `pendingNudges` — ordering, acknowledged skipping, null when idle, no mutation |
| `apps/mobile/src/lib/wellness.spec.ts` | row ordering, outstanding count, hydration fraction incl. clamp and zero goal, floored elapsed minutes |
| `apps/mobile/src/mocks/reminders.spec.ts` | the mock handlers run for real through MSW and every response is parsed with the contract schema |

That last file exists because the api-client validates responses against the contract. A fixture that
merely looks right — a readable id like `occ-hydration` where the schema demands a uuid — passes
every unit test and fails at runtime in the app. It caught two real bugs in this slice: the non-uuid
ids, and the waking-window seed problem above.

### Fault injections

Each proven red, then restored and confirmed with `shasum -a 256`.

| Broken | Check that went red |
| --- | --- |
| `pendingNudge` stops skipping acknowledged occurrences | contracts *skips acknowledged nudges…* **and** web *activeNudge picks the most recent unacknowledged nudge* — one edit, two suites, proving the kiosk really delegates to the contract |
| `hydrationFraction` loses its `Math.min(1, …)` | mobile *clamps above the goal — a bar wider than its track is a bug, not a reward* |
| `listReminderOccurrences` resolver deleted from the mobile mocks | *mock coverage > implements every route the app calls* |
| Mock seeds placed at fixed offsets instead of waking-window fractions | *keeps the whole seeded ledger visible when opened just after waking* |

## Not verified

Not run on the iOS simulator. The macOS Simulator on this machine has lost its device window
(`System Events` reports zero windows while the device stays booted), so synthetic taps — the only
way this workflow drives the app — are impossible; the same blocker recorded in
`2026-08-27-mobile-timers.md`. RTL is covered by mechanism (the `styleKeys` lint rule rejects
physical-direction style keys, and `mobile.ar.ts` is typed against `mobile.en.ts` so a missing
Arabic string is a build error), but that is coverage of the mechanism, not of the rendered result.

## Follow-ups

- The screen polls every 60 s. A nudge that fires while the app is foregrounded appears up to a
  minute late; a push channel is Feature 4 and deliberately absent from `reminderChannelSchema`.
- Acknowledging is not queued offline. The offline event queue is inventory-shaped
  (`inventory_events`); routing an acknowledgement through it needs its own design.
