# Plan — attribute vendor cost to the credit action that caused it

**Date:** 2026-08-28 · **Spec:** `2026-08-11-ai-credits-design.md` §3 (credit pricing)

## The problem

`credit_ledger.ai_usage_id` carries this comment in `apps/api/src/db/schema.ts`:

> `aiUsageId` ties a spend to the vendor cost it caused, which is what lets
> "are we covering costs?" be a query rather than a guess.

**Nothing ever sets it.** `CreditsService.spend` accepts `opts.aiUsageId`, and no caller in the
repository passes one, so the column is null on every row that exists. The query the comment
promises cannot be written, and the claim has been false since the column was added.

That is also what blocks re-deriving the rest of `CREDIT_COSTS` the way `assistant.session` was
derived in #25. Five of the seven prices are supposed to be _measurable_ rather than modelled — but
only if a row in `ai_usage` can be traced to the action that paid for it. Today it cannot: a usage
row knows its household, its model and its operation, and nothing about why it happened.

## Why a single FK was always the wrong shape

One credit action is **several** gateway calls. A receipt scan is `receipt.extract` then
`receipt.map`; a plan is `plan.generate` plus the `recipe.translate` calls the plan triggers. The
credits contract says so out loud — `name.resolve` and `recipe.translate` "are internal steps
absorbed by the action that triggered them".

So the relationship is one spend to _many_ usage rows, and a single `ai_usage_id` on the spend can
never express it. The correlation has to live on the many side.

## The change

1. `ai_usage` gains a nullable `spend_group_id`. `CreditsService.spend` already mints a spend-group
   id and already writes it on the 1–2 ledger rows of a spend, so the join key exists — it is only
   missing from the usage side.
2. The id reaches `BudgetService.record` through an `AsyncLocalStorage` billing context rather than
   a parameter threaded down every signature. This is deliberate: the absorbed internal steps
   (`recipe.translate`, `name.resolve`) are called from services several layers below the one that
   spends, and an explicit parameter would reach the top-level call and silently miss exactly the
   nested calls whose cost we are trying to attribute. The context is entered at the four places
   that own an action end to end.
3. `credit_ledger.ai_usage_id` and `spend(…, { aiUsageId })` are **removed**, not left in place. A
   column nothing writes is not a spare capability; it is a claim in the schema that does not hold.

### The four action boundaries

| Boundary                       | Action                      | Where the id comes from |
| ------------------------------ | --------------------------- | ----------------------- |
| `RecognitionService.recognize` | `pantry.scan`               | minted, then spent with |
| `PlanService.regenerateEntry`  | `plan.regenerateEntry`      | minted, then spent with |
| `PlanProcessor.process`        | `plan.daily/weekly/monthly` | job payload             |
| `ReceiptProcessor.process`     | `receipt.scan`              | job payload             |

`AssistantService` spends but makes no gateway call — realtime audio never reaches `ai_usage` at
all (#25). It is left alone; the calibration surface must report it as unmeasurable rather than as
zero.

## Verification

- The context module's own tests: nesting, isolation between concurrent actions, and that leaving
  the context restores the previous one.
- An integration test that runs a real gateway call inside a context and reads the `spend_group_id`
  back off the `ai_usage` row.
- The join proven end to end: after a recognition, the household's measured USD for that
  spend group is > 0 and reachable _from the credit action_.
- Fault injection: dropping the context at each boundary must redden the check that names it.

## Not in this slice

The staff-facing calibration surface (measured cost per action vs listed price) is the next slice.
It is worthless until the attribution below it exists, and this slice is what makes the query
possible.
