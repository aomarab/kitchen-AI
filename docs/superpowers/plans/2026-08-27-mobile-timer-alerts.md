# Mobile timer alerts

A cooking timer you cannot hear is not a timer. The mobile timers screen (PR #11) counts down
correctly, but the countdown only exists while that screen is open — the moment the cook navigates
away, or locks the phone and puts it on the counter, nothing tells them the rice is done. This slice
makes a running timer fire a local notification at the instant it ends.

## Why it joins the existing plan rather than scheduling itself

`applyNotificationPlan` in `apps/mobile/src/lib/notification-scheduler.ts` cancels **every** pending
notification and re-schedules from scratch. That is deliberate — a diffed schedule that gets it
slightly wrong leaves reminders about food eaten last week — but it means a timer alert scheduled
independently would be wiped by the next inventory refetch, silently and non-deterministically.

So `timer` becomes a `NotificationKind` and `planTimerNotifications` becomes another contributor to
`planNotifications`. There is exactly one plan.

## What is deliberately not scheduled

- **Paused timers.** A paused timer carries a remaining duration and `endsAt: null`; there is no
  instant to schedule until it resumes.
- **Finished timers** (`status: 'done'`).
- **Running timers whose end has already passed.** Neither iOS nor Android delivers a trigger dated
  in the past. It would not ring — it would only consume one of the 64 slots iOS is willing to hold.

## The signature is the whole feature

`schedulerSignature` decides whether the scheduling effect re-runs. Starting a timer moves nothing
else it watches — not the inventory, not the meal plan, not the shopping list — so omitting timers
from the signature does not degrade this feature, it removes it entirely: the effect never re-runs
and the alert is never armed.

`status` is in the signature alongside `endsAt` because pausing a timer does not move its end
instant. Without it, the alert survives the pause and rings over a pot nobody is cooking.

## Sound

Everything else in this plan is ambient — food expiring in two days does not warrant interrupting a
room — and the foreground handler shipped `shouldPlaySound: false` for all of it. A timer is the one
alert the user is actively waiting for, so it is the one that makes a noise, both in the scheduled
content (`sound: 'default'`) and in the foreground handler, which now reads `data.kind`.

## The toggle

`notifyTimers` ships **on**, unlike the shopping and planning nudges. Those are the app volunteering
an opinion about a state that can sit unchanged for weeks. A timer alert is the answer to something
the user explicitly started seconds earlier; shipping it off would make the feature look broken.

It is deliberately **not** counted in the settings screen's `anyEnabled`, which gates the daily
reminder-hour picker. A timer fires when the timer ends, so offering an hour picker to someone who
has only timers switched on would be a control that does nothing.

## A rule that was removed for being untestable

An earlier draft reserved slots for timers ahead of the `MAX_SCHEDULED` cut, on the theory that a
long braise could end after tomorrow's expiry nudges and be dropped by a purely chronological slice.

The test written for it passed with the rule removed. The reason is a proof, not an accident:
`MAX_TIMER_DURATION_SEC` caps a timer at twelve hours, and every other notification in the plan is
anchored to a daily evening slot with expiry bucketed per date — so crowding a timer out would take
forty-eight reminders inside those twelve hours, which cannot happen. The reservation was complexity
that no input could distinguish from its absence, so it was deleted rather than kept with a check
that cannot fail.

## Checks

All in `apps/mobile/src/lib/notifications.spec.ts` and `apps/mobile/src/stores/settings.spec.ts`.

| Fault injected                                       | Check that went red                                            |
| ---------------------------------------------------- | -------------------------------------------------------------- |
| `schedulerSignature` drops the timers line            | `changes when a timer is started` (+2)                          |
| Signature keeps `endsAt` but drops `status`           | `changes when a timer is paused, even though its end instant does not move` |
| Timer status filter removed                           | `ignores a paused timer even if it is still carrying an end instant`, `ignores a finished timer` |
| Past/NaN instant filter removed                       | `skips a running timer whose end has already passed` (+1)       |
| `hydrate` reads `notifyTimers` as `=== true`          | `keeps timer alerts on when reading a file written before they existed` |

Each was restored byte-for-byte afterwards and verified with `shasum -a 256`.

`the crowded fixture really does overflow the cap on its own` exists solely to stop
`keeps a timer in a plan that is already at the platform cap` passing because nothing was ever
dropped — the first version of that fixture used ninety items across twenty-eight dates, which
bucket to twenty-eight rows and never reached the cap.

Full gate: build, typecheck, lint, 1,691 tests.

## Not verified

The alert has **not** been observed firing on a device. The iOS simulator in this environment has
lost its device window (`System Events` reports zero windows while the device stays booted), so the
app cannot be driven far enough to start a timer and wait. `expo-notifications` is also absent from
the current dev binary's frameworks unless rebuilt, and `notification-scheduler.ts` degrades to a
no-op in that case by design.

What is proven is the plan the scheduler is handed, and the conditions under which it is rebuilt.
What is not proven is the OS delivering it.
