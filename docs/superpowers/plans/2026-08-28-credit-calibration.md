# Plan — a staff surface that reads credit prices against measured cost

**Date:** 2026-08-28 · **Spec:** `2026-08-11-ai-credits-design.md` §3 (credit pricing), §4 (data model)

## The problem

`ActionCostQuery` (shipped in the action-cost-attribution slice) can now answer "what did one credit
action actually cost us?" by joining `credit_ledger` to `ai_usage` on `spend_group_id`. But nothing
_reads_ it. The answer to "are we covering costs?" lives in a query object with no caller outside its
own tests, so a rate that drifts past the price it was set from fails nowhere — exactly the silent
staleness the attribution slice existed to make visible.

`CREDIT_COSTS` was built from one-off cost estimates. Five of its seven prices are supposed to be
_measurable_. This slice puts the measurement in front of a human: a staff-only report that lays the
listed price of every action next to the vendor cost measured from the ledgers.

## The shape

A read-only reporting surface, no new state:

1. **Contract** (`packages/contracts/src/credits.ts`) — `creditCalibrationSchema` (per-action rows +
   the two USD bases the table is priced from) and `creditCalibrationQuerySchema` (`days` window).
   Route `adminCreditsCalibration` = `GET /admin/credits/calibration`, `staff: true`.
2. **API** — `CreditCalibrationService.deriveCalibration` is a **pure** function over
   `ActionCostQuery` rows: it classifies each action `covered` / `underpriced` / `unmeasured` /
   `unused`, converts measured USD back into credits at the cost basis, and sorts worst-margin
   first. `AdminCreditsController` (`admin/credits`, behind `AuthGuard, StaffGuard`) exposes it.
   Both live in the AI module because the query and the cost-basis helpers (`realtime-cost.ts`) do —
   the credits module can't import the AI module without a cycle.
3. **Web** — `/admin/credits` page + `CreditCalibrationView`, a third admin-console tab. Bilingual,
   RTL-safe, tokens only.

## The judgements worth naming (and testing)

- **`assistant.session` is never `covered`.** It is billed by the provider over a connection the
  server never sees, so it measures zero calls forever. Dividing its charge by its (zero) measured
  cost would read as infinite margin; the surface flags it `unmeasured` and marks the row
  `measurable: false` instead of folding it into the covered/underpriced verdict.
- **`unmeasured ≠ unused`.** A charged action with no recorded cost (every call failed before the
  vendor billed, or it is unmeasurable) is different information from an action nobody ran. Collapsing
  them would hide a real anomaly.
- **The status boundary is decided before display rounding.** `measuredCreditsPerCharge` is compared
  to the listed price unrounded, then rounded only for the wire, so a value at the boundary cannot be
  nudged across it by presentation.
- **The window read is global, so the integration test asserts lower bounds.** The report aggregates
  every household; a test seeding one charge can only assert the row grew by _at least_ what it
  seeded, never an exact total.

## Checks

- `calibration.service.spec.ts` — the pure classification/sort/basis logic, no DB.
- `admin-credits.controller.spec.ts` — live Postgres: staff guard (403 for non-staff), schema-valid
  report over every action, and a seeded charge read end-to-end through query → derive → controller.
- `CreditCalibrationView.test.tsx` — MSW: every action rendered, unmeasurable flagged not free,
  default window + re-query, Arabic.
- `scripts/fault-inject-assistant.mjs` — ten new cases, each proving the named check above reddens
  when its rule is broken.
