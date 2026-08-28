# AI credits: covering AI cost with a household credit balance

**Date:** 2026-08-11
**Status:** Approved design
**Depends on:** `2026-08-11-model-routing-design.md` (routing sets the unit cost this design prices from)

## 1. Why

The app is free and nearly every feature calls a model, so AI cost scales with usage and nothing
offsets it. `AI_DAILY_BUDGET_USD` defaults to **$2 per household per day** — roughly 300 pantry
scans or 8 monthly plans, daily, per household. It was written as a runaway guard, and it is the
only thing standing between the product and an unbounded bill. There is no payment code anywhere
in the repository.

The goal is **cost coverage, not margin**: AI should roughly pay for itself while growth stays the
priority. Most users should never pay.

### 1.1 What an operation actually costs

Estimated from the committed rate table (`MODEL_RATES_USD_PER_MTOK`) and real prompt and fixture
sizes, with vision on Gemini per the model-routing design:

| Operation                        | Est. cost | Relative |
| -------------------------------- | --------- | -------- |
| Pantry scan (`vision.recognize`) | $0.0045   | 1×       |
| Receipt scan (`receipt.extract`) | ~$0.008   | ~2×      |
| Daily plan (3 recipes)           | $0.018    | 4×       |
| Weekly plan (21 recipes)         | $0.085    | 19×      |
| Monthly plan (60 recipes)        | $0.231    | **51×**  |
| Live assistant session (2 min)   | $0.0996   | 22×      |

The **51× spread between the cheapest and most expensive action is the single fact that shapes this
design.** Any scheme that charges one unit per action is priced by its most expensive action or it
loses money, and the absolute values are estimates until the live cost gate in the model-routing
spec is run — but the _ratio_ is structural and does not depend on those estimates being right.

### 1.2 The live assistant is the one cost we cannot measure

Every row above except the last is a batch call through `AiGateway`, so its real cost lands in the
`ai_usage` ledger and the estimate can be checked against reality. The live assistant cannot be:
audio flows over a WebRTC connection between the browser and the provider, and the server's only
involvement is minting the ephemeral client secret. We are billed for conversation we never see.

So its price is **derived from a modelled session** rather than measured, and the model is committed
as arithmetic in `apps/api/src/ai/realtime-cost.ts` — not as a comment — so that a rate change fails
a named test instead of silently moving the margin.

The model's load-bearing asymmetry: output audio is tokenized at twice the rate of input (one token
per 50ms against one per 100ms) **and** priced at twice as much per token, so a minute of the
assistant talking costs almost exactly **4×** a minute of the user talking. A duration-only estimate
would be wrong by up to 2× in either direction depending on who did the talking. Replayed context
(instructions plus the pantry brief, re-read each turn) is charged at the cached rate and is under
5% of the total — modelled anyway, so that it is visibly negligible rather than quietly omitted.

| Quantity                              | Value        | Meaning                                           |
| ------------------------------------- | ------------ | ------------------------------------------------- |
| Modelled session (2 min, 50/50 split) | **$0.0996**  | What the priced-for conversation costs            |
| Derived price                         | 22.1 credits | At the $0.0045 basis; rounded up to the listed 25 |
| Covers its cost basis until           | **2.3 min**  | The duration 25 credits was priced for            |
| Loses money outright past             | **8.4 min**  | Where cost exceeds what those credits sold for    |
| Margin on the modelled session        | 76%          | Against pack revenue, before the store's cut      |

Session _duration_ is unbounded and cannot be bounded by us (see §5 of the kitchen companion design:
the client secret's TTL bounds how many connections one mint authorises, not how long one lives).
The honest statement of the exposure is therefore not "25 is correct" but **"25 is correct for 2.3
minutes and safe to 8.4"** — the gap between those two numbers is the entire tolerance for being
wrong about typical session length, and it is asserted in `realtime-cost.spec.ts` so it cannot
quietly shrink.

## 2. Decisions

| Decision          | Choice                               | Why                                                                                                |
| ----------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------- |
| Sale model        | One-off consumable packs             | Lowest friction for a free app pursuing growth; lightest App Review scrutiny; matches bursty usage |
| Denomination      | Weighted per user-facing action      | The 51× spread makes flat pricing insolvent                                                        |
| Ownership         | Household                            | Every other resource in the app is household-scoped                                                |
| Free grant        | 150 credits, monthly, resetting      | Meal planning is bursty; a daily drip punishes the Sunday planning session                         |
| Purchased balance | Never expires                        | Apple Guideline 3.1.1 requires it                                                                  |
| Debit point       | User-facing action                   | A plan is several AI calls and is discarded whole if one fails                                     |
| Failed work       | Refunded to the user, absorbed by us | The user received nothing                                                                          |
| Storefront        | Mobile IAP only, both stores         | ~15% under the small-business programmes; stores handle VAT and refunds                            |

### 2.1 Store rules that constrain the design

Verified against the live App Review Guidelines and Google Play policy pages on 2026-08-11.

- **IAP is mandatory** for credits sold in-app. Guideline 3.1.1 names "in-game currencies" and
  "unlocking … functionality" explicitly.
- **Purchased credits may not expire.** Guideline 3.1.1, verbatim: _"Any credits or in-game
  currencies purchased via in-app purchase may not expire."_ The free grant may reset because it is
  not a purchase.
- **Refunds and chargebacks are the developer's loss**, including credits already consumed. Both
  stores deduct from the next payout. "Buy → consume → refund" is a documented abuse pattern for AI
  credits specifically.
- **Commission is ~15%** on both stores below $1M annual revenue (Apple Small Business Program;
  Google's reduced tier).
- Showing a balance, an out-of-credits state, and an **IAP** purchase button is unrestricted in every
  storefront. Only _external_ purchase links are geographically restricted.

### 2.2 Rejected alternatives

- **Flat "1 action = 1 credit."** Simplest to explain, insolvent in practice: users rationally spend
  every credit on the 51× action, so realised cost per credit converges on the worst case. Pricing
  for that makes a pantry scan absurdly expensive and kills the onboarding hook.
- **Feature gating (scanning free forever, planning paid).** Clean mental model, but scanning stays
  structurally uncovered and a heavy scanner has no path to revenue.
- **Web/Stripe checkout.** 0% store commission, but a second payment integration with
  merchant-of-record and VAT duties. Out of scope; revisit if web traffic justifies it.
- **The US external-link route.** Currently 0% commission after the Epic contempt ruling, but the
  Supreme Court granted certiorari on 2026-06-30 and the rule may not survive. It covers one market
  and could vanish mid-build.
- **Subscriptions.** Better revenue predictability and cheaper on Google above $1M, but asks for
  commitment before the user trusts the app.

## 3. Credit prices

Exported from `@kitchen/contracts` so client and server cannot disagree. One credit ≈ $0.0045 of
raw model cost.

| Action                 | Credits |
| ---------------------- | ------- |
| `pantry.scan`          | 1       |
| `receipt.scan`         | 2       |
| `plan.daily`           | 4       |
| `plan.weekly`          | 20      |
| `plan.monthly`         | 50      |
| `plan.regenerateEntry` | 2       |

Internal operations (`name.resolve`, `recipe.translate`) are **never billed separately**; they are
absorbed by the action that triggered them. A user who scans a shelf is told it costs 1, not billed
three times for machinery they did not ask for.

**Pack:** $4.99 → **300 credits**. Net of the ~15% cut that is $4.24 against ~$1.35 of raw cost, so
about 3.1× headroom, which absorbs retries, mis-estimated tokens, refund abuse, and infrastructure.

**The free grant is deliberately 150** — three monthly plans, or 150 scans. Exhausting it lands the
user on a genuinely valuable action rather than on the scan that hooks them.

**Known exposure:** a household that spends its entire free grant every month costs about **$0.67**.
That is the worst case per free household and it is the number to watch as the user base grows;
realistically most households will not exhaust the grant. `plan.monthly` at 50 credits is about 2.5%
below its implied cost of 51.3 — deliberate, for a round number, and comfortably inside the pack's
3.1× headroom.

## 4. Data model

Credits are an **append-only ledger with a materialised balance**, the same shape as
`inventory_events` → `inventory_items.quantity`.

```
credit_ledger                  append-only; one row per movement
  id, household_id, delta, kind, bucket, action,
  ai_usage_id, purchase_id, created_at
  kind:   grant | purchase | spend | refund | reversal
  bucket: free | paid

household_credits              materialised state
  household_id PK, free_balance, paid_balance,
  grant_period, updated_at

credit_purchases               one row per store transaction
  id, household_id, user_id, store, product_id,
  store_transaction_id UNIQUE, credits, price_usd,
  status, created_at
  status: pending | active | refunded
```

Four elements earn their place:

**`grant_period` removes the need for a scheduled job.** It holds the month (`2026-08`) the current
free balance belongs to. Any balance read inside a transaction compares it to the current month and,
if stale, resets `free_balance` to the grant and restamps the period. A cron that must fire for
every household at midnight is a liability; a comparison is not. A newly created household has no
row, so its first balance read creates one at the full grant — new households need no special case.

**`store_transaction_id UNIQUE` is the idempotency key.** Both the client and the webhook report the
same purchase, and webhooks retry. Without the constraint a redelivery silently doubles a balance.

**`ai_usage_id` on spend rows** ties each debit to the vendor cost that caused it, so "are we
covering costs?" is a query rather than a guess. For a system whose entire purpose is cost coverage,
this is the most important column in the schema.

**`paid_balance` may go negative.** When a refund arrives for credits already consumed, the honest
record is a negative balance the user must buy out of. Clamping to zero silently writes off exactly
the abuse the stores warn about.

## 5. Spending

### 5.1 Two layers

- **Credits** are the _product_ currency: priced per user-facing action, user-visible, debited on
  success.
- **`AI_DAILY_BUDGET_USD`** remains the _engineering_ circuit breaker: per household per day, in
  USD, counting failed and retried calls.

They are not redundant. Failures do not consume credits, so without the USD breaker a household
could farm failures indefinitely at our expense.

### 5.2 Where the debit happens

At the **user-facing action**, not in `AiGateway`. A plan is generated in several sequential gateway
calls and the whole plan is discarded if any one throws (`planner.service.ts`), so charging per
gateway call would bill users for work that was thrown away.

The four sites are pantry recognition, receipt enqueue, plan creation, and entry regeneration.

### 5.3 Ordering and concurrency

**Free credits are spent first**, so light users never touch what they bought and the purchased
balance behaves like the permanent asset Apple requires.

The debit is a **single conditional UPDATE** — `… WHERE free_balance + paid_balance >= cost` — and
zero affected rows means insufficient. Never read-then-write: two household members tapping
"generate" simultaneously must not both pass a check against a balance that only covers one.

### 5.4 Synchronous versus job-backed

Pantry recognition and entry regeneration are **synchronous** and debit after success. Receipt
parsing and plan creation are **job-backed**: they debit **at enqueue** and refund on failure,
because between enqueue and execution another member could spend the balance out from under the job.

A refund writes a `reversal` row rather than deleting the spend, so the ledger stays append-only and
the event remains visible.

**The failed monthly plan is the honest case:** four groups succeed, the fifth throws, the plan is
discarded. The user is refunded all 50 credits and we absorb four groups of real spend, because they
received nothing. The USD breaker is what stops that being repeatable.

Job-creating routes already require an `idempotency-key` header; a retried request must resolve to
the same job **and must not debit twice**.

### 5.5 Errors

Insufficient balance throws
`AppError('INSUFFICIENT_CREDITS', 'errors.INSUFFICIENT_CREDITS', { required, balance })`. The server
sends a code and an i18n key, never prose, per the existing convention.

## 6. Buying

`react-native-purchases` (RevenueCat) on mobile. `expo-in-app-purchases` is deprecated and must not
be used.

Verification sits behind a **`PAYMENT_VERIFIER` DI token** with `MockPaymentVerifier` and
`RevenueCatVerifier` selected by env, mirroring `ai.module.ts`. The system continues to run offline
and free, exactly as `AI_MOCK=true` does today.

### 6.1 Flow

1. The client creates a **purchase intent** (household, user, product) and receives an `intentId`.
2. The client opens the native store sheet through RevenueCat, carrying the `intentId`.
3. **Fast path:** the client confirms to the API, which verifies and credits immediately.
4. **Backstop:** RevenueCat's webhook performs the same verification independently.

Both paths are idempotent on `store_transaction_id`; whichever arrives first wins and the other is a
no-op.

The fast path exists because a webhook can take seconds, and "I paid and nothing happened" is how
refund requests are generated. The webhook exists because clients crash and lose connectivity — and
because **refunds only ever arrive by webhook.**

### 6.2 Why the intent row exists

A webhook identifies a _user_; credits belong to a _household_; a user may belong to several.
Without an intent recorded before checkout, a webhook-first delivery cannot determine which
household to credit.

### 6.3 Refunds

A refund webhook marks the purchase `refunded` and debits the purchased credits, permitting a
negative balance. The webhook endpoint authenticates the caller; an unauthenticated caller must
never be able to move a balance.

## 7. Clients

Both apps show the balance and gate the same way; strings are added per the append-only i18n
namespace rules (`web.en.ts`/`web.ar.ts`, `mobile.en.ts`/`mobile.ar.ts`), with `errors.*` from the
backend.

- **Balance** is visible in settings and near AI actions.
- **Cost is shown before expensive actions.** A 50-credit monthly plan must never be a surprise.
- **Out of credits** is an explicit state naming what is needed and what is held, offering the IAP
  purchase on mobile. Web shows the balance and directs to the app; it never becomes a dead end.
- `GET /ai/usage` currently returns raw USD vendor cost to any household member. Clients move to the
  credits endpoint; USD is an operator concern, not a user-facing one.

## 8. Testing

Following how this repository already proves things:

- **Credit arithmetic and the price table** — pure unit tests, including that every billable action
  has a price.
- **Concurrency** — an integration test issuing parallel debits against real Postgres, asserting the
  balance never goes below zero from concurrent spends. This is the claim in §5.3 and it cannot be
  proven with mocks.
- **Idempotency** — the same `store_transaction_id` replayed through both the confirm path and the
  webhook credits exactly once.
- **Monthly reset** — an advanced clock crosses a month boundary; the free balance resets, the
  purchased balance does not.
- **Refund after consumption** — the balance legitimately goes negative.
- **Job refund** — a failed plan job restores the full debit and writes a `reversal` row.
- **Free-first ordering** — a spend covered by both buckets draws the free bucket down first.

## 9. Out of scope

Deliberately, not by omission:

- Web/Stripe purchase, the US external-link route, and subscriptions (§2.2).
- **Embedding spend reaching the ledger.** `OpenAiEmbeddings.embed` never calls
  `BudgetService.record`, so that spend is entirely off-ledger. It is a real gap and it undercounts
  cost, but it is a pre-existing bug and belongs in its own fix rather than riding along here.
- Promotional or granted credits beyond the monthly free grant.
- Per-member spending limits within a household.

## 10. Open items

- **Credit prices depend on estimated token counts.** The live cost gate in the model-routing spec
  must be run before launch; if measured cost diverges materially, the table in §3 is a single
  exported constant to adjust.
- **App Store Connect and Google Play Console setup** — the Paid Applications Agreement, banking and
  tax forms, and the product SKUs are real-world lead time independent of this code, and the app is
  still pre-submission.
