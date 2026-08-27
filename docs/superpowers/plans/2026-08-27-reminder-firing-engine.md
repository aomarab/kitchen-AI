# Plan — Wellness reminder firing engine

Derived from `docs/superpowers/specs/2026-08-26-kitchen-companion-design.md` **Feature 2** and the
approved prototype `03-wellness-settings.html`. The settings screen already existed; nothing ever
fired. This slice is the engine behind it.

## Scope (this slice only)

- Contract: `reminder_occurrences` schemas, `listReminderOccurrences`, `acknowledgeReminder`, and
  the **pure scheduling core** (`localMinuteOfDay`, `isQuietHour`, `wakingWindowMinutes`,
  `minutesSinceWaking`, `wakingStart`, `hydrationIntervalMinutes`, `dueReminderTypes`,
  `hydrationCupsDrunk`), which server, web client and MSW mocks all share.
- DB: migration `0014` — `reminder_occurrences` plus `reminder_settings.time_zone`.
- API: `RemindersFiringService` (`sweep` / `sweepHousehold` / `list` / `acknowledge`), the
  occurrences controller, and a BullMQ repeatable sweep every 60 s.
- Web: kiosk hero shows the live nudge with an acknowledge affordance; the water card counts real
  cups; the settings screen now sends the browser time zone on every save.

## Honesty constraints (what this slice does NOT fabricate)

- **No TTS, no push.** Feature 4 owns spoken delivery. `reminder_channel` therefore contains
  exactly one value, `screen`, and the ledger row **is** the delivery: clients poll. Nothing in the
  product claims a nudge was spoken.
- **`stretch` is never fired — on purpose.** Nothing in the spec or the prototype states its
  cadence, and inventing one would be fabrication. Two tests assert it never fires (one sweeps all
  24 hours). **This is an open product question**: the settings screen still shows a stretch toggle
  the engine ignores, and that gap is deliberate and visible rather than papered over.
- **A defaulted read is not consent.** `getReminderSettings` returns defaults for a household with
  no saved row so the settings screen has something to render, but `sweep()` only visits households
  with a **saved** row — the only opt-in signal that actually exists in the data.
- **Cups drunk are cups acknowledged.** `hydrationCupsDrunk` counts occurrences with a non-null
  `acknowledgedAt`; a nudge nobody acted on is not a drink, so the kiosk never inflates the count
  by how many nudges were sent.
- **No mobile UI** in this slice.

## Design decisions

- **`timeZone` was a discovery, not a feature.** Quiet hours are wall-clock hours and nothing in
  the schema had a zone, so the engine could only count in UTC and would wake an Amman household at
  01:00. Added as an IANA string defaulting to `'UTC'` — recorded as _not told yet_, not guessed.
  The web sends `Intl.DateTimeFormat().resolvedOptions().timeZone` on every settings save.
- **No local→UTC arithmetic anywhere.** `minutesSinceWaking` uses only the current local
  minute-of-day (`Intl`, `hourCycle: 'h23'`), so `wakingStart = now − minutesSinceWaking`. DST
  transitions are knowingly ignored.
- **`isQuietHour(h, start, end)` treats `start === end` as an empty window**, not an all-day quiet
  period: a user who never set quiet hours should still be nudged.
- **Hydration divides the waking window by `goal + 1`, not `goal`.** Dividing by the goal places
  the last cup exactly at the start of quiet hours, where it is suppressed — making the goal
  unreachable by construction. Caught by a failing integration test, not by inspection.
- **`sweepHousehold` holds the settings row `FOR UPDATE`** inside a transaction, mirroring
  `CreditsService.spend`. Required for correctness: two overlapping sweeps would both read "nothing
  fired yet".
- **`messageKey`, never prose** — the server stores `reminders.break.body` and the client
  translates, consistent with the `AppError` / `AppExceptionFilter` rule. Arabic copy is the
  prototype's Levantine dialect (the persona speaks that way), not the MSA used elsewhere.
- **The sweep scheduler does not register under `NODE_ENV=test`**: several suites boot the whole
  `AppModule`, and a live worker would insert nudges into other tests' households.

## Verification

Workspace gate green: `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm test` — **1,630 tests**
(baseline 1,581). API specs hit the live Postgres.

Every claim below was proven by deliberate fault injection, then restored byte-for-byte
(`shasum -a 256` unchanged):

| Broken on purpose                                            | Check that went red                                                                                           |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| deleted `.for('update')` in `sweepHousehold`                 | `waits for a lock another transaction holds on the settings row`                                              |
| `isQuietHour` guard forced to `false`                        | `dueReminderTypes > fires nothing during quiet hours`                                                         |
| divisor changed from `goal + 1` to `goal`                    | contracts `spreads the goal evenly…` **and** API `stops nudging hydration once the day's goal has been fired` |
| `hydrationCupsDrunk` stopped filtering `acknowledgedAt`      | `counts acknowledged cups only…` and the kiosk's `counts only acknowledged hydration nudges as cups drunk`    |
| `ALTER TABLE … DROP CONSTRAINT reminder_ack_not_before_fire` | `rejects an acknowledgement stored before the nudge was fired` ("promise resolved `[]` instead of rejecting") |

The lock proof is worth calling out. The obvious test — two `sweepHousehold` calls in a
`Promise.all`, expecting one nudge — **still passed with the lock deleted**: two sweeps issued in
the same tick rarely interleave their read and their insert. It was a check that could not fail. It
was replaced by a direct one that holds the settings row in a second transaction and asserts the
sweep _waits_; that one goes red the moment the lock is removed.

## Follow-ups

- Decide the **stretch cadence** (product), then wire it — the toggle is currently inert.
- The 60 s sweep interval and 60 s client poll are judgement calls, not spec'd.
- Mobile reminders UI; Feature 4 (voice) to make nudges spoken rather than merely shown.
