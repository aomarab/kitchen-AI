# Model routing and vision cost control

Date: 2026-08-11
Status: approved

## Problem

Kitchen AI is free and almost every feature depends on a model call. We intend to sell AI
credits, so the cost of a call stops being an infrastructure detail and becomes the cost of
goods sold. Two things block that.

First, we do not know what a call actually costs. `estimateCostUsd` prices a call from its
**tier**, not from the model that served it. Today that is harmless because one vendor serves
every tier. The moment a second vendor appears it silently misprices, and the `ai_usage` ledger
is exactly what credit pricing would be derived from.

Second, we are paying for pixels nobody uses. `PhotoCapture.tsx` captures at `quality: 0.6`
and never resizes. Quality is JPEG compression; **vision billing is driven by dimensions**. We
upload full camera frames — commonly 4032x3024 — and pay to have them tiled and read.

## Goals

- Cut the cost of the vision tier, which is the app's dominant model cost.
- Make `ai_usage` reflect what was actually spent, per model, including failed attempts.
- Introduce a second vendor without touching any service that consumes AI.

## Non-goals

- **Credits and monetization.** A separate project. This spec only makes its inputs trustworthy.
- **Moving embeddings to Gemini.** Every stored `pgvector` row would be invalidated and the
  column dimension would change, for a saving close to zero. Embeddings stay on OpenAI.
- **The Batch API.** Half price, but a latency budget measured in hours. Nobody waiting on a
  meal plan will accept that.
- **Changing the planning tier's model.** Plan quality is the product.

## Why only the vision tier moves

List prices as of 2026-08-11 (verify before launch; these move):

| Tier | Current rate (in / out per 1M) | Gemini equivalent | Decision |
| --- | --- | --- | --- |
| `cheap` | $0.15 / $0.60 | Flash-Lite, roughly $0.10-0.30 / $0.40-2.50 | **Stay on OpenAI.** Parity at best, and a second vendor on this path buys a failure mode for nothing. |
| `vision` | $2.50 / $10.00 | Flash, $1.50 / $7.50 | **Move.** ~40% cheaper input, ~25% cheaper output. |
| `planning` | $2.50 / $10.00 | not evaluated | **Stay.** Quality dominates. |

The saving compounds with the image work: fewer image tokens multiplied by a lower rate, on
the heaviest operation we run.

## Stage 1 — Right-size the image

Resize before presigning. `presign` is given `contentLength`, so the resize has to happen
first or the presign is wrong.

- `MAX_IMAGE_EDGE_PX = 1024` (longest edge, aspect ratio preserved, never upscale)
- `IMAGE_JPEG_QUALITY = 0.7`

**Mobile.** Add `expo-image-manipulator`. Apply in both `takePhoto` and `pickLibrary` in
`apps/mobile/src/features/capture/PhotoCapture.tsx`, before `addPhoto`. Library picks need it
as much as camera shots.

**Web — deferred, because there is nothing to resize.** This section originally called for a
canvas resize on the paths in `2026-07-27-web-camera-capture-design.md`. Checking the code
before planning showed that design is unbuilt: `apps/web/src/components/kitchen/CaptureFlow.tsx:240`
submits a hardcoded `['mock/receipt-1.jpg']`, and nothing in `apps/web/src` outside the MSW
handlers references `contentLength`, `uploadUrl` or presign. Web uploads no real photo today,
so a web resize would save nothing and be wired to nothing. The resize belongs to whatever work
builds the web upload, and must match `MAX_IMAGE_EDGE_PX` / `IMAGE_JPEG_QUALITY` when it does.

**Orientation is load-bearing.** A phone photo carries its rotation in EXIF. A naive canvas or
manipulator resize discards that metadata, and the pixels come out sideways. A sideways pantry
shelf recognises worse than a right-way-up one, so this would spend the savings on accuracy.
The capture path must bake orientation into the pixels and emit an upright image. This cannot be
unit-tested — the mobile suite is node-only with no native render harness and the manipulator is
native code — so it is a **required manual gate**: photograph something with the phone held
sideways and confirm the stored object is upright.

**Server backstop.** The contract already caps `contentLength` at 15 MB, which is far too loose
to catch an un-resized upload. The presign handler enforces `MAX_CAPTURE_UPLOAD_BYTES = 2 MB`
for the `inventory_photo` and `receipt` purposes and rejects with `VALIDATION_FAILED`. A 1024px
JPEG at quality 0.7 lands well under this, so the ceiling catches an un-resized client without
rejecting a legitimate one. The other purposes (`recipe_image`, `avatar`) keep the existing
limit. This is enforced in the API service layer, not the schema, so `packages/contracts` is
untouched.

The constant is duplicated in each client rather than shared, because it is a capture concern
and neither app should reach into the other. Each copy carries a test asserting the value, so
they cannot drift silently.

## Stage 2 — Route by tier

The seam already exists: `StructuredRequest` carries `tier`, so a provider can dispatch on it.

Introduce `RoutedAiProvider`, which implements `AiProvider`, holds a `ModelTier -> AiProvider`
map, and delegates on `request.tier`. Register it under the **existing** `AI_PROVIDER` token.
`AiGateway`, `SchemaGuard`, and every consuming service change not at all — that is the point of
the design, and the review should treat any change to them as a smell.

`GeminiProvider` implements the same interface: `kind`, and `complete()` returning
`{ raw, usage, model }`. It requests structured output natively (JSON response mime type plus a
response schema) and leaves validation to `SchemaGuard`, exactly as the OpenAI provider does.
It honours the existing per-tier `PROVIDER_TIMEOUT_MS`, `PROVIDER_MAX_RETRIES` and
`PROVIDER_MAX_OUTPUT_TOKENS` tables.

`AiProvider['kind']` widens to `'openai' | 'gemini' | 'mock' | 'routed'`.

**Thinking tokens are output tokens.** Gemini bills its thinking tokens as output and reports
them separately from the visible completion. If the provider maps only the visible count into
`outputTokens`, every call is undercosted and the ledger lies in the one direction that costs
us money. The adapter folds the thinking count into `outputTokens`, with a test.

**Configuration.** `AI_MOCK` continues to short-circuit everything to `MockAiProvider`; it is
checked before any routing. New environment keys: `GEMINI_API_KEY`, `GEMINI_MODEL_VISION`, and
`AI_VISION_VENDOR` (`openai` | `gemini`), which **defaults to `openai`** so a missing or
misconfigured Gemini setup degrades to today's behaviour rather than failing. `config/env.ts`
gains a production guard: if a tier is bound to Gemini, `GEMINI_API_KEY` must be present, in the
same style as the existing OAuth and OpenAI guards.

## Stage 3 — Price by model, not by tier

`MODEL_RATES_USD_PER_MTOK` becomes keyed by concrete model id. `estimateCostUsd` takes the model
id, looks up its rate, and falls back to the tier rate only when the id is unknown — logging a
warning when it does. An unknown model priced silently at a default is how spend drifts without
anyone noticing.

`BudgetService.record` already receives the concrete `model`, so the change is contained.

## Stage 4 — Fallback

Vision only, Gemini to OpenAI, **exactly one hop**. `cheap` and `planning` do not fall back:
`cheap` is single-vendor, and a planning retry on a different model is an expensive way to get a
different answer rather than a better one.

A failed attempt that produced tokens was still billed. `StructuredResponse` gains
`priorAttempts?: { model: string; usage: TokenUsage }[]`, and `AiGateway` records each entry
alongside the successful call. Without this, every fallback is invisible spend — precisely the
error a credit system cannot absorb.

The existing `readSpend` path on the throwing branch stays as it is; it covers the case where
both attempts fail.

## Error handling

- Gemini unavailable, times out, or returns unusable output on the vision tier: one OpenAI
  attempt, then the existing error surfaces unchanged. Clients see no new error code.
- Budget is still asserted once, before the first attempt, in `AiGateway`. Routing does not
  move the budget gate.
- The server continues to send no user-facing prose: any new failure is an `AppError` with a
  code and an i18n `messageKey`.

## Testing

- `RoutedAiProvider`: delegates each tier to its bound provider; falls back on `vision` only;
  makes at most one fallback hop; surfaces `priorAttempts` on a fallback.
- `estimateCostUsd`: prices a known model id from its own rate; falls back to the tier rate and
  warns for an unknown id.
- `GeminiProvider`: thinking tokens are included in `outputTokens`; structured output is parsed;
  the per-tier timeout, retry and output ceilings are applied.
- `env.ts`: production refuses to boot when a tier is bound to Gemini without a key; the default
  binding is `openai`.
- Mobile: the pure fit maths caps the longest edge at 1024 and preserves aspect ratio; the shared
  constants match the values above. Orientation is the manual gate described in Stage 1, not a
  unit test.
- Presign rejects an oversized `inventory_photo` with `VALIDATION_FAILED`.
- `AI_MOCK` behaviour is unchanged, and the existing API suite stays green.

## Verification

Measure before and after on the same pantry photo: image tokens and cost per
`vision.recognize`, read from `ai_usage`. The expectation is a several-fold reduction from the
resize and a further ~40% on input rate from the vendor move. If the measured saving is not
visible in `ai_usage`, the ledger change in Stage 3 is wrong and must be fixed before credits
are built on it.

## Risks

- **Recognition accuracy at 1024px.** Small print on a packet may be lost. Mitigation: the
  measurement above is run on real pantry photos, and the constant is one value in one place if
  it needs to rise. Receipts, which are dense text, should be checked specifically.
- **A second vendor is a second outage surface.** Contained by the vision-only binding, the
  one-hop fallback, and the `openai` default.
- **Prices move.** The table above is dated and the rates live in one constant.
