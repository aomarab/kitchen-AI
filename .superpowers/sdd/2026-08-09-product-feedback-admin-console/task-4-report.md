# Task 4 Report — Feedback submission API

Commit: `2cd9c31` — `feat(api): add feedback submission endpoint`

## Implemented
- Added `FeedbackService`, `FeedbackController`, and `FeedbackModule`.
- Wired `FeedbackModule` into `apps/api/src/app.module.ts`.
- Added `errors.feedbackRateLimited` to `packages/i18n/src/en.ts` and `packages/i18n/src/ar.ts`.
- Added `apps/api/src/feedback/feedback.spec.ts` covering auth, validation, persistence, rolling 24h rate limiting, and the 429 envelope.

## TDD evidence
- **RED:** `pnpm --filter @kitchen/api exec vitest run src/feedback/feedback.spec.ts`
  - Failed as expected with: `Failed to load url ./feedback.controller.js ... Does the file exist?`
  - Expected because the spec was written before the feature files existed.
- **GREEN:** `pnpm --filter @kitchen/i18n build`
  - Passed.
- **GREEN:** `pnpm --filter @kitchen/api exec vitest run src/feedback/feedback.spec.ts`
  - Passed: `✓ src/feedback/feedback.spec.ts (10 tests)`

## Validation
- `pnpm build` ✅
- `pnpm typecheck` ✅
- `pnpm lint` ✅
- `pnpm --filter @kitchen/api exec vitest run` ✅ (`32` files, `262` tests)

## Files changed
- `apps/api/src/app.module.ts`
- `apps/api/src/feedback/feedback.controller.ts`
- `apps/api/src/feedback/feedback.module.ts`
- `apps/api/src/feedback/feedback.service.ts`
- `apps/api/src/feedback/feedback.spec.ts`
- `packages/i18n/src/en.ts`
- `packages/i18n/src/ar.ts`

## Self-review
- Rate limiting is scoped to the authenticated user only.
- The cutoff is a rolling 24 hours, not a calendar day.
- The Nth request passes and the (N+1)th request fails.
- The test proves the limit by crossing it.
- No Task 5–9 work was added.

## Concerns
- None.
