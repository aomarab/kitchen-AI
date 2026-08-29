# In-app purchases (credits) — setup guide

How to take the credit-purchase system from its offline mock to a live store.
The **code is already built** on both client and server; this guide is the
operator/account work plus the two integration points the code explicitly leaves
to "once the account exists". Grounded in `packages/contracts/src/credits.ts`,
`apps/api/src/credits/*`, and `apps/mobile/src/lib/purchase{,s}.ts`. Spec:
`docs/superpowers/specs/2026-08-11-ai-credits-design.md` (§6 purchases, §7
balance, §10 verification).

## What already works

- **Client** (`apps/mobile`): `BuyCreditsScreen` → `buyCredits()`
  (`src/lib/purchase.ts`) creates a purchase intent, opens the store sheet via
  the `react-native-purchases` adapter (`src/lib/purchases.ts`), then confirms.
  `react-native-purchases@^10.7.0` is already a dependency. A failed confirm
  returns `pending` (not an error) — the webhook is the backstop.
- **Server** (`apps/api`): `POST /credits/intents` → `POST /credits/purchases`
  (verify + credit) and `POST /webhooks/revenuecat` (backstop). Crediting is
  idempotent: a conditional `pending → active` claim plus a
  `store_transaction_id` UNIQUE backstop, so the confirm call and the webhook
  can both arrive without doubling the balance (`purchase.service.ts`).
- **Mock by default**: `PAYMENTS_MOCK=true` (server) and `EXPO_PUBLIC_USE_MOCKS`
  (client) keep the whole flow offline and free, so it runs in the Simulator and
  in node tests with no RevenueCat account.

## The product

One consumable pack, defined once in `packages/contracts/src/credits.ts` and
**shared by every store**:

| `productId`   | credits | price |
| ------------- | ------- | ----- |
| `credits_300` | 300     | $4.99 |

The string `credits_300` must be entered **identically** as the product
identifier in App Store Connect, Google Play, and RevenueCat. To add or reprice
a pack, edit `CREDIT_PACKS` (contract) — never hard-code an id in an app.

## Step 1 — Create the store products

**App Store Connect** (iOS)

- [ ] Create an **In-App Purchase → Consumable** with Product ID `credits_300`.
- [ ] Set the price to the tier nearest **$4.99**; add a display name and review
      screenshot. Submit it with the first app version (a consumable must be
      approved alongside a build).
- [ ] Fill the tax/banking (Paid Apps) agreement, or IAPs cannot be sold.

**Google Play Console** (Android)

- [ ] Monetize → Products → **In-app products** → create `credits_300` as a
      one-time (consumable) product priced at **$4.99**, and **activate** it.

## Step 2 — Configure RevenueCat

- [ ] Create a RevenueCat project; add the iOS and Android apps (bundle id /
      package name must match the store apps).
- [ ] Register the product `credits_300` for both stores and add it to an
      **Offering** (the app reads packages from `getOfferings()`,
      `src/lib/purchases.ts` → `loadPackage`).
- [ ] Copy two keys:
  - the **public SDK key** → mobile env `EXPO_PUBLIC_REVENUECAT_API_KEY`.
  - a **secret API key** → server env `REVENUECAT_API_KEY` (used by the REST
    verifier).
- [ ] Add a **webhook**: URL `https://<your-api-host>/webhooks/revenuecat`, and
      set the **Authorization header** to a random secret. Put the _same_ value
      in server env `REVENUECAT_WEBHOOK_SECRET`. The webhook does a constant-time
      compare and **fails closed** if the secret is empty or mismatched
      (`webhook.controller.ts`) — this is the only barrier between the public
      internet and free credits, so treat the secret like a password.

## Step 3 — Set environment

**Server** (`.env`, see `.env.example` and `config/env.ts`). In production the
API **refuses to boot** if `PAYMENTS_MOCK=false` and either key is missing:

```
PAYMENTS_MOCK=false
REVENUECAT_API_KEY=<revenuecat secret API key>
REVENUECAT_WEBHOOK_SECRET=<the Authorization value you set on the webhook>
```

**Mobile** (build-time `EXPO_PUBLIC_*`):

```
EXPO_PUBLIC_USE_MOCKS=false            # real API + OAuth
EXPO_PUBLIC_REVENUECAT_API_KEY=<revenuecat PUBLIC SDK key>
# Optional: EXPO_PUBLIC_USE_STORE_MOCKS=false
#   The storefront switches SEPARATELY from the API. If unset it follows
#   EXPO_PUBLIC_USE_MOCKS. Leave the store mocked (omit or =true) while you have a
#   real API but no approved IAP yet, so Buy taps don't hit an unconfigured SDK
#   (src/lib/purchases.ts).
```

**EAS builds are pre-wired.** `apps/mobile/eas.json` → `build.production.env`
already sets `EXPO_PUBLIC_USE_MOCKS=false` and `EXPO_PUBLIC_USE_STORE_MOCKS=false`
and carries a **placeholder** `EXPO_PUBLIC_REVENUECAT_API_KEY` of
`appl_REPLACE_WITH_REVENUECAT_PUBLIC_SDK_KEY`. Going live is a **single value**:
replace that placeholder with the RevenueCat **public SDK key** from Step 2.
Until you do, a production build's Buy taps configure the SDK with a bad key and
fail loudly (never a silent success), so do not `eas submit` a production build
before the real key is in and the IAP is approved. The `preview` and
`development` profiles keep the store mocked, so internal builds are unaffected.

The DI factory in `credits.module.ts` swaps the mock verifier for
`RevenueCatVerifier` purely on `PAYMENTS_MOCK`; no code change is needed to go
live.

## Step 4 — Two integration points to finalize (REQUIRED)

These are the parts the code intentionally leaves until a real account exists.
Both must be verified against RevenueCat's live payloads before shipping paid.

1. **Finalize the receipt lookup** in
   `apps/api/src/credits/revenuecat.verifier.ts`. Its `verify()` is a
   documented placeholder ("The precise RevenueCat lookup is finalized once the
   account exists (spec §10)") — it currently `GET`s
   `/subscribers/{storeTransactionId}`, but the lookup key and the
   `non_subscriptions` matching must be confirmed against real RevenueCat data
   (e.g. look the purchase up by the app user id / your intent, and assert the
   `product_id` and transaction match). **The security contract is fixed and
   must not weaken: never return `valid:true` on an unverified receipt** — a
   non-2xx already raises `EXTERNAL_SERVICE_ERROR` rather than parsing as
   success. Add a test with a real (sanitized) RevenueCat body.

2. **Carry the `intent_id` into the webhook.** The webhook schema requires
   `event.intent_id` (a UUID), `transaction_id`, `product_id`, `store`
   (`webhook.controller.ts`). RevenueCat's native event does **not** include your
   `intent_id`, so set it as a **subscriber attribute** on the customer right
   before `purchasePackage` (in `src/lib/purchases.ts`, using the value returned
   by `createPurchaseIntent`), and confirm the webhook body maps that attribute
   onto `intent_id`. If RevenueCat delivers it under a different field, adjust
   `revenueCatWebhookSchema` / `toWebhookEvent` to read it — this is a coordinated
   change (contract-adjacent), keep the confirm path and the webhook path reading
   the _same_ intent. Until this is wired, the confirm call still credits
   correctly; only the webhook backstop is inert.

## Step 5 — Verify end to end

- [ ] iOS: use a **Sandbox** Apple ID (App Store Connect → Users and Access →
      Sandbox). Android: add a **license tester** and use a closed-testing track.
- [ ] Buy `credits_300`: `getCredits` balance rises by **300** (purchased
      bucket; free is spent first — `credits.service.ts`, spec §7).
- [ ] Confirm **idempotency**: the RevenueCat webhook for the same purchase must
      **not** add a second 300 (the claim + UNIQUE backstop). Check the API logs
      show a clean no-op, not a 500.
- [ ] **Refund**: issue a sandbox refund; the `CANCELLATION`/`REFUND` webhook
      debits 300 (may go negative — that is the honest record, spec §6).
- [ ] Price display shows the **store's** localized price verbatim
      (`getPrice` → `priceString`); never reformatted.

## Guardrails already in code (do not "simplify" away)

- Webhook secret check is constant-time and fail-closed (`webhook.controller.ts`).
- Crediting is atomic and idempotent across the confirm + webhook double-delivery
  (`purchase.service.ts`).
- Free grant resets monthly, purchased never expires, free spent first
  (`credits.ts`, spec §7) — Apple Guideline 3.1.1 consumable model.
- A failed confirm is `pending`, never a customer-facing error
  (`src/lib/purchase.ts`).
