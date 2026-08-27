# The stretch toggle that promised a nudge nobody would send

## What was wrong

`reminder_settings.stretch_enabled` ships **on by default**. It is offered as a switch on the web
reminder settings page and on the mobile one, and the kitchen kiosk listed "Stretch reminders" in
its "Today's wellness plan" hero.

The firing engine never fires a stretch nudge. `dueReminderTypes` in `packages/contracts` has said
so in a comment since it was written:

> `stretch` is deliberately never returned: no setting in the spec or the prototype determines its
> cadence, and inventing one would be fabrication.

That refusal is correct — `docs/superpowers/specs/2026-08-26-kitchen-companion-design.md` mentions
stretching twice and specifies no interval, and prototype `03-wellness-settings.html` shows a toggle
with no cadence control beside it. Nothing was invented, and nothing should be.

But the refusal lived **only in the engine**, so every client was free to disagree with it, and the
clients did. The result was a household seeing a wellness plan on the kitchen screen, with stretch
in it, waiting all day for something the system is documented never to produce. A household with
*only* stretch enabled saw a plan that could not produce a single nudge at all.

This is the failure mode the project's own discipline names: a UI over an engine that does not
exist. It was shipped.

## What changed

**The refusal was lifted into the contract**, next to the engine that makes it:

- `SCHEDULED_REMINDER_TYPES` — the types the engine can actually schedule.
- `isScheduledReminderType(type)`
- `scheduledReminderTypes(settings)` — enabled **and** schedulable, which is what a UI should
  describe as the plan.

**The kiosk** (`apps/web/src/lib/screen.ts`) now derives both `hasAnyNudge` and `wellnessPlanLines`
from `scheduledReminderTypes` instead of reading the toggles itself. Plan order follows the
contract's firing order, morning → break → hydration, rather than the previous
break → stretch → morning → hydration.

**Both settings screens** drop the stretch toggle. The contract field and the database column stay,
so the stored preference survives untouched for whenever a cadence is decided; only the control that
did nothing is gone.

A disabled toggle with a "coming soon" hint was considered and rejected: it is the same promise in
quieter type, and it carries a date nobody can commit to.

## The check that makes the lift real

A second hard-coded list would drift from the engine within one change. So
`packages/contracts/src/reminders.spec.ts` **discovers** what the engine can produce — sweeping
every cadence in `breakCadenceMinutesSchema.options`, four hydration goals, all 24 hours, with both
an empty and a partly-fired state — and asserts the discovered set equals `SCHEDULED_REMINDER_TYPES`
exactly.

That test fails in both directions: adding stretch to the list without implementing a cadence, and
implementing a cadence without adding it to the list.

## Fault injections

| Fault injected                                                | Check that went red                                                     |
| ------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `stretch` added to `SCHEDULED_REMINDER_TYPES`                  | `names exactly the types the firing engine can produce` (+4)             |
| Engine's `break` branch disabled                               | `names exactly the types the firing engine can produce` (+2 break tests) |
| `scheduledReminderTypes` returns all enabled types             | **web** `keeps the plan in firing order`, `shows no plan at all for a household that has only stretch on` |
| Stretch toggle restored in the web settings view               | `offers no stretch toggle, because no stretch nudge is ever fired`       |
| Stretch toggle restored on the mobile settings screen          | `offers no toggle for a reminder type the engine never fires`            |
| Mobile guard's source read replaced with `''`                  | `still offers the types the engine does fire`                            |

The third is the one that matters most: a change made **only in `packages/contracts`** reddened the
**web** suite. That is the proof the kiosk genuinely delegates rather than keeping its own opinion.

All restored byte-for-byte, verified with `shasum -a 256`.

Mobile has no render harness, so `apps/mobile/src/lib/reminder-surfaces.spec.ts` sweeps the screen's
source instead — the approach `apps/web/src/lib/token-usage.test.ts` already uses for design tokens.
It derives the unscheduled types from the contract rather than naming `stretch`, so it will police
whatever the next unscheduled type turns out to be, and it carries two guards against being vacuous:
one asserting there is something to police, one asserting the scheduled toggles are still present.

Full gate: build, typecheck, lint, **1,702 tests**.

## Still open — a product question, not an engineering one

**What cadence should stretch reminders have?** It cannot be derived. Three options, none of which
is mine to choose:

1. Its own interval setting, like `breakCadenceMinutes`.
2. Ride the break cadence — but the prototype shows break and stretch as two rows with distinct
   copy, so treating them as one nudge is a product decision.
3. Drop stretch from the product and remove the column.

Until one is chosen, the toggle stays out of the UI and `SCHEDULED_REMINDER_TYPES` stays as it is.
Adding a cadence is a three-line change plus a list entry — and the cross-check will insist on both.
