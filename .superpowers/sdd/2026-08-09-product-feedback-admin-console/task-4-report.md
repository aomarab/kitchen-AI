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

## Fix update — user-isolation rate-limit test
- Added a second seeded user to `apps/api/src/feedback/feedback.spec.ts`.
- Added an integration test that drives user A to the 5-submission limit, verifies A then gets `429` / `RATE_LIMITED`, and verifies user B can still submit successfully.
- Extended test cleanup to delete both seeded users.

## Validation for the fix
- Command: `VITE_CJS_IGNORE_WARNING=1 pnpm --filter @kitchen/api exec vitest run src/feedback/feedback.spec.ts`
  ```
   RUN  v2.1.9 /Users/aomr/projects/kitchen/apps/api

   ✓ src/feedback/feedback.spec.ts (11 tests) 213ms

   Test Files  1 passed (1)
        Tests  11 passed (11)
     Start at  01:11:26
     Duration  847ms (transform 58ms, setup 11ms, collect 411ms, tests 191ms, environment 0ms, prepare 48ms)
  ```
- Command: `pnpm --filter @kitchen/api lint`
  ```
  > @kitchen/api@0.1.0 lint /Users/aomr/projects/kitchen/apps/api
  > eslint src
  ```
