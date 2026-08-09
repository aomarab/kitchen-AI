# Product Feedback and Admin Console Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give users a first-party way to send a 1–5 star rating with an optional message from either app, and give staff a web console to read, filter and triage what arrives.

**Architecture:** One new `feedback` table plus a `users.role` column drive five new contract routes — one user-facing submit, four staff-only admin routes. Staff authorisation is declared in the contract registry (`staff: true`) and enforced by a new `StaffGuard`, with a behavioural sweep test that issues a real HTTP request per staff route with an ordinary token and asserts 403. The clients gain a settings-linked submission form each, and the web app gains an `(admin)` route group that sits deliberately outside the `(app)` shell.

**Tech Stack:** TypeScript, zod (`@kitchen/contracts`), NestJS 10 + Drizzle ORM 0.38.3 + PostgreSQL 17, Next.js 15 App Router + Tailwind v4 + TanStack Query, Expo Router + React Native, MSW on both clients, Vitest everywhere, `@kitchen/i18n` (en + ar).

## Global Constraints

Every task's requirements implicitly include this section.

- **This workspace is NOT a git repository.** `git add` / `git commit` will fail. Every "Commit" step below is written as a **verification step** instead. Do not run `git init`.
- **Never edit `packages/contracts` from inside an app.** Contract changes happen in Task 1 only, centrally, before any app consumes them.
- **`turbo run build` must have produced `packages/*/dist` before typecheck, lint or test.** After changing any package under `packages/`, run `pnpm build` (or at minimum `pnpm --filter @kitchen/contracts build && pnpm --filter @kitchen/i18n build`) before running app tests. **If you skip the i18n build, `t()` returns the raw key and your tests will fail confusingly.**
- **Never hand-write a migration.** Edit `apps/api/src/db/schema.ts`, then run `pnpm db:generate`, and keep the generated SQL in `apps/api/drizzle/`.
- **The server never sends user-facing prose.** Throw `AppError(code, 'errors.someKey')`; the client translates.
- **Drizzle `numeric` columns return strings and timestamps return `Date`.** Convert via `apps/api/src/common/serialization.ts` (`toNumber`, `toIso`) — never inline-cast.
- **API imports carry the `.js` extension** (`./feedback.service.js`). Web and mobile imports do not.
- **i18n catalogs are append-only per namespace.** Web strings go in `web.en.ts` + `web.ar.ts`, mobile in `mobile.en.ts` + `mobile.ar.ts`, backend contributes `errors.*` in `en.ts` + `ar.ts` only. **A missing Arabic key is a build error** — always add both.
- **No physical-direction styles.** Web: use `ms-*`/`me-*`, `ps-*`/`pe-*`, `start-*`/`end-*`, `text-start`. Mobile: `marginStart`, `paddingEnd`, `borderTopStartRadius`. ESLint rejects `ml-*`, `pl-*`, `left-*`, `text-left`, `border-l-*`, `rounded-l-*` and the RN equivalents.
- **No raw hex colours** outside `apps/web/src/app/globals.css` and `apps/mobile/src/theme/index.ts`. **No `text-primary` on text** (use `text-primary-text`). **No opacity tints** like `bg-primary/8` (use a solid `*-soft` token). `apps/web/src/lib/token-usage.test.ts` enforces all three.
- **The existing guard tests must stay green without modification:** `apps/web/src/app/palette.test.ts`, `apps/mobile/src/theme/palette.spec.ts`, `apps/web/src/lib/token-usage.test.ts`, `apps/mobile/src/theme/typography.spec.ts`, `apps/mobile/src/mocks/coverage.spec.ts`. Extend them; never relax them.
- **API specs are integration tests against live Postgres.** Run `pnpm infra:up && pnpm db:migrate && pnpm db:seed` before them. In `cleanup`, **delete households before users** — FK ordering matters.
- **Mobile has no render harness.** Any mobile logic that needs a test lives in `apps/mobile/src/lib/` as a pure function.
- **Port 3100 is occupied by an unrelated project on this machine.** Use `WEB_PORT=3200 pnpm dev` if you need the web dev server.
- **Feedback rating is never used to gate the native review prompt.** Do not add any `StoreReview` call anywhere in this plan — sentiment-filtering the store prompt violates Apple Guideline 1.1.7 and Google's In-App Review policy.

---

## File Structure

**Contracts (Task 1)**

| File | Responsibility |
| ---- | -------------- |
| `packages/contracts/src/feedback.ts` | **Create.** Every feedback enum, entity and request/response schema. |
| `packages/contracts/src/index.ts` | **Modify.** Re-export `./feedback.js`. |
| `packages/contracts/src/routes.ts` | **Modify.** Add `staff?: boolean` to `RouteDefinition`; add the 5 route entries. |

**Database (Task 2)**

| File | Responsibility |
| ---- | -------------- |
| `apps/api/src/db/schema.ts` | **Modify.** 3 new pgEnums, `users.role`, the `feedback` table + relations. |
| `apps/api/drizzle/*.sql` + `meta/` | **Generated.** Committed as produced by `pnpm db:generate`. |

**Authorization (Task 3)**

| File | Responsibility |
| ---- | -------------- |
| `apps/api/src/common/staff.guard.ts` | **Create.** Reads `users.role`, throws `FORBIDDEN` for non-staff. |
| `apps/api/src/common/common.module.ts` | **Modify.** Provide + export `StaffGuard`. |
| `apps/api/src/testing/harness.ts` | **Modify.** `seedUser` gains an optional `role`. |

**Feedback submission API (Task 4)**

| File | Responsibility |
| ---- | -------------- |
| `apps/api/src/feedback/feedback.service.ts` | **Create.** Rate-limit check + insert. |
| `apps/api/src/feedback/feedback.controller.ts` | **Create.** `POST /feedback`. |
| `apps/api/src/feedback/feedback.module.ts` | **Create.** Wires both. |
| `apps/api/src/feedback/feedback.spec.ts` | **Create.** Integration spec over real HTTP. |
| `apps/api/src/app.module.ts` | **Modify.** Register `FeedbackModule`. |
| `packages/i18n/src/en.ts` + `ar.ts` | **Modify.** One `errors.feedbackRateLimited` key each. |

**Admin API (Task 5)**

| File | Responsibility |
| ---- | -------------- |
| `apps/api/src/feedback/admin-feedback.service.ts` | **Create.** List/get/update/stats queries + row serialisation. |
| `apps/api/src/feedback/admin-feedback.controller.ts` | **Create.** The 4 staff routes. |
| `apps/api/src/feedback/feedback.module.ts` | **Modify.** Add the admin controller + service. |
| `apps/api/src/feedback/admin-feedback.spec.ts` | **Create.** Integration spec. |

**Staff sweep (Task 6)**

| File | Responsibility |
| ---- | -------------- |
| `apps/api/src/testing/staff-routes.spec.ts` | **Create.** Iterates `routes`, asserts 403 for every `staff: true` route. |

**Mobile (Task 7)**

| File | Responsibility |
| ---- | -------------- |
| `apps/mobile/src/lib/feedback.ts` | **Create.** Pure validation + platform detection, unit-testable. |
| `apps/mobile/src/lib/feedback.spec.ts` | **Create.** Tests for the above. |
| `apps/mobile/src/components/StarRating.tsx` | **Create.** 5 accessible star buttons. |
| `apps/mobile/src/components/index.ts` | **Modify.** Export `StarRating`. |
| `apps/mobile/src/hooks/feedback.ts` | **Create.** `useSubmitFeedback`. |
| `apps/mobile/src/app/settings/feedback.tsx` | **Create.** The screen. |
| `apps/mobile/src/app/settings/index.tsx` | **Modify.** Link row. |
| `apps/mobile/src/mocks/handlers.ts` | **Modify.** `submitFeedback` resolver. |
| `packages/i18n/src/mobile.en.ts` + `mobile.ar.ts` | **Modify.** `mobile.feedback.*`. |

**Web submission (Task 8)**

| File | Responsibility |
| ---- | -------------- |
| `apps/web/src/lib/app-version.ts` | **Create.** Single source for the web `appVersion`. |
| `apps/web/src/components/ui/StarRating.tsx` | **Create.** 5 accessible star buttons. |
| `apps/web/src/components/settings/FeedbackForm.tsx` | **Create.** The form. |
| `apps/web/src/components/settings/FeedbackForm.test.tsx` | **Create.** Keyboard + label tests. |
| `apps/web/src/app/(app)/settings/feedback/page.tsx` | **Create.** Route. |
| `apps/web/src/components/settings/SettingsView.tsx` | **Modify.** Link card. |
| `apps/web/src/hooks/feedback.ts` | **Create.** `useSubmitFeedback`. |
| `apps/web/src/mocks/handlers.ts` + `db.ts` | **Modify.** `POST /feedback` handler + store. |
| `packages/i18n/src/web.en.ts` + `web.ar.ts` | **Modify.** `web.feedback.*`. |

**Web admin console (Task 9)**

| File | Responsibility |
| ---- | -------------- |
| `apps/web/src/components/admin/AdminGate.tsx` | **Create.** UX-only gate (not a security boundary). |
| `apps/web/src/components/admin/AdminGate.test.tsx` | **Create.** Redirect test. |
| `apps/web/src/components/admin/FeedbackStats.tsx` | **Create.** Stats strip. |
| `apps/web/src/components/admin/FeedbackFilters.tsx` | **Create.** Status/rating/platform chips. |
| `apps/web/src/components/admin/FeedbackList.tsx` | **Create.** Paginated list. |
| `apps/web/src/components/admin/FeedbackDetail.tsx` | **Create.** Detail + triage form. |
| `apps/web/src/components/admin/FeedbackDetail.test.tsx` | **Create.** Save test. |
| `apps/web/src/app/(admin)/layout.tsx` | **Create.** Bare chrome + `AdminGate`. |
| `apps/web/src/app/(admin)/admin/page.tsx` | **Create.** List page. |
| `apps/web/src/app/(admin)/admin/feedback/[id]/page.tsx` | **Create.** Detail page. |
| `apps/web/src/lib/feedback-labels.ts` | **Create.** Shared status/platform → i18n key maps (used by 4 components). |
| `apps/web/src/hooks/admin.ts` | **Create.** Admin queries + mutation. |
| `apps/web/src/mocks/handlers.ts` | **Modify.** 4 admin handlers. |
| `packages/i18n/src/web.en.ts` + `web.ar.ts` | **Modify.** `web.admin.*`. |

**Store policy (Task 10)**

| File | Responsibility |
| ---- | -------------- |
| `apps/mobile/src/lib/store-policy.spec.ts` | **Create.** Guard: nothing may import a store-review API. |
| `apps/mobile/ios/KitchenAI/PrivacyInfo.xcprivacy` | **Modify.** Declare the newly collected data types. |
| `docs/store-listing/data-safety.md` | **Create.** The App Store / Play Console answers and their rationale. |

---

### Task 1: Contracts — feedback schemas, `staff` flag, 5 routes

**Files:**
- Create: `packages/contracts/src/feedback.ts`
- Create: `packages/contracts/src/feedback.spec.ts`
- Modify: `packages/contracts/src/index.ts`
- Modify: `packages/contracts/src/routes.ts` (the `RouteDefinition` interface ~line 77, the imports at the top, and the end of the `routes` object just before `} as const satisfies`)

**Interfaces:**
- Consumes: `paginationQuerySchema`, `paginatedSchema`, `localeSchema`, `uuidSchema`, `isoDateTimeSchema`, `idParamSchema` from `./common.js`.
- Produces:
  - Schemas: `feedbackStatusSchema`, `feedbackPlatformSchema`, `feedbackRatingSchema`, `userRoleSchema`, `submitFeedbackRequestSchema`, `submitFeedbackResponseSchema`, `feedbackSummarySchema`, `feedbackDetailSchema`, `listFeedbackQuerySchema`, `updateFeedbackRequestSchema`, `feedbackStatsSchema`
  - Types: `FeedbackStatus`, `FeedbackPlatform`, `UserRole`, `SubmitFeedbackRequest`, `SubmitFeedbackResponse`, `FeedbackSummary`, `FeedbackDetail`, `ListFeedbackQuery`, `UpdateFeedbackRequest`, `FeedbackStats`
  - Constants: `FEEDBACK_MESSAGE_MAX = 2000`, `FEEDBACK_DAILY_LIMIT = 5`
  - Route names: `submitFeedback`, `adminListFeedback`, `adminGetFeedback`, `adminUpdateFeedback`, `adminFeedbackStats`
  - `RouteDefinition.staff?: boolean`

- [ ] **Step 1: Write the failing contract spec**

Create `packages/contracts/src/feedback.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  FEEDBACK_DAILY_LIMIT,
  FEEDBACK_MESSAGE_MAX,
  listFeedbackQuerySchema,
  submitFeedbackRequestSchema,
  updateFeedbackRequestSchema,
} from './feedback.js';
import { routes } from './routes.js';

const valid = {
  rating: 4,
  message: 'The pantry scan missed my olive oil.',
  platform: 'ios' as const,
  appVersion: '1.0.0',
  locale: 'en' as const,
};

describe('submitFeedbackRequestSchema', () => {
  it('accepts the boundary ratings', () => {
    expect(submitFeedbackRequestSchema.safeParse({ ...valid, rating: 1 }).success).toBe(true);
    expect(submitFeedbackRequestSchema.safeParse({ ...valid, rating: 5 }).success).toBe(true);
  });

  it('rejects ratings outside 1-5 and non-integers', () => {
    for (const rating of [0, 6, 2.5, -1]) {
      expect(submitFeedbackRequestSchema.safeParse({ ...valid, rating }).success).toBe(false);
    }
  });

  it('accepts a rating with no message but not a message with no rating', () => {
    const { message, ...noMessage } = valid;
    expect(submitFeedbackRequestSchema.safeParse(noMessage).success).toBe(true);
    const { rating, ...noRating } = valid;
    expect(submitFeedbackRequestSchema.safeParse(noRating).success).toBe(false);
  });

  it('caps the message length', () => {
    const long = { ...valid, message: 'x'.repeat(FEEDBACK_MESSAGE_MAX + 1) };
    expect(submitFeedbackRequestSchema.safeParse(long).success).toBe(false);
    const atLimit = { ...valid, message: 'x'.repeat(FEEDBACK_MESSAGE_MAX) };
    expect(submitFeedbackRequestSchema.safeParse(atLimit).success).toBe(true);
  });

  it('rejects an unknown platform', () => {
    expect(submitFeedbackRequestSchema.safeParse({ ...valid, platform: 'windows' }).success).toBe(false);
  });

  it('exposes the daily limit the API enforces', () => {
    expect(FEEDBACK_DAILY_LIMIT).toBe(5);
  });
});

describe('listFeedbackQuerySchema', () => {
  it('defaults the limit and leaves every filter optional', () => {
    const parsed = listFeedbackQuerySchema.parse({});
    expect(parsed.limit).toBe(50);
    expect(parsed.status).toBeUndefined();
  });

  it('coerces a numeric rating filter from a query string', () => {
    expect(listFeedbackQuerySchema.parse({ rating: '3' }).rating).toBe(3);
  });
});

describe('updateFeedbackRequestSchema', () => {
  it('rejects an empty patch so a no-op cannot stamp a reviewer', () => {
    expect(updateFeedbackRequestSchema.safeParse({}).success).toBe(false);
  });

  it('accepts either field alone', () => {
    expect(updateFeedbackRequestSchema.safeParse({ status: 'triaged' }).success).toBe(true);
    expect(updateFeedbackRequestSchema.safeParse({ adminNote: 'Duplicate.' }).success).toBe(true);
  });
});

describe('feedback routes', () => {
  it('registers the user route without a household requirement', () => {
    expect(routes.submitFeedback).toMatchObject({
      method: 'POST',
      path: '/feedback',
      auth: true,
      household: false,
    });
  });

  it('marks every admin route staff-only', () => {
    const admin = ['adminListFeedback', 'adminGetFeedback', 'adminUpdateFeedback', 'adminFeedbackStats'] as const;
    for (const name of admin) {
      expect(routes[name].staff).toBe(true);
      expect(routes[name].auth).toBe(true);
      expect(routes[name].household).toBe(false);
    }
  });

  it('puts the stats path ahead of the :id path so Nest does not match "stats" as an id', () => {
    const names = Object.keys(routes);
    expect(names.indexOf('adminFeedbackStats')).toBeLessThan(names.indexOf('adminGetFeedback'));
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter @kitchen/contracts exec vitest run src/feedback.spec.ts`
Expected: FAIL — `Failed to resolve import "./feedback.js"`.

- [ ] **Step 3: Create the feedback contract**

Create `packages/contracts/src/feedback.ts`:

```ts
import { z } from 'zod';
import { isoDateTimeSchema, localeSchema, paginationQuerySchema, uuidSchema } from './common.js';

/* ------------------------------------------------------------------ */
/* Enums                                                               */
/* ------------------------------------------------------------------ */

/** Global account role. Promotion to `staff` happens by SQL only — no route sets this. */
export const userRoleSchema = z.enum(['user', 'staff']);
export type UserRole = z.infer<typeof userRoleSchema>;

export const feedbackStatusSchema = z.enum(['new', 'triaged', 'resolved', 'wont_fix']);
export type FeedbackStatus = z.infer<typeof feedbackStatusSchema>;

export const feedbackPlatformSchema = z.enum(['ios', 'android', 'web']);
export type FeedbackPlatform = z.infer<typeof feedbackPlatformSchema>;

/** Stored as `smallint` with a CHECK constraint; mirrored here so clients cannot send 0 or 6. */
export const feedbackRatingSchema = z.number().int().min(1).max(5);

/** Longer messages are truncated by no one — they are rejected, so the limit is a contract. */
export const FEEDBACK_MESSAGE_MAX = 2000;

/** Submissions allowed per user per rolling 24 hours. The API rejects the next one. */
export const FEEDBACK_DAILY_LIMIT = 5;

/* ------------------------------------------------------------------ */
/* Submission                                                          */
/* ------------------------------------------------------------------ */

/**
 * `platform`, `appVersion` and `locale` are sent by the client because only the
 * client knows them, and validated here so a bad build cannot poison the table.
 * A rating with no message is valid; a message with no rating is not.
 */
export const submitFeedbackRequestSchema = z.object({
  rating: feedbackRatingSchema,
  message: z.string().trim().min(1).max(FEEDBACK_MESSAGE_MAX).optional(),
  platform: feedbackPlatformSchema,
  appVersion: z.string().min(1).max(32),
  locale: localeSchema,
});
export type SubmitFeedbackRequest = z.infer<typeof submitFeedbackRequestSchema>;

/** There is no "my feedback" view, so the client needs nothing but the receipt. */
export const submitFeedbackResponseSchema = z.object({
  id: uuidSchema,
  createdAt: isoDateTimeSchema,
});
export type SubmitFeedbackResponse = z.infer<typeof submitFeedbackResponseSchema>;

/* ------------------------------------------------------------------ */
/* Admin views                                                         */
/* ------------------------------------------------------------------ */

export const feedbackSummarySchema = z.object({
  id: uuidSchema,
  rating: feedbackRatingSchema,
  message: z.string().nullable(),
  platform: feedbackPlatformSchema,
  appVersion: z.string(),
  locale: localeSchema,
  status: feedbackStatusSchema,
  createdAt: isoDateTimeSchema,
});
export type FeedbackSummary = z.infer<typeof feedbackSummarySchema>;

/**
 * Adds the agreed limit of customer data: who sent it and when they joined.
 * Deliberately no household, inventory or meal-plan data.
 */
export const feedbackDetailSchema = feedbackSummarySchema.extend({
  adminNote: z.string().nullable(),
  reviewedAt: isoDateTimeSchema.nullable(),
  submitter: z.object({
    id: uuidSchema,
    email: z.string().email(),
    displayName: z.string(),
    locale: localeSchema,
    joinedAt: isoDateTimeSchema,
  }),
});
export type FeedbackDetail = z.infer<typeof feedbackDetailSchema>;

export const listFeedbackQuerySchema = paginationQuerySchema.extend({
  status: feedbackStatusSchema.optional(),
  rating: z.coerce.number().int().min(1).max(5).optional(),
  platform: feedbackPlatformSchema.optional(),
});
export type ListFeedbackQuery = z.infer<typeof listFeedbackQuerySchema>;

/**
 * Any status may replace any other — there is no state machine. At least one
 * field must be present, so a no-op PATCH cannot silently stamp a reviewer.
 */
export const updateFeedbackRequestSchema = z
  .object({
    status: feedbackStatusSchema.optional(),
    adminNote: z.string().max(FEEDBACK_MESSAGE_MAX).nullable().optional(),
  })
  .refine((body) => body.status !== undefined || body.adminNote !== undefined, {
    message: 'At least one of status or adminNote is required',
  });
export type UpdateFeedbackRequest = z.infer<typeof updateFeedbackRequestSchema>;

export const feedbackStatsSchema = z.object({
  total: z.number().int().nonnegative(),
  /** `null` when there is nothing to average. */
  averageRating: z.number().nullable(),
  byStatus: z.record(feedbackStatusSchema, z.number().int().nonnegative()),
  /** Keyed '1'…'5'. */
  byRating: z.record(z.string(), z.number().int().nonnegative()),
});
export type FeedbackStats = z.infer<typeof feedbackStatsSchema>;
```

- [ ] **Step 4: Export it from the package index**

In `packages/contracts/src/index.ts`, add the line after `export * from './ai.js';`:

```ts
export * from './feedback.js';
```

- [ ] **Step 5: Add `staff` to `RouteDefinition`**

In `packages/contracts/src/routes.ts`, extend the interface (currently ~line 77). Replace:

```ts
export interface RouteDefinition {
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  path: string;
  auth: boolean;
  household: boolean;
```

with:

```ts
export interface RouteDefinition {
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  path: string;
  auth: boolean;
  household: boolean;
  /**
   * Requires `users.role = 'staff'`. Declared here rather than only in a
   * controller so `apps/api/src/testing/staff-routes.spec.ts` can sweep every
   * such route with an ordinary token and assert 403 — a new admin route that
   * forgets `StaffGuard` fails the suite the moment it is added.
   */
  staff?: boolean;
```

Also update the doc comment above the interface — after the `household — requires the \`x-household-id\` header` line, add:

```
 *   staff     — requires the authenticated user's global role to be `staff`
```

- [ ] **Step 6: Import the feedback schemas in the registry**

In `packages/contracts/src/routes.ts`, add this import immediately after the existing `import { ... } from './ai.js';` block:

```ts
import {
  feedbackDetailSchema,
  feedbackStatsSchema,
  feedbackSummarySchema,
  listFeedbackQuerySchema,
  submitFeedbackRequestSchema,
  submitFeedbackResponseSchema,
  updateFeedbackRequestSchema,
} from './feedback.js';
```

- [ ] **Step 7: Register the five routes**

In `packages/contracts/src/routes.ts`, insert this block immediately before the closing `} as const satisfies Record<string, RouteDefinition>;` — i.e. after the `getAiUsage` entry:

```ts
  /* ---------------- Feedback ---------------- */
  submitFeedback: {
    method: 'POST',
    path: '/feedback',
    auth: true,
    household: false,
    body: submitFeedbackRequestSchema,
    response: submitFeedbackResponseSchema,
  },

  /* ---------------- Admin (staff only) ---------------- */
  // `stats` is declared before `:id` so the literal segment always wins the match.
  adminFeedbackStats: {
    method: 'GET',
    path: '/admin/feedback/stats',
    auth: true,
    household: false,
    staff: true,
    response: feedbackStatsSchema,
  },
  adminListFeedback: {
    method: 'GET',
    path: '/admin/feedback',
    auth: true,
    household: false,
    staff: true,
    query: listFeedbackQuerySchema,
    response: paginatedSchema(feedbackSummarySchema),
  },
  adminGetFeedback: {
    method: 'GET',
    path: '/admin/feedback/:id',
    auth: true,
    household: false,
    staff: true,
    params: idParamSchema,
    response: feedbackDetailSchema,
  },
  adminUpdateFeedback: {
    method: 'PATCH',
    path: '/admin/feedback/:id',
    auth: true,
    household: false,
    staff: true,
    params: idParamSchema,
    body: updateFeedbackRequestSchema,
    response: feedbackDetailSchema,
  },
```

`paginatedSchema` and `idParamSchema` are already imported at the top of the file — no import change is needed for them.

- [ ] **Step 8: Run the spec and the whole contracts suite**

Run: `pnpm --filter @kitchen/contracts exec vitest run`
Expected: PASS, including all pre-existing contract tests.

- [ ] **Step 9: Build the package and typecheck the workspace**

Run: `pnpm build && pnpm typecheck`
Expected: both succeed. The build must run before anything else consumes the new types.

- [ ] **Step 10: Verify (no commit — this is not a git repository)**

Run: `pnpm --filter @kitchen/contracts lint`
Expected: clean. Confirm `packages/contracts/dist/feedback.d.ts` exists.

---

### Task 2: Database schema — role column, feedback table, generated migration

**Files:**
- Modify: `apps/api/src/db/schema.ts` (pg-core import block lines 2–17; enums ~line 24; `users` table ~line 106; append the feedback table + relations at the end)
- Generated: `apps/api/drizzle/*.sql`, `apps/api/drizzle/meta/*`

**Interfaces:**
- Consumes: `users` table from the same file.
- Produces: `userRoleEnum`, `feedbackStatusEnum`, `feedbackPlatformEnum`, the `feedback` table export with columns `id, userId, rating, message, platform, appVersion, locale, status, adminNote, reviewedBy, reviewedAt, createdAt`, and `users.role`.

- [ ] **Step 1: Write the failing schema spec**

Create `apps/api/src/db/feedback-schema.spec.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { cleanup, createTestContext, seedUser, type TestContext } from '../testing/harness.js';
import { feedback, users } from './schema.js';

/**
 * The rating CHECK lives in Postgres, not just in zod: the API is not the only
 * writer (seeds, backfills and psql all are), and a 0-star row would break the
 * average the console reports.
 */
describe('feedback schema', () => {
  let ctx: TestContext;
  let userId: string;

  beforeAll(async () => {
    ctx = createTestContext();
    userId = await seedUser(ctx.db);
  });

  afterAll(async () => {
    await cleanup(ctx.db, { users: [userId] });
    await ctx.client.end({ timeout: 5 });
  });

  it('defaults a new account to the user role', async () => {
    const [row] = await ctx.db.select({ role: users.role }).from(users).where(eq(users.id, userId));
    expect(row?.role).toBe('user');
  });

  it('stores a submission with server defaults', async () => {
    const [row] = await ctx.db
      .insert(feedback)
      .values({ userId, rating: 5, platform: 'ios', appVersion: '1.0.0', locale: 'en' })
      .returning();

    expect(row?.status).toBe('new');
    expect(row?.message).toBeNull();
    expect(row?.reviewedBy).toBeNull();
    expect(row?.createdAt).toBeInstanceOf(Date);
  });

  it('refuses a rating outside 1-5 at the database level', async () => {
    await expect(
      ctx.db
        .insert(feedback)
        .values({ userId, rating: 0, platform: 'web', appVersion: '1.0.0', locale: 'en' }),
    ).rejects.toThrow();
    await expect(
      ctx.db
        .insert(feedback)
        .values({ userId, rating: 6, platform: 'web', appVersion: '1.0.0', locale: 'en' }),
    ).rejects.toThrow();
  });

  it('deletes feedback with the account', async () => {
    const scratch = await seedUser(ctx.db);
    await ctx.db
      .insert(feedback)
      .values({ userId: scratch, rating: 3, platform: 'android', appVersion: '1.0.0', locale: 'ar' });
    await cleanup(ctx.db, { users: [scratch] });

    const rows = await ctx.db.select().from(feedback).where(eq(feedback.userId, scratch));
    expect(rows).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm infra:up && pnpm --filter @kitchen/api exec vitest run src/db/feedback-schema.spec.ts`
Expected: FAIL — `feedback` is not exported from `./schema.js`.

- [ ] **Step 3: Extend the pg-core imports**

In `apps/api/src/db/schema.ts`, the import block currently reads:

```ts
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  vector,
} from 'drizzle-orm/pg-core';
```

Add `check` and `smallint` in alphabetical position:

```ts
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  vector,
} from 'drizzle-orm/pg-core';
```

Both are exported by drizzle-orm 0.38.3 — verified.

- [ ] **Step 4: Add the three enums**

In the same file, immediately after `export const householdRoleEnum = pgEnum('household_role', ['owner', 'member']);` add:

```ts
/** Global account role, distinct from the per-household `household_role`. */
export const userRoleEnum = pgEnum('user_role', ['user', 'staff']);
export const feedbackStatusEnum = pgEnum('feedback_status', ['new', 'triaged', 'resolved', 'wont_fix']);
export const feedbackPlatformEnum = pgEnum('feedback_platform', ['ios', 'android', 'web']);
```

- [ ] **Step 5: Add `role` to the users table**

In the `users` table definition, add the column after `locale`:

```ts
    locale: localeEnum('locale').notNull().default('en'),
    role: userRoleEnum('role').notNull().default('user'),
```

- [ ] **Step 6: Add the feedback table**

Append to the end of `apps/api/src/db/schema.ts`:

```ts
/* ------------------------------------------------------------------ */
/* Feedback                                                            */
/* ------------------------------------------------------------------ */

/**
 * App feedback: a 1–5 rating and an optional message.
 *
 * `ON DELETE CASCADE` on `user_id` is deliberate. Account deletion must have a
 * single erasure path, and the message is free text the user has asked us to
 * forget; keeping an orphaned row for the sake of an average would retain
 * exactly the part we were asked to delete.
 *
 * `platform`, `app_version` and `locale` are captured because a 2★ rating
 * without them is unactionable. None is a device identifier.
 */
export const feedback = pgTable(
  'feedback',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    rating: smallint('rating').notNull(),
    message: text('message'),
    platform: feedbackPlatformEnum('platform').notNull(),
    appVersion: text('app_version').notNull(),
    locale: localeEnum('locale').notNull(),
    status: feedbackStatusEnum('status').notNull().default('new'),
    adminNote: text('admin_note'),
    reviewedBy: uuid('reviewed_by').references(() => users.id, { onDelete: 'set null' }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check('feedback_rating_range', sql`${table.rating} between 1 and 5`),
    index('feedback_status_created_idx').on(table.status, table.createdAt.desc()),
    index('feedback_created_idx').on(table.createdAt.desc()),
    // The rate-limit check counts one user's rows in the last 24 hours.
    index('feedback_user_created_idx').on(table.userId, table.createdAt.desc()),
  ],
);

export const feedbackRelations = relations(feedback, ({ one }) => ({
  user: one(users, { fields: [feedback.userId], references: [users.id], relationName: 'submitter' }),
  reviewer: one(users, { fields: [feedback.reviewedBy], references: [users.id], relationName: 'reviewer' }),
}));
```

`relations` and `sql` are already imported at the top of the file.

- [ ] **Step 7: Generate the migration**

Run: `pnpm db:generate`
Expected: a new file appears in `apps/api/drizzle/` (e.g. `0001_*.sql`) containing `CREATE TYPE "public"."user_role"`, `CREATE TYPE "public"."feedback_status"`, `CREATE TYPE "public"."feedback_platform"`, `ALTER TABLE "users" ADD COLUMN "role"`, and `CREATE TABLE "feedback"`.

Open the generated SQL and read it. Do **not** edit it. If it is missing the CHECK constraint or an index, fix `schema.ts` and regenerate rather than patching the SQL.

- [ ] **Step 8: Apply the migration**

Run: `pnpm db:migrate`
Expected: applies cleanly with no error.

- [ ] **Step 9: Run the schema spec**

Run: `pnpm --filter @kitchen/api exec vitest run src/db/feedback-schema.spec.ts`
Expected: PASS — all four tests.

- [ ] **Step 10: Verify nothing else regressed**

Run: `pnpm --filter @kitchen/api exec vitest run && pnpm --filter @kitchen/api typecheck`
Expected: the full API suite passes (242 tests before this task, 246 after).

---

### Task 3: `StaffGuard` and a staff-aware test harness

**Files:**
- Create: `apps/api/src/common/staff.guard.ts`
- Create: `apps/api/src/common/staff.guard.spec.ts`
- Modify: `apps/api/src/common/common.module.ts`
- Modify: `apps/api/src/testing/harness.ts` (the `seedUser` function)

**Interfaces:**
- Consumes: `AuthUser` from `./request-context.js` (set by `AuthGuard`), `DB`/`Database` from `../db/index.js`, `users` from `../db/schema.js`, `AppError` from `./errors.js`.
- Produces:
  - `export class StaffGuard implements CanActivate` — must run **after** `AuthGuard`.
  - `seedUser(db, email?, role?)` where `role` is `'user' | 'staff'` and defaults to `'user'`. **The existing two-argument call sites keep working unchanged.**

- [ ] **Step 1: Write the failing guard spec**

Create `apps/api/src/common/staff.guard.spec.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ExecutionContext } from '@nestjs/common';
import { cleanup, createTestContext, seedUser, type TestContext } from '../testing/harness.js';
import { AppError } from './errors.js';
import { StaffGuard } from './staff.guard.js';

function contextFor(authUser: { userId: string } | undefined): ExecutionContext {
  const request = { authUser };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('StaffGuard', () => {
  let ctx: TestContext;
  let guard: StaffGuard;
  let staffId: string;
  let plainId: string;

  beforeAll(async () => {
    ctx = createTestContext();
    guard = new StaffGuard(ctx.db);
    staffId = await seedUser(ctx.db, undefined, 'staff');
    plainId = await seedUser(ctx.db);
  });

  afterAll(async () => {
    await cleanup(ctx.db, { users: [staffId, plainId] });
    await ctx.client.end({ timeout: 5 });
  });

  it('admits a staff account', async () => {
    await expect(guard.canActivate(contextFor({ userId: staffId }))).resolves.toBe(true);
  });

  it('rejects an ordinary account with FORBIDDEN', async () => {
    await expect(guard.canActivate(contextFor({ userId: plainId }))).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('rejects a valid token whose user no longer exists', async () => {
    const context = contextFor({ userId: '00000000-0000-4000-8000-000000000000' });
    await expect(guard.canActivate(context)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('rejects when AuthGuard has not run', async () => {
    await expect(guard.canActivate(contextFor(undefined))).rejects.toBeInstanceOf(AppError);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter @kitchen/api exec vitest run src/common/staff.guard.spec.ts`
Expected: FAIL — cannot resolve `./staff.guard.js`.

- [ ] **Step 3: Widen `seedUser` to take a role**

In `apps/api/src/testing/harness.ts`, replace the whole `seedUser` function:

```ts
export async function seedUser(db: TestDatabase, email?: string): Promise<string> {
  const [row] = await db
    .insert(schema.users)
    .values({ email: email ?? `test+${randomUUID()}@example.com`, displayName: 'Test User' })
    .returning({ id: schema.users.id });
  if (!row) throw new Error('failed to seed user');
  return row.id;
}
```

with:

```ts
export async function seedUser(
  db: TestDatabase,
  email?: string,
  role: UserRole = 'user',
): Promise<string> {
  const [row] = await db
    .insert(schema.users)
    .values({
      email: email ?? `test+${randomUUID()}@example.com`,
      displayName: 'Test User',
      role,
    })
    .returning({ id: schema.users.id });
  if (!row) throw new Error('failed to seed user');
  return row.id;
}
```

and widen the existing contracts import at the top of the file from:

```ts
import type { HouseholdRole } from '@kitchen/contracts';
```

to:

```ts
import type { HouseholdRole, UserRole } from '@kitchen/contracts';
```

- [ ] **Step 4: Write the guard**

Create `apps/api/src/common/staff.guard.ts`:

```ts
import { Inject, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { eq } from 'drizzle-orm';
import { DB, type Database } from '../db/index.js';
import { users } from '../db/schema.js';
import { AppError } from './errors.js';

/**
 * Guards every route declared `staff: true` in the route registry. Reads the
 * global `users.role` for the authenticated user; anything but `staff` is
 * `FORBIDDEN`. Must run after {@link AuthGuard}.
 *
 * The role is read from the database on every request rather than carried in
 * the access token: a revoked staff member keeps a valid token for the whole
 * `JWT_ACCESS_TTL`, and the console is exactly the surface where that window
 * matters.
 */
@Injectable()
export class StaffGuard implements CanActivate {
  constructor(@Inject(DB) private readonly db: Database) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();

    const authUser = request.authUser;
    if (!authUser) throw AppError.unauthenticated();

    const [row] = await this.db
      .select({ role: users.role })
      .from(users)
      .where(eq(users.id, authUser.userId))
      .limit(1);

    // A missing row is a deleted account with a live token — not staff.
    if (!row || row.role !== 'staff') throw AppError.forbidden();

    return true;
  }
}
```

- [ ] **Step 5: Register it in the global module**

In `apps/api/src/common/common.module.ts`, add the import:

```ts
import { StaffGuard } from './staff.guard.js';
```

and change the two arrays:

```ts
  providers: [AuthGuard, HouseholdGuard, StaffGuard],
  exports: [AuthGuard, HouseholdGuard, StaffGuard, JwtModule],
```

- [ ] **Step 6: Run the guard spec**

Run: `pnpm --filter @kitchen/api exec vitest run src/common/staff.guard.spec.ts`
Expected: PASS — all four tests.

- [ ] **Step 7: Verify the harness change broke nothing**

Run: `pnpm --filter @kitchen/api exec vitest run && pnpm --filter @kitchen/api typecheck && pnpm --filter @kitchen/api lint`
Expected: the whole API suite still passes — `seedUser`'s third parameter is optional, so every existing call site is unaffected.

---

### Task 4: Feedback submission API

**Files:**
- Create: `apps/api/src/feedback/feedback.service.ts`
- Create: `apps/api/src/feedback/feedback.controller.ts`
- Create: `apps/api/src/feedback/feedback.module.ts`
- Create: `apps/api/src/feedback/feedback.spec.ts`
- Modify: `apps/api/src/app.module.ts`
- Modify: `packages/i18n/src/en.ts` and `packages/i18n/src/ar.ts` (the `errors` block)

**Interfaces:**
- Consumes: `submitFeedbackRequestSchema`, `SubmitFeedbackRequest`, `SubmitFeedbackResponse`, `FEEDBACK_DAILY_LIMIT` (Task 1); `feedback` table (Task 2); `AuthGuard`, `CurrentUser`, `ZodPipe`, `AppError`, `toIso`.
- Produces:
  - `FeedbackService.submit(userId: string, body: SubmitFeedbackRequest): Promise<SubmitFeedbackResponse>`
  - `FeedbackController` mounted at `/feedback`
  - `FeedbackModule` exporting `FeedbackService`
  - i18n key `errors.feedbackRateLimited`

- [ ] **Step 1: Write the failing integration spec**

Create `apps/api/src/feedback/feedback.spec.ts`:

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtModule } from '@nestjs/jwt';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import { FEEDBACK_DAILY_LIMIT, FEEDBACK_MESSAGE_MAX } from '@kitchen/contracts';
import { DB } from '../db/index.js';
import { feedback } from '../db/schema.js';
import { AppExceptionFilter } from '../common/errors.js';
import { AuthGuard } from '../common/auth.guard.js';
import { cleanup, createTestContext, seedUser, type TestContext } from '../testing/harness.js';
import { FeedbackController } from './feedback.controller.js';
import { FeedbackService } from './feedback.service.js';

const body = {
  rating: 4,
  message: 'The scan missed my olive oil.',
  platform: 'ios' as const,
  appVersion: '1.2.3',
  locale: 'en' as const,
};

describe('POST /feedback', () => {
  let ctx: TestContext;
  let app: INestApplication;
  let userId: string;
  let token: string;

  beforeAll(async () => {
    ctx = createTestContext();
    userId = await seedUser(ctx.db);
    token = await ctx.jwt.signAsync({ sub: userId });

    const moduleRef = await Test.createTestingModule({
      imports: [
        JwtModule.register({
          secret: ctx.env.JWT_SECRET,
          signOptions: { expiresIn: ctx.env.JWT_ACCESS_TTL },
        }),
      ],
      controllers: [FeedbackController],
      providers: [{ provide: DB, useValue: ctx.db }, AuthGuard, FeedbackService],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new AppExceptionFilter());
    await app.init();
  });

  beforeEach(async () => {
    await ctx.db.delete(feedback).where(eq(feedback.userId, userId));
  });

  afterAll(async () => {
    await app?.close();
    await cleanup(ctx.db, { users: [userId] });
    await ctx.client.end({ timeout: 5 });
  });

  const post = (payload: unknown) =>
    request(app.getHttpServer())
      .post('/feedback')
      .set('authorization', `Bearer ${token}`)
      .send(payload);

  it('stores a submission and returns only the receipt', async () => {
    const res = await post(body);

    expect(res.status).toBe(201);
    expect(Object.keys(res.body).sort()).toEqual(['createdAt', 'id']);

    const [row] = await ctx.db.select().from(feedback).where(eq(feedback.id, res.body.id));
    expect(row).toMatchObject({
      userId,
      rating: 4,
      message: body.message,
      platform: 'ios',
      appVersion: '1.2.3',
      locale: 'en',
      status: 'new',
      adminNote: null,
      reviewedBy: null,
      reviewedAt: null,
    });
  });

  it('accepts a rating with no message', async () => {
    const { message, ...noMessage } = body;
    const res = await post(noMessage);

    expect(res.status).toBe(201);
    const [row] = await ctx.db.select().from(feedback).where(eq(feedback.id, res.body.id));
    expect(row?.message).toBeNull();
  });

  it.each([0, 6])('rejects rating %i', async (rating) => {
    const res = await post({ ...body, rating });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_FAILED');
  });

  it.each([1, 5])('accepts rating %i', async (rating) => {
    expect((await post({ ...body, rating })).status).toBe(201);
  });

  it('rejects a message over the contract limit', async () => {
    const res = await post({ ...body, message: 'x'.repeat(FEEDBACK_MESSAGE_MAX + 1) });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_FAILED');
  });

  it('rejects the submission after the daily limit with a translatable key', async () => {
    for (let i = 0; i < FEEDBACK_DAILY_LIMIT; i += 1) {
      expect((await post(body)).status).toBe(201);
    }

    const res = await post(body);
    expect(res.status).toBe(429);
    expect(res.body).toMatchObject({
      code: 'RATE_LIMITED',
      messageKey: 'errors.feedbackRateLimited',
    });
    // The rejected one is not stored.
    const rows = await ctx.db.select().from(feedback).where(eq(feedback.userId, userId));
    expect(rows).toHaveLength(FEEDBACK_DAILY_LIMIT);
  });

  it('counts only the last 24 hours toward the limit', async () => {
    const old = new Date(Date.now() - 25 * 60 * 60 * 1000);
    await ctx.db.insert(feedback).values(
      Array.from({ length: FEEDBACK_DAILY_LIMIT }, () => ({
        userId,
        rating: 3,
        platform: 'web' as const,
        appVersion: '1.0.0',
        locale: 'en' as const,
        createdAt: old,
      })),
    );

    expect((await post(body)).status).toBe(201);
  });

  it('requires authentication', async () => {
    const res = await request(app.getHttpServer()).post('/feedback').send(body);
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter @kitchen/api exec vitest run src/feedback/feedback.spec.ts`
Expected: FAIL — cannot resolve `./feedback.controller.js`.

- [ ] **Step 3: Add the error message key**

In `packages/i18n/src/en.ts`, inside the `errors` block, add after the `offline` line:

```ts
    feedbackRateLimited: "You've sent us plenty of feedback today. Please try again tomorrow.",
```

In `packages/i18n/src/ar.ts`, in the same position inside its `errors` block:

```ts
    feedbackRateLimited: 'لقد أرسلت لنا ملاحظات كثيرة اليوم. يرجى المحاولة غدًا.',
```

- [ ] **Step 4: Write the service**

Create `apps/api/src/feedback/feedback.service.ts`:

```ts
import { Inject, Injectable } from '@nestjs/common';
import { and, count, eq, gte } from 'drizzle-orm';
import {
  FEEDBACK_DAILY_LIMIT,
  type SubmitFeedbackRequest,
  type SubmitFeedbackResponse,
} from '@kitchen/contracts';
import { DB, type Database } from '../db/index.js';
import { feedback } from '../db/schema.js';
import { AppError } from '../common/errors.js';
import { toIso } from '../common/serialization.js';

const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class FeedbackService {
  constructor(@Inject(DB) private readonly db: Database) {}

  /**
   * Abuse control is a count over this user's last 24 hours rather than a
   * throttler package: the endpoint is authenticated and low-traffic, so the
   * one extra indexed count is cheaper than a new dependency and a Redis
   * bucket. `feedback_user_created_idx` covers it.
   */
  async submit(userId: string, body: SubmitFeedbackRequest): Promise<SubmitFeedbackResponse> {
    const since = new Date(Date.now() - DAY_MS);
    const [recent] = await this.db
      .select({ value: count() })
      .from(feedback)
      .where(and(eq(feedback.userId, userId), gte(feedback.createdAt, since)));

    if ((recent?.value ?? 0) >= FEEDBACK_DAILY_LIMIT) {
      throw new AppError('RATE_LIMITED', 'errors.feedbackRateLimited', {
        limit: FEEDBACK_DAILY_LIMIT,
      });
    }

    const [row] = await this.db
      .insert(feedback)
      .values({
        userId,
        rating: body.rating,
        message: body.message ?? null,
        platform: body.platform,
        appVersion: body.appVersion,
        locale: body.locale,
      })
      .returning({ id: feedback.id, createdAt: feedback.createdAt });

    if (!row) throw new AppError('INTERNAL_ERROR');

    return { id: row.id, createdAt: toIso(row.createdAt) };
  }
}
```

- [ ] **Step 5: Write the controller**

Create `apps/api/src/feedback/feedback.controller.ts`:

```ts
import { Body, Controller, Inject, Post, UseGuards } from '@nestjs/common';
import {
  submitFeedbackRequestSchema,
  type SubmitFeedbackRequest,
  type SubmitFeedbackResponse,
} from '@kitchen/contracts';
import { ZodPipe } from '../common/http.js';
import { AuthGuard } from '../common/auth.guard.js';
import { CurrentUser } from '../common/current-user.decorator.js';
import type { AuthUser } from '../common/request-context.js';
import { FeedbackService } from './feedback.service.js';

/** Feedback belongs to a user, not a household — no `HouseholdGuard` here. */
@Controller('feedback')
@UseGuards(AuthGuard)
export class FeedbackController {
  constructor(@Inject(FeedbackService) private readonly feedback: FeedbackService) {}

  @Post()
  submit(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(submitFeedbackRequestSchema)) body: SubmitFeedbackRequest,
  ): Promise<SubmitFeedbackResponse> {
    return this.feedback.submit(user.userId, body);
  }
}
```

- [ ] **Step 6: Write the module and register it**

Create `apps/api/src/feedback/feedback.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { FeedbackController } from './feedback.controller.js';
import { FeedbackService } from './feedback.service.js';

@Module({
  controllers: [FeedbackController],
  providers: [FeedbackService],
  exports: [FeedbackService],
})
export class FeedbackModule {}
```

In `apps/api/src/app.module.ts`, add the import after the `AiModule` import:

```ts
import { FeedbackModule } from './feedback/feedback.module.js';
```

and add `FeedbackModule,` to the `imports` array after `AiModule,`.

- [ ] **Step 7: Rebuild i18n, then run the spec**

Run: `pnpm --filter @kitchen/i18n build && pnpm --filter @kitchen/api exec vitest run src/feedback/feedback.spec.ts`
Expected: PASS — all 10 test cases.

- [ ] **Step 8: Verify the whole API and the i18n catalog**

Run: `pnpm --filter @kitchen/i18n test && pnpm --filter @kitchen/api exec vitest run && pnpm --filter @kitchen/api typecheck && pnpm --filter @kitchen/api lint`
Expected: all pass. The i18n build would already have failed if the Arabic key were missing.

---

### Task 5: Admin feedback API — list, get, update, stats

**Files:**
- Create: `apps/api/src/feedback/admin-feedback.service.ts`
- Create: `apps/api/src/feedback/admin-feedback.controller.ts`
- Create: `apps/api/src/feedback/admin-feedback.spec.ts`
- Modify: `apps/api/src/feedback/feedback.module.ts`

**Interfaces:**
- Consumes: `listFeedbackQuerySchema`, `updateFeedbackRequestSchema`, `FeedbackSummary`, `FeedbackDetail`, `FeedbackStats`, `ListFeedbackQuery`, `UpdateFeedbackRequest` (Task 1); `feedback` + `users` (Task 2); `StaffGuard` (Task 3); `decodeCursor`/`toPage`/`Page` from `../common/pagination.js`.
- Produces:
  - `AdminFeedbackService.list(query: ListFeedbackQuery): Promise<Page<FeedbackSummary>>`
  - `AdminFeedbackService.get(id: string): Promise<FeedbackDetail>`
  - `AdminFeedbackService.update(reviewerId: string, id: string, body: UpdateFeedbackRequest): Promise<FeedbackDetail>`
  - `AdminFeedbackService.stats(): Promise<FeedbackStats>`
  - `AdminFeedbackController` mounted at `/admin/feedback`

- [ ] **Step 1: Write the failing integration spec**

Create `apps/api/src/feedback/admin-feedback.spec.ts`:

```ts
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtModule } from '@nestjs/jwt';
import request from 'supertest';
import { eq, inArray } from 'drizzle-orm';
import type { FeedbackPlatform, FeedbackStatus } from '@kitchen/contracts';
import { DB } from '../db/index.js';
import { feedback } from '../db/schema.js';
import { AppExceptionFilter } from '../common/errors.js';
import { AuthGuard } from '../common/auth.guard.js';
import { StaffGuard } from '../common/staff.guard.js';
import { cleanup, createTestContext, seedUser, type TestContext } from '../testing/harness.js';
import { AdminFeedbackController } from './admin-feedback.controller.js';
import { AdminFeedbackService } from './admin-feedback.service.js';

interface Row {
  rating: number;
  platform: FeedbackPlatform;
  status: FeedbackStatus;
  minutesAgo: number;
}

/** Newest first, so `rows[0]` is the most recent. */
const ROWS: Row[] = [
  { rating: 5, platform: 'ios', status: 'new', minutesAgo: 1 },
  { rating: 1, platform: 'android', status: 'new', minutesAgo: 2 },
  { rating: 3, platform: 'web', status: 'triaged', minutesAgo: 3 },
  { rating: 4, platform: 'ios', status: 'resolved', minutesAgo: 4 },
  { rating: 2, platform: 'ios', status: 'new', minutesAgo: 5 },
];

describe('admin feedback routes', () => {
  let ctx: TestContext;
  let app: INestApplication;
  let staffId: string;
  let authorId: string;
  let staffToken: string;
  let ids: string[] = [];

  beforeAll(async () => {
    ctx = createTestContext();
    staffId = await seedUser(ctx.db, undefined, 'staff');
    authorId = await seedUser(ctx.db, `author+${Date.now()}@example.com`);
    staffToken = await ctx.jwt.signAsync({ sub: staffId });

    const moduleRef = await Test.createTestingModule({
      imports: [
        JwtModule.register({
          secret: ctx.env.JWT_SECRET,
          signOptions: { expiresIn: ctx.env.JWT_ACCESS_TTL },
        }),
      ],
      controllers: [AdminFeedbackController],
      providers: [{ provide: DB, useValue: ctx.db }, AuthGuard, StaffGuard, AdminFeedbackService],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new AppExceptionFilter());
    await app.init();
  });

  afterEach(async () => {
    if (ids.length) await ctx.db.delete(feedback).where(inArray(feedback.id, ids));
    ids = [];
  });

  afterAll(async () => {
    await app?.close();
    await cleanup(ctx.db, { users: [staffId, authorId] });
    await ctx.client.end({ timeout: 5 });
  });

  /**
   * The table is global, so other suites' rows would otherwise leak into these
   * assertions. Every query below is filtered by this run's app version.
   */
  const tag = `spec-${Date.now()}`;

  async function seedRows(): Promise<void> {
    const inserted = await ctx.db
      .insert(feedback)
      .values(
        ROWS.map((row) => ({
          userId: authorId,
          rating: row.rating,
          message: `Message ${row.rating}`,
          platform: row.platform,
          appVersion: tag,
          locale: 'en' as const,
          status: row.status,
          createdAt: new Date(Date.now() - row.minutesAgo * 60 * 1000),
        })),
      )
      .returning({ id: feedback.id });
    ids = inserted.map((r) => r.id);
  }

  const get = (path: string) =>
    request(app.getHttpServer()).get(path).set('authorization', `Bearer ${staffToken}`);

  it('lists newest first', async () => {
    await seedRows();
    const res = await get(`/admin/feedback?limit=100`);

    expect(res.status).toBe(200);
    const mine = res.body.items.filter((i: { appVersion: string }) => i.appVersion === tag);
    expect(mine.map((i: { rating: number }) => i.rating)).toEqual([5, 1, 3, 4, 2]);
    expect(res.body.nextCursor).toBeDefined();
  });

  it('filters by status, rating and platform', async () => {
    await seedRows();

    const byStatus = await get(`/admin/feedback?limit=100&status=new`);
    const statuses = byStatus.body.items
      .filter((i: { appVersion: string }) => i.appVersion === tag)
      .map((i: { rating: number }) => i.rating);
    expect(statuses.sort()).toEqual([1, 2, 5]);

    const byRating = await get(`/admin/feedback?limit=100&rating=3`);
    expect(
      byRating.body.items.filter((i: { appVersion: string }) => i.appVersion === tag),
    ).toHaveLength(1);

    const byPlatform = await get(`/admin/feedback?limit=100&platform=ios`);
    expect(
      byPlatform.body.items.filter((i: { appVersion: string }) => i.appVersion === tag),
    ).toHaveLength(3);
  });

  it('pages with an opaque cursor', async () => {
    await seedRows();

    const first = await get(`/admin/feedback?limit=2&platform=ios`);
    expect(first.body.items).toHaveLength(2);
    expect(first.body.nextCursor).toBeTruthy();

    const second = await get(
      `/admin/feedback?limit=2&platform=ios&cursor=${encodeURIComponent(first.body.nextCursor)}`,
    );
    const firstIds = first.body.items.map((i: { id: string }) => i.id);
    const secondIds = second.body.items.map((i: { id: string }) => i.id);
    expect(secondIds.some((id: string) => firstIds.includes(id))).toBe(false);
  });

  it('returns the submitter with the detail view but no household data', async () => {
    await seedRows();
    const res = await get(`/admin/feedback/${ids[0]}`);

    expect(res.status).toBe(200);
    expect(res.body.submitter).toMatchObject({ id: authorId });
    expect(res.body.submitter.email).toContain('@');
    expect(res.body.submitter.joinedAt).toBeTruthy();
    expect(res.body).not.toHaveProperty('householdId');
  });

  it('404s an unknown id', async () => {
    const res = await get('/admin/feedback/00000000-0000-4000-8000-000000000000');
    expect(res.status).toBe(404);
  });

  it('400s a non-uuid id', async () => {
    const res = await get('/admin/feedback/not-a-uuid');
    expect(res.status).toBe(400);
  });

  it('stamps the reviewer and time on update', async () => {
    await seedRows();
    const before = Date.now();

    const res = await request(app.getHttpServer())
      .patch(`/admin/feedback/${ids[0]}`)
      .set('authorization', `Bearer ${staffToken}`)
      .send({ status: 'resolved', adminNote: 'Fixed in 1.3.0.' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'resolved', adminNote: 'Fixed in 1.3.0.' });

    const [row] = await ctx.db.select().from(feedback).where(eq(feedback.id, ids[0]!));
    expect(row?.reviewedBy).toBe(staffId);
    expect(row?.reviewedAt?.getTime()).toBeGreaterThanOrEqual(before - 1000);
  });

  it('allows any status transition, including back to new', async () => {
    await seedRows();
    const patch = (status: string) =>
      request(app.getHttpServer())
        .patch(`/admin/feedback/${ids[3]}`)
        .set('authorization', `Bearer ${staffToken}`)
        .send({ status });

    expect((await patch('wont_fix')).status).toBe(200);
    const back = await patch('new');
    expect(back.status).toBe(200);
    expect(back.body.status).toBe('new');
  });

  it('rejects an empty patch', async () => {
    await seedRows();
    const res = await request(app.getHttpServer())
      .patch(`/admin/feedback/${ids[0]}`)
      .set('authorization', `Bearer ${staffToken}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it('reports totals, average and breakdowns', async () => {
    await seedRows();
    const res = await get('/admin/feedback/stats');

    expect(res.status).toBe(200);
    expect(res.body.total).toBeGreaterThanOrEqual(5);
    expect(res.body.averageRating).toBeGreaterThan(0);
    // Every status key is present even at zero, so the console never renders a gap.
    expect(Object.keys(res.body.byStatus).sort()).toEqual(['new', 'resolved', 'triaged', 'wont_fix']);
    expect(Object.keys(res.body.byRating).sort()).toEqual(['1', '2', '3', '4', '5']);
  });

  it('matches /admin/feedback/stats as the literal route, not as an id', async () => {
    const res = await get('/admin/feedback/stats');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('total');
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter @kitchen/api exec vitest run src/feedback/admin-feedback.spec.ts`
Expected: FAIL — cannot resolve `./admin-feedback.controller.js`.

- [ ] **Step 3: Write the admin service**

Create `apps/api/src/feedback/admin-feedback.service.ts`:

```ts
import { Inject, Injectable } from '@nestjs/common';
import { and, avg, count, desc, eq, type SQL } from 'drizzle-orm';
import {
  feedbackStatusSchema,
  type FeedbackDetail,
  type FeedbackStats,
  type FeedbackSummary,
  type ListFeedbackQuery,
  type UpdateFeedbackRequest,
} from '@kitchen/contracts';
import { DB, type Database } from '../db/index.js';
import { feedback, users } from '../db/schema.js';
import { AppError } from '../common/errors.js';
import { decodeCursor, toPage, type Page } from '../common/pagination.js';
import { toIso, toNumber } from '../common/serialization.js';

/** Row shape shared by the list and detail queries. */
type FeedbackRow = typeof feedback.$inferSelect;

function toSummary(row: FeedbackRow): FeedbackSummary {
  return {
    id: row.id,
    rating: row.rating,
    message: row.message,
    platform: row.platform,
    appVersion: row.appVersion,
    locale: row.locale,
    status: row.status,
    createdAt: toIso(row.createdAt),
  };
}

@Injectable()
export class AdminFeedbackService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async list(query: ListFeedbackQuery): Promise<Page<FeedbackSummary>> {
    const offset = decodeCursor(query.cursor);
    const filters: SQL[] = [];
    if (query.status) filters.push(eq(feedback.status, query.status));
    if (query.rating !== undefined) filters.push(eq(feedback.rating, query.rating));
    if (query.platform) filters.push(eq(feedback.platform, query.platform));

    const rows = await this.db
      .select()
      .from(feedback)
      .where(filters.length ? and(...filters) : undefined)
      // `id` breaks ties so two rows written in the same millisecond cannot
      // swap places between pages and drop a row from the result.
      .orderBy(desc(feedback.createdAt), desc(feedback.id))
      .limit(query.limit + 1)
      .offset(offset);

    return toPage(rows.map(toSummary), offset, query.limit);
  }

  async get(id: string): Promise<FeedbackDetail> {
    const [row] = await this.db
      .select({ item: feedback, submitter: users })
      .from(feedback)
      .innerJoin(users, eq(users.id, feedback.userId))
      .where(eq(feedback.id, id))
      .limit(1);

    if (!row) throw AppError.notFound();

    return {
      ...toSummary(row.item),
      adminNote: row.item.adminNote,
      reviewedAt: row.item.reviewedAt ? toIso(row.item.reviewedAt) : null,
      submitter: {
        id: row.submitter.id,
        email: row.submitter.email,
        displayName: row.submitter.displayName,
        locale: row.submitter.locale,
        joinedAt: toIso(row.submitter.createdAt),
      },
    };
  }

  /**
   * Triage is status plus an internal note. Nothing here is sent to the user —
   * there is no reply channel in v1.
   */
  async update(reviewerId: string, id: string, body: UpdateFeedbackRequest): Promise<FeedbackDetail> {
    const [updated] = await this.db
      .update(feedback)
      .set({
        ...(body.status !== undefined ? { status: body.status } : {}),
        ...(body.adminNote !== undefined ? { adminNote: body.adminNote } : {}),
        reviewedBy: reviewerId,
        reviewedAt: new Date(),
      })
      .where(eq(feedback.id, id))
      .returning({ id: feedback.id });

    if (!updated) throw AppError.notFound();

    return this.get(id);
  }

  async stats(): Promise<FeedbackStats> {
    const [totals] = await this.db
      .select({ total: count(), average: avg(feedback.rating) })
      .from(feedback);

    const statusRows = await this.db
      .select({ status: feedback.status, value: count() })
      .from(feedback)
      .groupBy(feedback.status);

    const ratingRows = await this.db
      .select({ rating: feedback.rating, value: count() })
      .from(feedback)
      .groupBy(feedback.rating);

    // Every bucket is present at zero so the console renders a stable strip
    // rather than a row of holes that shifts as feedback arrives.
    const byStatus = Object.fromEntries(
      feedbackStatusSchema.options.map((status) => [
        status,
        statusRows.find((r) => r.status === status)?.value ?? 0,
      ]),
    ) as FeedbackStats['byStatus'];

    const byRating = Object.fromEntries(
      [1, 2, 3, 4, 5].map((rating) => [
        String(rating),
        ratingRows.find((r) => r.rating === rating)?.value ?? 0,
      ]),
    );

    return {
      total: totals?.total ?? 0,
      // `avg` comes back as a numeric string, and as null on an empty table.
      averageRating: totals?.average == null ? null : Math.round(toNumber(totals.average) * 100) / 100,
      byStatus,
      byRating,
    };
  }
}
```

`avg` is exported by the installed drizzle-orm (verified) and returns a **numeric string or `null`**, which is why `stats()` routes it through `toNumber` rather than using it directly.

- [ ] **Step 4: Write the admin controller**

Create `apps/api/src/feedback/admin-feedback.controller.ts`:

```ts
import { Body, Controller, Get, Inject, Param, Patch, Query, UseGuards } from '@nestjs/common';
import {
  listFeedbackQuerySchema,
  updateFeedbackRequestSchema,
  uuidSchema,
  type FeedbackDetail,
  type FeedbackStats,
  type FeedbackSummary,
  type ListFeedbackQuery,
  type UpdateFeedbackRequest,
} from '@kitchen/contracts';
import { ZodPipe } from '../common/http.js';
import { AuthGuard } from '../common/auth.guard.js';
import { StaffGuard } from '../common/staff.guard.js';
import { CurrentUser } from '../common/current-user.decorator.js';
import type { AuthUser } from '../common/request-context.js';
import type { Page } from '../common/pagination.js';
import { AdminFeedbackService } from './admin-feedback.service.js';

/**
 * Staff-only triage surface. `StaffGuard` is the security boundary — the web
 * `AdminGate` only hides the UI. Guard order matters: `AuthGuard` must populate
 * `request.authUser` before `StaffGuard` reads the role.
 */
@Controller('admin/feedback')
@UseGuards(AuthGuard, StaffGuard)
export class AdminFeedbackController {
  constructor(@Inject(AdminFeedbackService) private readonly admin: AdminFeedbackService) {}

  // Declared before `:id` so Express does not match the literal as a param.
  @Get('stats')
  stats(): Promise<FeedbackStats> {
    return this.admin.stats();
  }

  @Get()
  list(
    @Query(new ZodPipe(listFeedbackQuerySchema)) query: ListFeedbackQuery,
  ): Promise<Page<FeedbackSummary>> {
    return this.admin.list(query);
  }

  @Get(':id')
  get(@Param('id', new ZodPipe(uuidSchema)) id: string): Promise<FeedbackDetail> {
    return this.admin.get(id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', new ZodPipe(uuidSchema)) id: string,
    @Body(new ZodPipe(updateFeedbackRequestSchema)) body: UpdateFeedbackRequest,
  ): Promise<FeedbackDetail> {
    return this.admin.update(user.userId, id, body);
  }
}
```

- [ ] **Step 5: Register both in the module**

Replace `apps/api/src/feedback/feedback.module.ts` with:

```ts
import { Module } from '@nestjs/common';
import { AdminFeedbackController } from './admin-feedback.controller.js';
import { AdminFeedbackService } from './admin-feedback.service.js';
import { FeedbackController } from './feedback.controller.js';
import { FeedbackService } from './feedback.service.js';

@Module({
  controllers: [FeedbackController, AdminFeedbackController],
  providers: [FeedbackService, AdminFeedbackService],
  exports: [FeedbackService, AdminFeedbackService],
})
export class FeedbackModule {}
```

- [ ] **Step 6: Run the spec**

Run: `pnpm --filter @kitchen/api exec vitest run src/feedback/admin-feedback.spec.ts`
Expected: PASS — all 11 tests.

- [ ] **Step 7: Verify the API**

Run: `pnpm --filter @kitchen/api exec vitest run && pnpm --filter @kitchen/api typecheck && pnpm --filter @kitchen/api lint`
Expected: all pass.

---

### Task 6: The staff sweep — a guard test that cannot be forgotten

**Files:**
- Create: `apps/api/src/testing/staff-routes.spec.ts`

**Interfaces:**
- Consumes: `routes` (Task 1), `AppModule`, `StaffGuard` (Task 3), the harness.
- Produces: nothing importable. This is the enforcement mechanism for `staff: true`.

**Why this exists:** declaring `staff: true` in the registry buys nothing on its own. This test boots the real application, walks every route the registry marks staff-only, and issues an ordinary user's token at each. A future admin route that forgets `@UseGuards(..., StaffGuard)` fails here the moment it is added — which is the whole point of putting the flag in the contract.

- [ ] **Step 1: Write the sweep**

Create `apps/api/src/testing/staff-routes.spec.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { routes, type RouteDefinition, type RouteName } from '@kitchen/contracts';
import { AppModule } from '../app.module.js';
import { DB } from '../db/index.js';
import { AppExceptionFilter } from '../common/errors.js';
import { cleanup, createTestContext, seedUser, type TestContext } from './harness.js';

const STAFF_ROUTES = Object.entries(routes).filter(
  (entry): entry is [RouteName, RouteDefinition & { staff: true }] =>
    (entry[1] as RouteDefinition).staff === true,
);

/** A concrete uuid for every `:param`, so the request reaches the guard. */
function concretePath(path: string): string {
  return path.replace(/\/:([A-Za-z0-9_]+)/g, '/00000000-0000-4000-8000-000000000000');
}

describe('staff-only routes', () => {
  let ctx: TestContext;
  let app: INestApplication;
  let plainId: string;
  let staffId: string;
  let plainToken: string;
  let staffToken: string;

  beforeAll(async () => {
    ctx = createTestContext();
    plainId = await seedUser(ctx.db);
    staffId = await seedUser(ctx.db, undefined, 'staff');
    plainToken = await ctx.jwt.signAsync({ sub: plainId });
    staffToken = await ctx.jwt.signAsync({ sub: staffId });

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DB)
      .useValue(ctx.db)
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new AppExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await cleanup(ctx.db, { users: [plainId, staffId] });
    await ctx.client.end({ timeout: 5 });
  });

  function send(route: RouteDefinition, token: string) {
    const server = app.getHttpServer();
    const path = concretePath(route.path);
    const method = route.method.toLowerCase() as 'get' | 'post' | 'patch' | 'put' | 'delete';
    const req = request(server)[method](path).set('authorization', `Bearer ${token}`);
    return route.body ? req.send({}) : req;
  }

  it('declares at least one staff route, or this suite proves nothing', () => {
    expect(STAFF_ROUTES.length).toBeGreaterThan(0);
  });

  it.each(STAFF_ROUTES)('refuses %s to an ordinary account', async (_name, route) => {
    const res = await send(route, plainToken);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it.each(STAFF_ROUTES)('refuses %s with no token at all', async (_name, route) => {
    const path = concretePath(route.path);
    const method = route.method.toLowerCase() as 'get' | 'post' | 'patch' | 'put' | 'delete';
    const res = await request(app.getHttpServer())[method](path).send();

    expect(res.status).toBe(401);
  });

  it.each(STAFF_ROUTES)('gets past authorization for %s with a staff account', async (_name, route) => {
    const res = await send(route, staffToken);

    // 404 (unknown id) and 400 (empty PATCH body) are fine — they prove the
    // request reached the handler. 401 and 403 mean the guard rejected staff.
    expect([401, 403]).not.toContain(res.status);
  });
});
```

- [ ] **Step 2: Run it**

Run: `pnpm --filter @kitchen/api exec vitest run src/testing/staff-routes.spec.ts`
Expected: PASS. If any case fails with 403 for the staff token, the guard order in the controller is wrong (`AuthGuard` must come first).

- [ ] **Step 3: Prove the test actually catches a missing guard**

Temporarily edit `apps/api/src/feedback/admin-feedback.controller.ts` and change `@UseGuards(AuthGuard, StaffGuard)` to `@UseGuards(AuthGuard)`.

Run: `pnpm --filter @kitchen/api exec vitest run src/testing/staff-routes.spec.ts`
Expected: FAIL — the "refuses … to an ordinary account" cases now return 200/404 instead of 403.

**Then revert the change** back to `@UseGuards(AuthGuard, StaffGuard)` and re-run to confirm PASS. A guard test that would pass without the guard is worthless; this step is how you know it is not.

- [ ] **Step 4: Verify the whole API suite**

Run: `pnpm --filter @kitchen/api exec vitest run && pnpm --filter @kitchen/api typecheck && pnpm --filter @kitchen/api lint`
Expected: all pass. The API side of this feature is now complete.

---

### Task 7: Mobile feedback submission

**Files:**
- Create: `apps/mobile/src/lib/feedback.ts`
- Create: `apps/mobile/src/lib/feedback.spec.ts`
- Create: `apps/mobile/src/components/StarRating.tsx`
- Create: `apps/mobile/src/hooks/feedback.ts`
- Create: `apps/mobile/src/app/settings/feedback.tsx`
- Modify: `apps/mobile/src/components/Icon.tsx` (add two icon names)
- Modify: `apps/mobile/src/components/index.ts` (export `StarRating`)
- Modify: `apps/mobile/src/app/settings/index.tsx` (add the entry row)
- Modify: `apps/mobile/src/mocks/handlers.ts` (add the `submitFeedback` resolver)
- Modify: `packages/i18n/src/mobile.en.ts` and `packages/i18n/src/mobile.ar.ts`

**Interfaces:**
- Consumes: `submitFeedback` route + `FEEDBACK_MESSAGE_MAX` (Task 1); the live endpoint (Task 4).
- Produces:
  - `currentPlatform(): FeedbackPlatform` and `currentAppVersion(): string` from `src/lib/feedback.ts`
  - `<StarRating value={number} onChange={(n: number) => void} labelFor={(n: number) => string} />`
  - `useSubmitFeedback()` from `src/hooks/feedback.ts`
  - i18n namespace `mobile.feedback.*`

**Store-policy constraint (from the spec — do not deviate):** this star control must **never** trigger `StoreReview` / the native review prompt, not even on a 5. Apple 1.1.7 and Google's In-App Review policy both forbid gating the store prompt on sentiment. There is no `expo-store-review` import anywhere in this task.

- [ ] **Step 1: Write the failing platform/version spec**

Create `apps/mobile/src/lib/feedback.spec.ts`:

```ts
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => ({ os: 'ios' as string, version: '1.2.3' as string | undefined }));

vi.mock('react-native', () => ({ Platform: { get OS() { return mocks.os; } } }));
vi.mock('expo-constants', () => ({
  default: {
    get expoConfig() {
      return mocks.version === undefined ? null : { version: mocks.version };
    },
  },
}));

describe('currentPlatform', () => {
  beforeEach(() => {
    mocks.os = 'ios';
    mocks.version = '1.2.3';
    vi.resetModules();
  });
  afterEach(() => vi.resetModules());

  it.each([
    ['ios', 'ios'],
    ['android', 'android'],
    ['web', 'web'],
  ])('maps Platform.OS %s to %s', async (os, expected) => {
    mocks.os = os;
    const { currentPlatform } = await import('./feedback');
    expect(currentPlatform()).toBe(expected);
  });

  it('falls back to the closest supported platform for windows/macos', async () => {
    mocks.os = 'macos';
    const { currentPlatform } = await import('./feedback');
    // The contract enum has no desktop member; web is the honest bucket.
    expect(currentPlatform()).toBe('web');
  });
});

describe('currentAppVersion', () => {
  beforeEach(() => {
    mocks.os = 'ios';
    mocks.version = '1.2.3';
    vi.resetModules();
  });

  it('reads the version from the Expo config', async () => {
    const { currentAppVersion } = await import('./feedback');
    expect(currentAppVersion()).toBe('1.2.3');
  });

  it('falls back when the config is missing, so a submission is never blocked', async () => {
    mocks.version = undefined;
    const { currentAppVersion } = await import('./feedback');
    expect(currentAppVersion()).toBe('0.0.0');
  });
});
```

`vi.hoisted` + `vi.resetModules()` is the shape to use here because both helpers read their module-level dependency at call time; re-importing per case is what lets one file cover five platforms.

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter @kitchen/mobile exec vitest run src/lib/feedback.spec.ts`
Expected: FAIL — cannot resolve `./feedback`.

- [ ] **Step 3: Write the platform helpers**

Create `apps/mobile/src/lib/feedback.ts`:

```ts
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import type { FeedbackPlatform } from '@kitchen/contracts';

/**
 * Every submission is tagged with the platform and build it came from, so a
 * crop of one-star reports can be traced to a single release rather than
 * treated as a general slide in quality.
 */
export function currentPlatform(): FeedbackPlatform {
  if (Platform.OS === 'ios') return 'ios';
  if (Platform.OS === 'android') return 'android';
  return 'web';
}

export function currentAppVersion(): string {
  return Constants.expoConfig?.version ?? '0.0.0';
}
```

- [ ] **Step 4: Run the spec**

Run: `pnpm --filter @kitchen/mobile exec vitest run src/lib/feedback.spec.ts`
Expected: PASS — all 5 cases.

- [ ] **Step 5: Add the two star icons**

In `apps/mobile/src/components/Icon.tsx`, inside the `IONICONS` object, add after the `flame` line:

```ts
  star: 'star',
  starOutline: 'star-outline',
```

- [ ] **Step 6: Write the star control**

Create `apps/mobile/src/components/StarRating.tsx`:

```ts
import { Pressable, View } from 'react-native';
import { Icon } from './Icon';
import { colors, spacing } from '../theme';

export interface StarRatingProps {
  value: number;
  onChange: (value: number) => void;
  /** Returns the accessibility label for the nth star, e.g. "Rate 3 of 5". */
  labelFor: (value: number) => string;
  disabled?: boolean;
}

const STARS = [1, 2, 3, 4, 5];

/**
 * Five independent buttons rather than one slider: each is separately
 * focusable and separately labelled, which is what a screen reader needs.
 *
 * `flexDirection: 'row'` mirrors under RTL automatically, so in Arabic the
 * one-star sits on the right — the direction the eye scans from.
 */
export function StarRating({ value, onChange, labelFor, disabled }: StarRatingProps) {
  return (
    <View style={{ flexDirection: 'row', gap: spacing.xs }} accessibilityRole="radiogroup">
      {STARS.map((star) => (
        <Pressable
          key={star}
          onPress={() => onChange(star)}
          disabled={disabled}
          accessibilityRole="radio"
          accessibilityState={{ selected: value === star, disabled: Boolean(disabled) }}
          accessibilityLabel={labelFor(star)}
          // 44x44 is Apple's minimum target and Android's 48dp rounds into it.
          style={{
            minWidth: 44,
            minHeight: 44,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon
            name={star <= value ? 'star' : 'starOutline'}
            size={30}
            color={star <= value ? colors.primary : colors.textMuted}
          />
        </Pressable>
      ))}
    </View>
  );
}
```

Then add to `apps/mobile/src/components/index.ts`, keeping the alphabetical order (after the `Sheet` export):

```ts
export { StarRating } from './StarRating';
```

- [ ] **Step 7: Write the hook**

Create `apps/mobile/src/hooks/feedback.ts`:

```ts
import { useMutation } from '@tanstack/react-query';
import type { RouteBody } from '@kitchen/contracts';
import { api } from '../lib/api';

/**
 * Deliberately not queued offline. The offline event queue exists to keep the
 * inventory ledger summing; a rating replayed hours later against a build the
 * user has already updated past is worse than an honest "try again".
 */
export function useSubmitFeedback() {
  return useMutation({
    mutationFn: (body: RouteBody<'submitFeedback'>) => api.call('submitFeedback', { body }),
  });
}
```

- [ ] **Step 8: Add the mobile i18n keys**

In `packages/i18n/src/mobile.en.ts`, add a `feedback` block immediately after the closing `},` of the `settings` block:

```ts
    feedback: {
      title: 'Send feedback',
      entry: 'Send feedback',
      entryHint: 'Tell us what is working and what is not.',
      ratingLabel: 'How is Kitchen AI working for you?',
      star: 'Rate {value} out of 5',
      messageLabel: 'Anything you want to add? (optional)',
      messagePlaceholder: 'What went well, or what got in your way?',
      remaining: '{count} characters left',
      submit: 'Send feedback',
      successTitle: 'Thank you',
      successBody: 'We read every message. We cannot reply here, but this goes straight to the team.',
      done: 'Done',
      privacyNote: 'We receive your rating, your message, your app version and your language.',
    },
```

In `packages/i18n/src/mobile.ar.ts`, in the same position:

```ts
    feedback: {
      title: 'إرسال ملاحظات',
      entry: 'إرسال ملاحظات',
      entryHint: 'أخبرنا بما ينفع وما لا ينفع.',
      ratingLabel: 'كيف يعمل معك تطبيق Kitchen AI؟',
      star: 'قيّم {value} من ٥',
      messageLabel: 'هل تود إضافة شيء؟ (اختياري)',
      messagePlaceholder: 'ما الذي سار جيدًا، أو ما الذي أعاقك؟',
      remaining: 'بقي {count} حرفًا',
      submit: 'إرسال الملاحظات',
      successTitle: 'شكرًا لك',
      successBody: 'نقرأ كل رسالة. لا يمكننا الرد هنا، لكنها تصل إلى الفريق مباشرة.',
      done: 'تم',
      privacyNote: 'نستلم تقييمك ورسالتك وإصدار التطبيق ولغتك.',
    },
```

- [ ] **Step 9: Write the screen**

Create `apps/mobile/src/app/settings/feedback.tsx`:

```tsx
import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { FEEDBACK_MESSAGE_MAX } from '@kitchen/contracts';
import { Screen, Header, AppText, Button, Card, Field, StarRating } from '../../components';
import { useFormat } from '../../hooks/useFormat';
import { useSubmitFeedback } from '../../hooks/feedback';
import { currentAppVersion, currentPlatform } from '../../lib/feedback';
import { errorMessageKey } from '../../lib/errors';
import { colors, spacing } from '../../theme';

export default function Feedback() {
  // `useFormat` extends `useLocale`, so `locale` comes from the same call —
  // importing both would be two subscriptions to the same source.
  const { t, locale } = useFormat();
  const router = useRouter();
  const submit = useSubmitFeedback();
  const [rating, setRating] = useState(0);
  const [message, setMessage] = useState('');

  if (submit.isSuccess) {
    return (
      <Screen>
        <Header title={t('mobile.feedback.title')} onBack={() => router.back()} />
        <Card style={{ gap: spacing.md }}>
          <AppText variant="title">{t('mobile.feedback.successTitle')}</AppText>
          <AppText muted>{t('mobile.feedback.successBody')}</AppText>
        </Card>
        <Button title={t('mobile.feedback.done')} onPress={() => router.back()} />
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <Header title={t('mobile.feedback.title')} onBack={() => router.back()} />

      <View style={{ gap: spacing.sm }}>
        <AppText variant="label" muted>
          {t('mobile.feedback.ratingLabel')}
        </AppText>
        <StarRating
          value={rating}
          onChange={setRating}
          disabled={submit.isPending}
          labelFor={(value) => t('mobile.feedback.star', { value })}
        />
      </View>

      <Field
        label={t('mobile.feedback.messageLabel')}
        placeholder={t('mobile.feedback.messagePlaceholder')}
        value={message}
        onChangeText={setMessage}
        multiline
        maxLength={FEEDBACK_MESSAGE_MAX}
        hint={t('mobile.feedback.remaining', { count: FEEDBACK_MESSAGE_MAX - message.length })}
        style={{ minHeight: 120, paddingTop: spacing.md }}
      />

      <AppText variant="caption" muted>
        {t('mobile.feedback.privacyNote')}
      </AppText>

      {submit.isError ? (
        <AppText variant="caption" style={{ color: colors.danger }}>
          {t(errorMessageKey(submit.error))}
        </AppText>
      ) : null}

      <Button
        title={t('mobile.feedback.submit')}
        icon="check"
        disabled={rating === 0 || submit.isPending}
        loading={submit.isPending}
        onPress={() =>
          submit.mutate({
            rating,
            message: message.trim() ? message.trim() : undefined,
            platform: currentPlatform(),
            appVersion: currentAppVersion(),
            locale,
          })
        }
      />
    </Screen>
  );
}
```

Error text uses `colors.danger` from the theme, never a hex literal — mobile has no hex guard test, but the token is the only value that stays correct if the palette moves again.

- [ ] **Step 10: Add the settings entry row**

In `apps/mobile/src/app/settings/index.tsx`, add `ListRow` to the components import, and insert this block immediately before the "About" `View`:

```tsx
      <ListRow
        title={t('mobile.feedback.entry')}
        subtitle={t('mobile.feedback.entryHint')}
        showChevron
        onPress={() => router.push('/settings/feedback')}
      />
```

- [ ] **Step 11: Add the MSW resolver**

In `apps/mobile/src/mocks/handlers.ts`, add to the `resolvers` map (place it after the `rotateInviteCode` resolver so it sits with the other user-scoped routes):

```ts
  submitFeedback: () =>
    HttpResponse.json({ id: crypto.randomUUID(), createdAt: new Date().toISOString() }, { status: 201 }),
```

If `crypto.randomUUID` is not already used in this file, check how other resolvers mint ids and match them — grep for `randomUUID` first and reuse the existing helper rather than introducing a second one.

- [ ] **Step 12: Run the mobile suite**

Run: `pnpm --filter @kitchen/i18n build && pnpm --filter @kitchen/mobile exec vitest run`
Expected: PASS — including `src/mocks/coverage.spec.ts`, which would fail if the screen called `submitFeedback` with no resolver.

- [ ] **Step 13: Verify types, lint and the RTL guard**

Run: `pnpm --filter @kitchen/mobile typecheck && pnpm --filter @kitchen/mobile lint`
Expected: PASS. The lint rule rejects `marginLeft`/`left`/`borderRightColor`-style keys — `StarRating` uses only `flexDirection` and `gap`, which mirror on their own.

---

### Task 8: Web feedback submission

**Files:**
- Create: `apps/web/src/lib/app-version.ts`
- Create: `apps/web/src/components/ui/StarRating.tsx`
- Create: `apps/web/src/components/settings/FeedbackForm.tsx`
- Create: `apps/web/src/components/settings/FeedbackForm.test.tsx`
- Create: `apps/web/src/app/(app)/settings/feedback/page.tsx`
- Create: `apps/web/src/hooks/feedback.ts`
- Modify: `apps/web/src/components/settings/SettingsView.tsx` (entry link)
- Modify: `apps/web/src/mocks/handlers.ts` and `apps/web/src/mocks/db.ts`
- Modify: `packages/i18n/src/web.en.ts` and `packages/i18n/src/web.ar.ts`

**Interfaces:**
- Consumes: `submitFeedback` route + `FEEDBACK_MESSAGE_MAX` (Task 1); the endpoint (Task 4).
- Produces:
  - `APP_VERSION: string` from `src/lib/app-version.ts`
  - `<StarRating value onChange labelFor legend />` from `components/ui/StarRating.tsx`
  - `useSubmitFeedback()` from `src/hooks/feedback.ts`
  - `db.feedback: FeedbackDetail[]` in the web mock store (consumed by Task 9)
  - i18n namespace `web.feedback.*`

**Guard-test constraints:** no hex literals (only `app/layout.tsx` and `components/auth/OAuthButtons.tsx` are allow-listed), no bare `text-primary` on text (use `text-primary-text`), no opacity tints like `bg-primary/8` (use a `*-soft` token), and no physical-direction utilities (`ms/me`, `ps/pe`, `text-start`).

- [ ] **Step 1: Write the app version module**

Create `apps/web/src/lib/app-version.ts`:

```ts
/**
 * Web has no Expo config to read a version from. `NEXT_PUBLIC_APP_VERSION` is
 * injected at build time by CI; the fallback keeps local development and the
 * mock-only mode submitting rather than failing validation.
 */
export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? '0.0.0-dev';
```

- [ ] **Step 2: Write the failing form test**

Create `apps/web/src/components/settings/FeedbackForm.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiError } from '@kitchen/api-client';
import { FEEDBACK_MESSAGE_MAX } from '@kitchen/contracts';
import { LocaleProvider } from '../../lib/locale';
import { FeedbackForm } from './FeedbackForm';

const { call } = vi.hoisted(() => ({ call: vi.fn() }));

vi.mock('../../lib/api', () => ({ api: { call } }));
vi.mock('../../mocks/provider', () => ({ useMocksReady: () => true }));

function renderForm(locale: 'en' | 'ar' = 'en') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <LocaleProvider locale={locale}>
        <FeedbackForm />
      </LocaleProvider>
    </QueryClientProvider>,
  );
}

describe('FeedbackForm', () => {
  beforeEach(() => call.mockReset());

  it('cannot be submitted without a rating', async () => {
    renderForm();
    expect(screen.getByRole('button', { name: /send feedback/i })).toBeDisabled();
  });

  it('sends the rating, platform, version and locale', async () => {
    call.mockResolvedValue({ id: 'f1', createdAt: new Date().toISOString() });
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByRole('radio', { name: /4 out of 5/i }));
    await user.click(screen.getByRole('button', { name: /send feedback/i }));

    await waitFor(() => expect(call).toHaveBeenCalledTimes(1));
    expect(call.mock.calls[0][0]).toBe('submitFeedback');
    expect(call.mock.calls[0][1].body).toMatchObject({
      rating: 4,
      platform: 'web',
      locale: 'en',
    });
    // An empty textarea must not become an empty string in the payload.
    expect(call.mock.calls[0][1].body.message).toBeUndefined();
  });

  it('sends a trimmed message when one is written', async () => {
    call.mockResolvedValue({ id: 'f1', createdAt: new Date().toISOString() });
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByRole('radio', { name: /5 out of 5/i }));
    await user.type(screen.getByRole('textbox'), '  scanning is slow  ');
    await user.click(screen.getByRole('button', { name: /send feedback/i }));

    await waitFor(() => expect(call).toHaveBeenCalled());
    expect(call.mock.calls[0][1].body.message).toBe('scanning is slow');
  });

  it('caps the message at the contract limit', async () => {
    renderForm();
    expect(screen.getByRole('textbox')).toHaveAttribute('maxlength', String(FEEDBACK_MESSAGE_MAX));
  });

  it('shows a thank-you instead of the form once accepted', async () => {
    call.mockResolvedValue({ id: 'f1', createdAt: new Date().toISOString() });
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByRole('radio', { name: /3 out of 5/i }));
    await user.click(screen.getByRole('button', { name: /send feedback/i }));

    await waitFor(() => expect(screen.getByText(/thank you/i)).toBeInTheDocument());
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('renders the localized error key when the server rejects', async () => {
    call.mockRejectedValue(
      new ApiError(429, { code: 'RATE_LIMITED', messageKey: 'errors.feedbackRateLimited' }),
    );
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByRole('radio', { name: /2 out of 5/i }));
    await user.click(screen.getByRole('button', { name: /send feedback/i }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    // A real ApiError, not a plain object: `resolveErrorKey` matches on
    // `instanceof`, so a fake would silently fall through to INTERNAL_ERROR and
    // the test would pass while proving nothing about the key.
    expect(screen.getByRole('alert').textContent).not.toContain('errors.');
    // Still on the form, so the user can try again tomorrow without losing text.
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('labels every star in Arabic too', async () => {
    renderForm('ar');
    expect(screen.getAllByRole('radio')).toHaveLength(5);
  });

  /**
   * The spec calls out keyboard operability by name. A row of clickable spans
   * would pass every other test in this file and fail this one, which is the
   * entire reason the control is a real radiogroup.
   */
  it('is operable by keyboard alone', async () => {
    call.mockResolvedValue({ id: 'f1', createdAt: new Date().toISOString() });
    const user = userEvent.setup();
    renderForm();

    await user.tab();
    expect(screen.getByRole('radio', { name: /1 out of 5/i })).toHaveFocus();

    await user.keyboard('{ArrowRight}{ArrowRight}');
    expect(screen.getByRole('radio', { name: /3 out of 5/i })).toBeChecked();
  });
});
```

- [ ] **Step 3: Run it and watch it fail**

Run: `pnpm --filter @kitchen/web exec vitest run src/components/settings/FeedbackForm.test.tsx`
Expected: FAIL — cannot resolve `./FeedbackForm`.

- [ ] **Step 4: Add the web i18n keys**

In `packages/i18n/src/web.en.ts`, add a `feedback` block immediately after the closing `},` of the `settings` block:

```ts
    feedback: {
      title: 'Send feedback',
      entry: 'Send feedback',
      entryHint: 'Tell us what is working and what is not.',
      ratingLabel: 'How is Kitchen AI working for you?',
      star: 'Rate {value} out of 5',
      messageLabel: 'Anything you want to add? (optional)',
      messagePlaceholder: 'What went well, or what got in your way?',
      remaining: '{count} characters left',
      submit: 'Send feedback',
      successTitle: 'Thank you',
      successBody: 'We read every message. We cannot reply here, but this goes straight to the team.',
      another: 'Send more feedback',
      privacyNote: 'We receive your rating, your message, your app version and your language.',
    },
```

In `packages/i18n/src/web.ar.ts`, in the same position:

```ts
    feedback: {
      title: 'إرسال ملاحظات',
      entry: 'إرسال ملاحظات',
      entryHint: 'أخبرنا بما ينفع وما لا ينفع.',
      ratingLabel: 'كيف يعمل معك تطبيق Kitchen AI؟',
      star: 'قيّم {value} من ٥',
      messageLabel: 'هل تود إضافة شيء؟ (اختياري)',
      messagePlaceholder: 'ما الذي سار جيدًا، أو ما الذي أعاقك؟',
      remaining: 'بقي {count} حرفًا',
      submit: 'إرسال الملاحظات',
      successTitle: 'شكرًا لك',
      successBody: 'نقرأ كل رسالة. لا يمكننا الرد هنا، لكنها تصل إلى الفريق مباشرة.',
      another: 'إرسال ملاحظات أخرى',
      privacyNote: 'نستلم تقييمك ورسالتك وإصدار التطبيق ولغتك.',
    },
```

- [ ] **Step 5: Write the star control**

Create `apps/web/src/components/ui/StarRating.tsx`:

```tsx
'use client';

import { cn } from '../../lib/cn';

export interface StarRatingProps {
  value: number;
  onChange: (value: number) => void;
  /** Accessible label for the nth star, e.g. "Rate 3 out of 5". */
  labelFor: (value: number) => string;
  legend: string;
  disabled?: boolean;
}

const STARS = [1, 2, 3, 4, 5];

/**
 * A real radiogroup of five inputs rather than a click-tracked row of glyphs:
 * keyboard users get arrow-key selection for free, and every option is
 * separately announced.
 *
 * The glyph is a text character, not an icon font, so it inherits `currentColor`
 * and needs no new asset. `flex` mirrors under RTL on its own.
 */
export function StarRating({ value, onChange, labelFor, legend, disabled }: StarRatingProps) {
  return (
    <fieldset className="flex flex-col gap-2" disabled={disabled}>
      <legend className="text-sm font-medium text-foreground">{legend}</legend>
      <div className="flex gap-1">
        {STARS.map((star) => (
          <label
            key={star}
            className={cn(
              'flex h-11 w-11 cursor-pointer items-center justify-center rounded text-2xl leading-none transition',
              'focus-within:outline-none focus-within:ring-2 focus-within:ring-primary',
              star <= value ? 'text-primary-text' : 'text-muted-foreground',
              disabled && 'cursor-not-allowed opacity-60',
            )}
          >
            <input
              type="radio"
              name="feedback-rating"
              value={star}
              checked={value === star}
              onChange={() => onChange(star)}
              aria-label={labelFor(star)}
              className="sr-only"
            />
            <span aria-hidden="true">{star <= value ? '\u2605' : '\u2606'}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
```

Note `text-primary-text` rather than `text-primary` — `token-usage.test.ts` rejects the latter on text.

- [ ] **Step 6: Write the hook**

Create `apps/web/src/hooks/feedback.ts`:

```ts
import { useMutation } from '@tanstack/react-query';
import type { RouteBody } from '@kitchen/contracts';
import { api } from '../lib/api';

export function useSubmitFeedback() {
  return useMutation({
    mutationFn: (body: RouteBody<'submitFeedback'>) => api.call('submitFeedback', { body }),
  });
}
```

- [ ] **Step 7: Write the form**

Create `apps/web/src/components/settings/FeedbackForm.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { FEEDBACK_MESSAGE_MAX } from '@kitchen/contracts';
import { translateErrorKey } from '@kitchen/i18n';
import { useLocale } from '../../lib/locale';
import { resolveErrorKey } from '../../lib/errors';
import { APP_VERSION } from '../../lib/app-version';
import { useSubmitFeedback } from '../../hooks/feedback';
import { Card, CardHeader, CardTitle } from '../ui/Card';
import { Button } from '../ui/Button';
import { StarRating } from '../ui/StarRating';

export function FeedbackForm() {
  const { t, locale } = useLocale();
  const submit = useSubmitFeedback();
  const [rating, setRating] = useState(0);
  const [message, setMessage] = useState('');

  if (submit.isSuccess) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('web.feedback.successTitle')}</CardTitle>
        </CardHeader>
        <p className="text-sm text-muted-foreground">{t('web.feedback.successBody')}</p>
        <Button
          variant="secondary"
          className="mt-4"
          onClick={() => {
            setRating(0);
            setMessage('');
            submit.reset();
          }}
        >
          {t('web.feedback.another')}
        </Button>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col gap-5">
      <CardHeader>
        <CardTitle>{t('web.feedback.title')}</CardTitle>
      </CardHeader>

      <StarRating
        value={rating}
        onChange={setRating}
        disabled={submit.isPending}
        legend={t('web.feedback.ratingLabel')}
        labelFor={(value) => t('web.feedback.star', { value })}
      />

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-foreground">{t('web.feedback.messageLabel')}</span>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={FEEDBACK_MESSAGE_MAX}
          rows={5}
          placeholder={t('web.feedback.messagePlaceholder')}
          disabled={submit.isPending}
          className="w-full rounded border border-border bg-background p-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        />
        <span className="text-xs text-muted-foreground">
          {t('web.feedback.remaining', { count: FEEDBACK_MESSAGE_MAX - message.length })}
        </span>
      </label>

      <p className="text-xs text-muted-foreground">{t('web.feedback.privacyNote')}</p>

      {submit.isError ? (
        <p role="alert" className="text-sm text-danger">
          {translateErrorKey(locale, resolveErrorKey(submit.error))}
        </p>
      ) : null}

      <div>
        <Button
          disabled={rating === 0 || submit.isPending}
          onClick={() =>
            submit.mutate({
              rating,
              message: message.trim() ? message.trim() : undefined,
              platform: 'web',
              appVersion: APP_VERSION,
              locale,
            })
          }
        >
          {t('web.feedback.submit')}
        </Button>
      </div>
    </Card>
  );
}
```

- [ ] **Step 8: Run the form test**

Run: `pnpm --filter @kitchen/i18n build && pnpm --filter @kitchen/web exec vitest run src/components/settings/FeedbackForm.test.tsx`
Expected: PASS — all 8 cases.

- [ ] **Step 9: Add the page and the settings link**

Create `apps/web/src/app/(app)/settings/feedback/page.tsx`:

```tsx
import { FeedbackForm } from '../../../../components/settings/FeedbackForm';

export default function FeedbackPage() {
  return (
    <div className="mx-auto w-full max-w-2xl">
      <FeedbackForm />
    </div>
  );
}
```

In `apps/web/src/components/settings/SettingsView.tsx`, add these imports at the top:

```tsx
import Link from 'next/link';
import { buttonClasses } from '../ui/Button';
```

and add this card at the end of the outer `<div className="...">`, immediately before its closing `</div>`:

```tsx
      <Card>
        <CardHeader>
          <CardTitle>{t('web.feedback.entry')}</CardTitle>
        </CardHeader>
        <p className="text-sm text-muted-foreground">{t('web.feedback.entryHint')}</p>
        <Link href="/settings/feedback" className={buttonClasses({ className: 'mt-4' })}>
          {t('web.feedback.title')}
        </Link>
      </Card>
```

`buttonClasses` is the existing link-as-button helper exported from `ui/Button.tsx` — reusing it means this link cannot drift from the real buttons, and it keeps the focus-ring and token classes correct without naming any token here.

- [ ] **Step 10: Add the mock store and handler**

In `apps/web/src/mocks/db.ts`, add `FeedbackDetail` to the type import from `@kitchen/contracts`, then add a `feedback` array to the exported `db` object (next to the other collections):

```ts
  feedback: [] as FeedbackDetail[],
```

In `apps/web/src/mocks/handlers.ts`, add to the `handlers` array:

```ts
  http.post(u('/feedback'), async ({ request }) => {
    const body = (await request.json()) as {
      rating: number;
      message?: string;
      platform: 'ios' | 'android' | 'web';
      appVersion: string;
      locale: Locale;
    };
    const record = {
      id: uuid(),
      rating: body.rating,
      message: body.message ?? null,
      platform: body.platform,
      appVersion: body.appVersion,
      locale: body.locale,
      status: 'new' as const,
      createdAt: iso(),
      adminNote: null,
      reviewedAt: null,
      submitter: {
        id: db.user.id,
        email: db.user.email,
        displayName: db.user.displayName,
        locale: db.user.locale,
        joinedAt: db.user.createdAt,
      },
    };
    db.feedback.unshift(record);
    return HttpResponse.json({ id: record.id, createdAt: record.createdAt }, { status: 201 });
  }),
```

The mock stores the full `FeedbackDetail` even though the route returns only the receipt, because Task 9's admin handlers read the same array — this is what makes the mocked admin console show feedback you just submitted.

- [ ] **Step 11: Run the web suite and the guards**

Run: `pnpm --filter @kitchen/web exec vitest run`
Expected: PASS — including `src/app/palette.test.ts` and `src/lib/token-usage.test.ts`. If `token-usage` fails, fix the component, **never the test**.

- [ ] **Step 12: Verify types and lint**

Run: `pnpm --filter @kitchen/web typecheck && pnpm --filter @kitchen/web lint`
Expected: PASS. The RTL lint rule rejects `ml-*`/`pl-*`/`text-left`; every class above uses logical properties or is direction-neutral.

---

### Task 9: Web admin console

**Files:**
- Create: `apps/web/src/lib/feedback-labels.ts`
- Create: `apps/web/src/hooks/admin.ts`
- Create: `apps/web/src/components/admin/AdminGate.tsx`
- Create: `apps/web/src/components/admin/AdminGate.test.tsx`
- Create: `apps/web/src/components/admin/FeedbackStats.tsx`
- Create: `apps/web/src/components/admin/FeedbackFilters.tsx`
- Create: `apps/web/src/components/admin/FeedbackList.tsx`
- Create: `apps/web/src/components/admin/FeedbackDetail.tsx`
- Create: `apps/web/src/components/admin/FeedbackDetail.test.tsx`
- Create: `apps/web/src/app/(admin)/layout.tsx`
- Create: `apps/web/src/app/(admin)/admin/page.tsx`
- Create: `apps/web/src/app/(admin)/admin/feedback/[id]/page.tsx`
- Modify: `apps/web/src/mocks/handlers.ts` (4 admin handlers)
- Modify: `packages/i18n/src/web.en.ts` and `packages/i18n/src/web.ar.ts`

**Interfaces:**
- Consumes: the four admin routes (Task 1), the endpoints (Task 5), `db.feedback` (Task 8).
- Produces: the `/admin` and `/admin/feedback/:id` pages, `web.admin.*` i18n keys.

**Why `(admin)` is its own route group:** `(app)/layout.tsx` wraps everything in `AuthGate` + `AppShell` — the sidebar, the pantry rail, the household switcher. None of that belongs around a triage table, and the shell's queries all send `x-household-id`, which admin routes do not use. A sibling group gets a clean layout with no shell.

**How `AdminGate` decides:** it asks the server. There is no `role` on the `User` contract and adding one would mean widening every session response for a client-side hint. Instead the gate issues `adminFeedbackStats`; a success means staff, a `FORBIDDEN` means not. This is honest about where the boundary really is — the client cannot know, so it asks the thing that does — and it warms the stats query the dashboard renders anyway.

- [ ] **Step 1: Write the failing gate test**

Create `apps/web/src/components/admin/AdminGate.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiError } from '@kitchen/api-client';
import { LocaleProvider } from '../../lib/locale';
import { AdminGate } from './AdminGate';

const { replace, call } = vi.hoisted(() => ({ replace: vi.fn(), call: vi.fn() }));

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace, push: vi.fn() }) }));
vi.mock('../../mocks/provider', () => ({ useMocksReady: () => true }));
vi.mock('../../lib/api', () => ({ api: { call } }));

function renderGate() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <LocaleProvider locale="en">
        <AdminGate>
          <p>console</p>
        </AdminGate>
      </LocaleProvider>
    </QueryClientProvider>,
  );
}

describe('AdminGate', () => {
  beforeEach(() => {
    replace.mockClear();
    call.mockReset();
  });

  it('renders the console for a staff account', async () => {
    call.mockResolvedValue({ total: 0, averageRating: null, byStatus: {}, byRating: {} });
    renderGate();

    await waitFor(() => expect(screen.getByText('console')).toBeInTheDocument());
    expect(replace).not.toHaveBeenCalled();
  });

  it('redirects a non-staff account away and never renders the console', async () => {
    call.mockRejectedValue(new ApiError(403, { code: 'FORBIDDEN', messageKey: 'errors.FORBIDDEN' }));
    renderGate();

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/'));
    expect(screen.queryByText('console')).not.toBeInTheDocument();
  });

  it('sends an unauthenticated visitor to sign-in', async () => {
    call.mockRejectedValue(
      new ApiError(401, { code: 'UNAUTHENTICATED', messageKey: 'errors.UNAUTHENTICATED' }),
    );
    renderGate();

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/sign-in'));
  });

  it('withholds the console while the check is still in flight', () => {
    call.mockReturnValue(new Promise(() => {}));
    renderGate();

    expect(screen.queryByText('console')).not.toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter @kitchen/web exec vitest run src/components/admin/AdminGate.test.tsx`
Expected: FAIL — cannot resolve `./AdminGate`.

- [ ] **Step 3: Add the admin i18n keys**

In `packages/i18n/src/web.en.ts`, add an `admin` block after the `feedback` block from Task 8:

```ts
    admin: {
      title: 'Admin',
      feedbackTitle: 'Product feedback',
      forbidden: 'You do not have access to this area.',
      total: 'Total',
      average: 'Average rating',
      noAverage: 'No ratings yet',
      filterStatus: 'Status',
      filterRating: 'Rating',
      filterPlatform: 'Platform',
      filterAll: 'All',
      loadMore: 'Load more',
      empty: 'No feedback matches these filters.',
      backToList: 'Back to feedback',
      submitter: 'Submitted by',
      joined: 'Joined {date}',
      submittedOn: 'Sent {date}',
      noMessage: 'No message — rating only.',
      context: 'App version {version} · {platform} · {locale}',
      adminNote: 'Internal note',
      adminNotePlaceholder: 'Context for the team. The submitter never sees this.',
      save: 'Save',
      saved: 'Saved',
      reviewedBy: 'Last reviewed {date}',
      neverReviewed: 'Not reviewed yet',
      status: {
        new: 'New',
        triaged: 'Triaged',
        resolved: 'Resolved',
        wont_fix: "Won't fix",
      },
      platform: {
        ios: 'iOS',
        android: 'Android',
        web: 'Web',
      },
    },
```

In `packages/i18n/src/web.ar.ts`, in the same position:

```ts
    admin: {
      title: 'الإدارة',
      feedbackTitle: 'ملاحظات المنتج',
      forbidden: 'ليس لديك صلاحية الوصول إلى هذه المنطقة.',
      total: 'الإجمالي',
      average: 'متوسط التقييم',
      noAverage: 'لا توجد تقييمات بعد',
      filterStatus: 'الحالة',
      filterRating: 'التقييم',
      filterPlatform: 'المنصة',
      filterAll: 'الكل',
      loadMore: 'تحميل المزيد',
      empty: 'لا توجد ملاحظات تطابق هذه الفلاتر.',
      backToList: 'العودة إلى الملاحظات',
      submitter: 'أرسلها',
      joined: 'انضم في {date}',
      submittedOn: 'أُرسلت في {date}',
      noMessage: 'بلا رسالة — تقييم فقط.',
      context: 'إصدار التطبيق {version} · {platform} · {locale}',
      adminNote: 'ملاحظة داخلية',
      adminNotePlaceholder: 'سياق للفريق. لا يراه المُرسِل أبدًا.',
      save: 'حفظ',
      saved: 'تم الحفظ',
      reviewedBy: 'آخر مراجعة {date}',
      neverReviewed: 'لم تُراجع بعد',
      status: {
        new: 'جديدة',
        triaged: 'مُصنّفة',
        resolved: 'مُعالجة',
        wont_fix: 'لن تُعالج',
      },
      platform: {
        ios: 'iOS',
        android: 'أندرويد',
        web: 'الويب',
      },
    },
```

- [ ] **Step 4: Write the hooks**

Create `apps/web/src/hooks/admin.ts`:

```ts
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ListFeedbackQuery, RouteBody } from '@kitchen/contracts';
import { api } from '../lib/api';
import { useMocksReady } from '../mocks/provider';

type Filters = Pick<ListFeedbackQuery, 'status' | 'rating' | 'platform'>;

export const adminKeys = {
  stats: ['admin', 'feedback', 'stats'] as const,
  list: (filters: Filters) => ['admin', 'feedback', 'list', filters] as const,
  detail: (id: string) => ['admin', 'feedback', id] as const,
};

export function useFeedbackStats() {
  const ready = useMocksReady();
  return useQuery({
    queryKey: adminKeys.stats,
    queryFn: () => api.call('adminFeedbackStats'),
    enabled: ready,
    retry: false,
  });
}

export function useFeedbackList(filters: Filters) {
  const ready = useMocksReady();
  return useInfiniteQuery({
    queryKey: adminKeys.list(filters),
    queryFn: ({ pageParam }) =>
      api.call('adminListFeedback', {
        query: { ...filters, limit: 25, cursor: pageParam ?? undefined },
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor ?? null,
    enabled: ready,
  });
}

export function useFeedbackDetail(id: string) {
  const ready = useMocksReady();
  return useQuery({
    queryKey: adminKeys.detail(id),
    queryFn: () => api.call('adminGetFeedback', { params: { id } }),
    enabled: ready && id.length > 0,
  });
}

export function useUpdateFeedback(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: RouteBody<'adminUpdateFeedback'>) =>
      api.call('adminUpdateFeedback', { params: { id }, body }),
    onSuccess: (updated) => {
      qc.setQueryData(adminKeys.detail(id), updated);
      // The list shows status badges and the strip shows per-status counts;
      // both are now stale for this row.
      void qc.invalidateQueries({ queryKey: ['admin', 'feedback', 'list'] });
      void qc.invalidateQueries({ queryKey: adminKeys.stats });
    },
  });
}
```

- [ ] **Step 5: Write the gate**

Create `apps/web/src/components/admin/AdminGate.tsx`:

```tsx
'use client';

import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError } from '@kitchen/api-client';
import { useLocale } from '../../lib/locale';
import { useFeedbackStats } from '../../hooks/admin';
import { Spinner } from '../ui/states';

/**
 * Not a security boundary — `StaffGuard` on the API is. This only decides what
 * to paint, by asking the server a question only staff can answer.
 */
export function AdminGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { t } = useLocale();
  const probe = useFeedbackStats();
  const error = probe.error;

  useEffect(() => {
    if (!(error instanceof ApiError)) return;
    if (error.code === 'UNAUTHENTICATED') router.replace('/sign-in');
    else if (error.code === 'FORBIDDEN') router.replace('/');
  }, [error, router]);

  if (probe.isSuccess) return <>{children}</>;

  return (
    <div className="flex min-h-screen items-center justify-center gap-3 text-sm text-muted-foreground">
      {probe.isError ? <p>{t('web.admin.forbidden')}</p> : <Spinner />}
    </div>
  );
}
```

- [ ] **Step 6: Run the gate test**

Run: `pnpm --filter @kitchen/i18n build && pnpm --filter @kitchen/web exec vitest run src/components/admin/AdminGate.test.tsx`
Expected: PASS — all 4 cases.

- [ ] **Step 6a: Write the shared label maps**

Four components in this task translate a `FeedbackStatus` or a `FeedbackPlatform` into an i18n key. Declaring the same map in each file is the kind of verbatim duplication that goes stale in exactly one place — so it lives once, here.

Create `apps/web/src/lib/feedback-labels.ts`:

```ts
import type { FeedbackPlatform, FeedbackStatus } from '@kitchen/contracts';
import type { MessageKey } from '@kitchen/i18n';

/**
 * `MessageKey` is a literal union, so these maps are what lets a component turn
 * a runtime enum value into a checked key. A template literal would compile only
 * by widening the key type to `string`, which would remove that check from every
 * other `t()` call in the app.
 */
export const STATUS_KEY: Record<FeedbackStatus, MessageKey> = {
  new: 'web.admin.status.new',
  triaged: 'web.admin.status.triaged',
  resolved: 'web.admin.status.resolved',
  wont_fix: 'web.admin.status.wont_fix',
};

export const PLATFORM_KEY: Record<FeedbackPlatform, MessageKey> = {
  ios: 'web.admin.platform.ios',
  android: 'web.admin.platform.android',
  web: 'web.admin.platform.web',
};
```

`MessageKey` is exported from `packages/i18n/src/index.ts` (verified) as `Paths<Messages>`.

- [ ] **Step 7: Write the stats strip**

Create `apps/web/src/components/admin/FeedbackStats.tsx`:

```tsx
'use client';

import { formatNumber } from '@kitchen/i18n';
import type { FeedbackStats as Stats } from '@kitchen/contracts';
import { useLocale } from '../../lib/locale';
import { STATUS_KEY } from '../../lib/feedback-labels';
import { Card } from '../ui/Card';

const STATUSES = ['new', 'triaged', 'resolved', 'wont_fix'] as const;

export function FeedbackStats({ stats }: { stats: Stats }) {
  const { t, locale } = useLocale();

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      <Card className="p-4">
        <p className="text-xs text-muted-foreground">{t('web.admin.total')}</p>
        <p className="text-2xl font-semibold">{formatNumber(locale, stats.total)}</p>
      </Card>
      <Card className="p-4">
        <p className="text-xs text-muted-foreground">{t('web.admin.average')}</p>
        <p className="text-2xl font-semibold">
          {stats.averageRating === null
            ? t('web.admin.noAverage')
            : formatNumber(locale, stats.averageRating)}
        </p>
      </Card>
      {STATUSES.map((status) => (
        <Card key={status} className="p-4">
          <p className="text-xs text-muted-foreground">{t(STATUS_KEY[status])}</p>
          <p className="text-2xl font-semibold">
            {formatNumber(locale, stats.byStatus[status] ?? 0)}
          </p>
        </Card>
      ))}
    </div>
  );
}
```

Every label lookup in this task goes through `STATUS_KEY`/`PLATFORM_KEY` from Step 6a rather than a template literal like `` t(`web.admin.status.${status}`) ``. `MessageKey` is a literal union, and widening it to `string` to make a template compile would silently remove key-safety from every other `t()` call site in the app.

- [ ] **Step 8: Write the filters**

Create `apps/web/src/components/admin/FeedbackFilters.tsx`:

```tsx
'use client';

import type { FeedbackPlatform, FeedbackStatus } from '@kitchen/contracts';
import { useLocale } from '../../lib/locale';
import { PLATFORM_KEY, STATUS_KEY } from '../../lib/feedback-labels';
import { Field, Select } from '../ui/Input';

export interface FeedbackFilterValue {
  status?: FeedbackStatus;
  rating?: number;
  platform?: FeedbackPlatform;
}

const STATUSES: FeedbackStatus[] = ['new', 'triaged', 'resolved', 'wont_fix'];
const PLATFORMS: FeedbackPlatform[] = ['ios', 'android', 'web'];
const RATINGS = [1, 2, 3, 4, 5];

export function FeedbackFilters({
  value,
  onChange,
}: {
  value: FeedbackFilterValue;
  onChange: (next: FeedbackFilterValue) => void;
}) {
  const { t } = useLocale();

  return (
    <div className="flex flex-wrap gap-4">
      <Field label={t('web.admin.filterStatus')} htmlFor="filter-status">
        <Select
          id="filter-status"
          value={value.status ?? ''}
          onChange={(e) =>
            onChange({ ...value, status: (e.target.value || undefined) as FeedbackStatus | undefined })
          }
        >
          <option value="">{t('web.admin.filterAll')}</option>
          {STATUSES.map((status) => (
            <option key={status} value={status}>
              {t(STATUS_KEY[status])}
            </option>
          ))}
        </Select>
      </Field>

      <Field label={t('web.admin.filterRating')} htmlFor="filter-rating">
        <Select
          id="filter-rating"
          value={value.rating ?? ''}
          onChange={(e) =>
            onChange({ ...value, rating: e.target.value ? Number(e.target.value) : undefined })
          }
        >
          <option value="">{t('web.admin.filterAll')}</option>
          {RATINGS.map((rating) => (
            <option key={rating} value={rating}>
              {rating}
            </option>
          ))}
        </Select>
      </Field>

      <Field label={t('web.admin.filterPlatform')} htmlFor="filter-platform">
        <Select
          id="filter-platform"
          value={value.platform ?? ''}
          onChange={(e) =>
            onChange({
              ...value,
              platform: (e.target.value || undefined) as FeedbackPlatform | undefined,
            })
          }
        >
          <option value="">{t('web.admin.filterAll')}</option>
          {PLATFORMS.map((platform) => (
            <option key={platform} value={platform}>
              {t(PLATFORM_KEY[platform])}
            </option>
          ))}
        </Select>
      </Field>
    </div>
  );
}
```

- [ ] **Step 9: Write the list**

Create `apps/web/src/components/admin/FeedbackList.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { formatNumber } from '@kitchen/i18n';
import type { FeedbackStatus, FeedbackSummary } from '@kitchen/contracts';
import { useLocale } from '../../lib/locale';
import { STATUS_KEY } from '../../lib/feedback-labels';
import { Badge } from '../ui/Badge';
import { Card } from '../ui/Card';
import { EmptyState } from '../ui/states';

const STATUS_TONE: Record<FeedbackStatus, 'info' | 'warning' | 'success' | 'neutral'> = {
  new: 'info',
  triaged: 'warning',
  resolved: 'success',
  wont_fix: 'neutral',
};

export function FeedbackList({ items }: { items: FeedbackSummary[] }) {
  const { t, locale } = useLocale();

  if (items.length === 0) return <EmptyState title={t('web.admin.empty')} />;

  return (
    <ul className="flex flex-col gap-2">
      {items.map((item) => (
        <li key={item.id}>
          <Link href={`/admin/feedback/${item.id}`} className="block">
            <Card className="p-4 transition hover:bg-muted">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  <span className="text-lg" aria-hidden="true">
                    {'\u2605'.repeat(item.rating)}
                  </span>
                  <span className="sr-only">{formatNumber(locale, item.rating)}</span>
                  <Badge tone={STATUS_TONE[item.status]}>{t(STATUS_KEY[item.status])}</Badge>
                </div>
                <span className="text-xs text-muted-foreground">
                  {new Date(item.createdAt).toLocaleDateString(locale)}
                </span>
              </div>
              <p className="mt-2 line-clamp-2 text-sm text-foreground">
                {item.message ?? t('web.admin.noMessage')}
              </p>
            </Card>
          </Link>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 10: Write the failing detail test**

Create `apps/web/src/components/admin/FeedbackDetail.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { FeedbackDetail as Detail } from '@kitchen/contracts';
import { LocaleProvider } from '../../lib/locale';
import { FeedbackDetail } from './FeedbackDetail';

const { call } = vi.hoisted(() => ({ call: vi.fn() }));

vi.mock('../../lib/api', () => ({ api: { call } }));
vi.mock('../../mocks/provider', () => ({ useMocksReady: () => true }));

const DETAIL: Detail = {
  id: 'f1',
  rating: 2,
  message: 'The barcode scanner misses most local products.',
  platform: 'ios',
  appVersion: '1.2.3',
  locale: 'en',
  status: 'new',
  createdAt: '2026-08-01T10:00:00.000Z',
  adminNote: null,
  reviewedAt: null,
  submitter: {
    id: 'u1',
    email: 'person@example.com',
    displayName: 'Person',
    locale: 'en',
    joinedAt: '2026-01-01T00:00:00.000Z',
  },
};

function renderDetail() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <LocaleProvider locale="en">
        <FeedbackDetail id="f1" />
      </LocaleProvider>
    </QueryClientProvider>,
  );
}

describe('FeedbackDetail', () => {
  beforeEach(() => call.mockReset());

  it('shows the message, the context line and the submitter', async () => {
    call.mockResolvedValue(DETAIL);
    renderDetail();

    await waitFor(() => expect(screen.getByText(DETAIL.message!)).toBeInTheDocument());
    expect(screen.getByText(/person@example\.com/)).toBeInTheDocument();
    expect(screen.getByText(/1\.2\.3/)).toBeInTheDocument();
  });

  it('saves a status change and an internal note together', async () => {
    call.mockImplementation((name: string) =>
      name === 'adminGetFeedback'
        ? Promise.resolve(DETAIL)
        : Promise.resolve({ ...DETAIL, status: 'resolved', adminNote: 'Fixed in 1.3.0.' }),
    );
    const user = userEvent.setup();
    renderDetail();

    await waitFor(() => expect(screen.getByRole('combobox')).toBeInTheDocument());
    await user.selectOptions(screen.getByRole('combobox'), 'resolved');
    await user.type(screen.getByRole('textbox'), 'Fixed in 1.3.0.');
    await user.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() =>
      expect(call).toHaveBeenCalledWith('adminUpdateFeedback', {
        params: { id: 'f1' },
        body: { status: 'resolved', adminNote: 'Fixed in 1.3.0.' },
      }),
    );
  });

  it('renders a rating-only submission without pretending there is a message', async () => {
    call.mockResolvedValue({ ...DETAIL, message: null });
    renderDetail();

    await waitFor(() => expect(screen.getByText(/rating only/i)).toBeInTheDocument());
  });

  it('never renders a reply control — there is no reply channel', async () => {
    call.mockResolvedValue(DETAIL);
    renderDetail();

    await waitFor(() => expect(screen.getByText(DETAIL.message!)).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /reply/i })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 11: Run it and watch it fail**

Run: `pnpm --filter @kitchen/web exec vitest run src/components/admin/FeedbackDetail.test.tsx`
Expected: FAIL — cannot resolve `./FeedbackDetail`.

- [ ] **Step 12: Write the detail view**

Create `apps/web/src/components/admin/FeedbackDetail.tsx`:

```tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { FeedbackStatus } from '@kitchen/contracts';
import { useLocale } from '../../lib/locale';
import { PLATFORM_KEY, STATUS_KEY } from '../../lib/feedback-labels';
import { useFeedbackDetail, useUpdateFeedback } from '../../hooks/admin';
import { Card, CardHeader, CardTitle } from '../ui/Card';
import { Button } from '../ui/Button';
import { Field, Select } from '../ui/Input';
import { LoadingState, ErrorState } from '../ui/states';

const STATUSES: FeedbackStatus[] = ['new', 'triaged', 'resolved', 'wont_fix'];

export function FeedbackDetail({ id }: { id: string }) {
  const { t, locale } = useLocale();
  const query = useFeedbackDetail(id);
  const update = useUpdateFeedback(id);
  const [status, setStatus] = useState<FeedbackStatus | null>(null);
  const [note, setNote] = useState<string | null>(null);

  if (query.isLoading) return <LoadingState />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  if (!query.data) return null;

  const item = query.data;
  const draftStatus = status ?? item.status;
  const draftNote = note ?? item.adminNote ?? '';
  const dirty = draftStatus !== item.status || draftNote !== (item.adminNote ?? '');

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <Link href="/admin" className="text-sm text-primary-text hover:underline">
        {t('web.admin.backToList')}
      </Link>

      <Card className="flex flex-col gap-3">
        <CardHeader>
          <CardTitle>
            <span aria-hidden="true">{'\u2605'.repeat(item.rating)}</span>
            <span className="sr-only">{item.rating}</span>
          </CardTitle>
          <span className="text-xs text-muted-foreground">
            {t('web.admin.submittedOn', { date: new Date(item.createdAt).toLocaleString(locale) })}
          </span>
        </CardHeader>

        <p className="whitespace-pre-wrap text-sm text-foreground">
          {item.message ?? t('web.admin.noMessage')}
        </p>

        <p className="text-xs text-muted-foreground">
          {t('web.admin.context', {
            version: item.appVersion,
            platform: t(PLATFORM_KEY[item.platform]),
            locale: item.locale,
          })}
        </p>
      </Card>

      <Card className="flex flex-col gap-2">
        <CardHeader>
          <CardTitle>{t('web.admin.submitter')}</CardTitle>
        </CardHeader>
        <p className="text-sm text-foreground">{item.submitter.displayName}</p>
        <p className="text-sm text-muted-foreground">{item.submitter.email}</p>
        <p className="text-xs text-muted-foreground">
          {t('web.admin.joined', { date: new Date(item.submitter.joinedAt).toLocaleDateString(locale) })}
        </p>
      </Card>

      <Card className="flex flex-col gap-4">
        <Field label={t('web.admin.filterStatus')} htmlFor="detail-status">
          <Select
            id="detail-status"
            value={draftStatus}
            onChange={(e) => setStatus(e.target.value as FeedbackStatus)}
          >
            {STATUSES.map((option) => (
              <option key={option} value={option}>
                {t(STATUS_KEY[option])}
              </option>
            ))}
          </Select>
        </Field>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-foreground">{t('web.admin.adminNote')}</span>
          <textarea
            value={draftNote}
            onChange={(e) => setNote(e.target.value)}
            rows={4}
            placeholder={t('web.admin.adminNotePlaceholder')}
            className="w-full rounded border border-border bg-background p-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          />
        </label>

        <p className="text-xs text-muted-foreground">
          {item.reviewedAt
            ? t('web.admin.reviewedBy', { date: new Date(item.reviewedAt).toLocaleString(locale) })
            : t('web.admin.neverReviewed')}
        </p>

        <div className="flex items-center gap-3">
          <Button
            disabled={!dirty || update.isPending}
            onClick={() => update.mutate({ status: draftStatus, adminNote: draftNote })}
          >
            {t('web.admin.save')}
          </Button>
          {update.isSuccess && !dirty ? (
            <span className="text-sm text-success">{t('web.admin.saved')}</span>
          ) : null}
        </div>
      </Card>
    </div>
  );
}
```

- [ ] **Step 13: Run the detail test**

Run: `pnpm --filter @kitchen/web exec vitest run src/components/admin/FeedbackDetail.test.tsx`
Expected: PASS — all 4 cases.

- [ ] **Step 14: Write the route group**

Create `apps/web/src/app/(admin)/layout.tsx`:

```tsx
import type { ReactNode } from 'react';
import { AdminGate } from '../../components/admin/AdminGate';

/**
 * Deliberately outside `(app)` — no `AppShell`, no pantry rail, no household
 * switcher. Admin routes are not household-scoped.
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <AdminGate>
      <div className="min-h-screen bg-background p-6">{children}</div>
    </AdminGate>
  );
}
```

Create `apps/web/src/app/(admin)/admin/page.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useLocale } from '../../../lib/locale';
import { useFeedbackList, useFeedbackStats } from '../../../hooks/admin';
import { FeedbackFilters, type FeedbackFilterValue } from '../../../components/admin/FeedbackFilters';
import { FeedbackList } from '../../../components/admin/FeedbackList';
import { FeedbackStats } from '../../../components/admin/FeedbackStats';
import { Button } from '../../../components/ui/Button';
import { LoadingState, ErrorState } from '../../../components/ui/states';

export default function AdminPage() {
  const { t } = useLocale();
  const [filters, setFilters] = useState<FeedbackFilterValue>({});
  const stats = useFeedbackStats();
  const list = useFeedbackList(filters);

  const items = list.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-heading-sm">{t('web.admin.feedbackTitle')}</h1>

      {stats.data ? <FeedbackStats stats={stats.data} /> : null}

      <FeedbackFilters value={filters} onChange={setFilters} />

      {list.isLoading ? <LoadingState /> : null}
      {list.isError ? <ErrorState error={list.error} onRetry={() => void list.refetch()} /> : null}
      {list.isSuccess ? <FeedbackList items={items} /> : null}

      {list.hasNextPage ? (
        <div>
          <Button
            variant="secondary"
            disabled={list.isFetchingNextPage}
            onClick={() => void list.fetchNextPage()}
          >
            {t('web.admin.loadMore')}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
```

Create `apps/web/src/app/(admin)/admin/feedback/[id]/page.tsx`:

```tsx
import { FeedbackDetail } from '../../../../../components/admin/FeedbackDetail';

export default async function AdminFeedbackDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <FeedbackDetail id={id} />;
}
```

`params` is a `Promise` in this Next version — this matches `app/(app)/recipes/[id]/page.tsx` exactly (verified).

- [ ] **Step 15: Add the four MSW handlers**

In `apps/web/src/mocks/handlers.ts`, add to the `handlers` array. Note that `/admin/feedback/stats` is registered **before** `/admin/feedback/:id`, mirroring the controller:

```ts
  http.get(u('/admin/feedback/stats'), () => {
    const all = db.feedback;
    const byStatus = { new: 0, triaged: 0, resolved: 0, wont_fix: 0 };
    const byRating: Record<string, number> = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };
    for (const item of all) {
      byStatus[item.status] += 1;
      byRating[String(item.rating)] = (byRating[String(item.rating)] ?? 0) + 1;
    }
    const total = all.length;
    const averageRating =
      total === 0
        ? null
        : Math.round((all.reduce((sum, i) => sum + i.rating, 0) / total) * 100) / 100;
    return HttpResponse.json({ total, averageRating, byStatus, byRating });
  }),

  http.get(u('/admin/feedback'), ({ request }) => {
    const params = new URL(request.url).searchParams;
    const status = params.get('status');
    const rating = params.get('rating');
    const platform = params.get('platform');
    const limit = Number(params.get('limit') ?? 50);
    const cursor = params.get('cursor');
    const offset = cursor ? Number(decodeMockCursor(cursor)) : 0;

    const filtered = db.feedback.filter(
      (item) =>
        (!status || item.status === status) &&
        (!rating || item.rating === Number(rating)) &&
        (!platform || item.platform === platform),
    );
    const page = filtered.slice(offset, offset + limit);
    const nextCursor = offset + limit < filtered.length ? encodeMockCursor(offset + limit) : null;

    return HttpResponse.json({
      items: page.map(({ submitter: _submitter, adminNote: _note, reviewedAt: _at, ...rest }) => rest),
      nextCursor,
    });
  }),

  http.get(u('/admin/feedback/:id'), ({ params }) => {
    const item = db.feedback.find((f) => f.id === params.id);
    return item ? HttpResponse.json(item) : err('NOT_FOUND', 404);
  }),

  http.patch(u('/admin/feedback/:id'), async ({ params, request }) => {
    const item = db.feedback.find((f) => f.id === params.id);
    if (!item) return err('NOT_FOUND', 404);
    const body = (await request.json()) as { status?: typeof item.status; adminNote?: string | null };
    if (body.status !== undefined) item.status = body.status;
    if (body.adminNote !== undefined) item.adminNote = body.adminNote;
    item.reviewedAt = iso();
    return HttpResponse.json(item);
  }),
```

The cursor here is a base64url-encoded numeric offset because that is exactly what `encodeCursor`/`decodeCursor` do on the API (`apps/api/src/common/pagination.ts`) — the mock and the server must agree, or paging works in one mode and not the other. Note the API uses **base64url without padding**, which `btoa`/`atob` do not produce, so add these two helpers next to `u()` and `err()` at the top of the file rather than calling `btoa` directly:

```ts
/** Matches the API's `encodeCursor`/`decodeCursor`: base64url, unpadded. */
const encodeMockCursor = (offset: number) =>
  btoa(String(offset)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const decodeMockCursor = (cursor: string) => {
  const padded = cursor.replace(/-/g, '+').replace(/_/g, '/');
  return Number(atob(padded + '='.repeat((4 - (padded.length % 4)) % 4)));
};
```

- [ ] **Step 16: Run the whole web suite including the guards**

Run: `pnpm --filter @kitchen/i18n build && pnpm --filter @kitchen/web exec vitest run`
Expected: PASS — every existing test, the two new admin tests, `palette.test.ts`, and `token-usage.test.ts`. If `token-usage` flags `text-primary`, change the component to `text-primary-text`; if it flags an opacity tint, switch to the matching `*-soft` token. **Do not edit the guard test.**

- [ ] **Step 17: Verify types and lint**

Run: `pnpm --filter @kitchen/web typecheck && pnpm --filter @kitchen/web lint`
Expected: PASS.

- [ ] **Step 18: Full-workspace verification**

Run: `pnpm build && pnpm typecheck && pnpm lint && pnpm test`
Expected: all green. The API integration specs need `pnpm infra:up && pnpm db:migrate && pnpm db:seed` to have run.

- [ ] **Step 19: Verify the console by hand**

```bash
# Promote yourself. There is no route for this, by design.
psql "$DATABASE_URL" -c "update users set role = 'staff' where email = 'you@example.com';"
WEB_PORT=3200 pnpm dev
```

Then, against `http://localhost:3200`:
1. Sign in, open Settings → Send feedback, submit 2 stars with a message.
2. Visit `/admin` — the submission appears, the stats strip counts it.
3. Open it, set **Resolved**, write an internal note, save. The badge and the strip both update.
4. Switch the locale to Arabic. Confirm the console mirrors — the star row, the filter labels, and the back link all move to the right edge — and that no Latin tracking is applied to the Arabic text.
5. Sign in as a non-staff account and visit `/admin`. You are redirected to `/`.

Remember the dev-server rule: `pnpm build` overwrites `apps/web/.next` and breaks a running dev server. Kill it first (`lsof -nP -iTCP:3200 -sTCP:LISTEN -t`, then `kill <pid>`), `rm -rf apps/web/.next`, and restart.

---

### Task 10: Store-policy declarations and the sentiment-filtering guard

**Files:**
- Create: `apps/mobile/src/lib/store-policy.spec.ts`
- Create: `docs/store-listing/data-safety.md`
- Modify: `apps/mobile/ios/KitchenAI/PrivacyInfo.xcprivacy`

**Interfaces:**
- Consumes: nothing. This task depends only on the feature existing.
- Produces: no importable code. It produces the two things a reviewer at Apple or Google will check, plus a test that keeps the first of them true.

**Why this is a task and not a footnote:** this sub-project is the first thing in the app that collects user-written content and links it to an identity. `PrivacyInfo.xcprivacy` currently declares `NSPrivacyCollectedDataTypes` as an **empty array**, which becomes false the moment Task 4 ships. An inaccurate privacy manifest is a rejection, and it is the kind that is found at submission time — after the work is done and someone is waiting.

- [ ] **Step 1: Write the failing guard test**

Create `apps/mobile/src/lib/store-policy.spec.ts`:

```ts
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(__dirname, '..');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return entry === 'mocks' ? [] : sourceFiles(full);
    return /\.(ts|tsx)$/.test(entry) && !/\.spec\.tsx?$/.test(entry) ? [full] : [];
  });
}

/**
 * Apple Guideline 1.1.7 and Google's In-App Review policy both forbid using a
 * collected sentiment to decide who is shown the native store-review prompt.
 * Now that the app collects a star rating, wiring it to `StoreReview` is a
 * plausible-looking one-line change that would make the app rejectable.
 *
 * This is a grep, not a type check, on purpose: the violation is the presence
 * of the capability near the rating, and no type system expresses that.
 */
describe('store review policy', () => {
  const files = sourceFiles(SRC);

  it('finds source files to check, or this test proves nothing', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it('never imports a store-review API', () => {
    const offenders = files.filter((file) => {
      const source = readFileSync(file, 'utf8');
      return /expo-store-review|StoreReview|requestReview/.test(source);
    });

    expect(offenders).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it**

Run: `pnpm --filter @kitchen/mobile exec vitest run src/lib/store-policy.spec.ts`
Expected: PASS — nothing imports it today. This test's value is entirely in the future; it fails the day someone connects the two.

- [ ] **Step 3: Prove the guard actually catches the violation**

Temporarily add this line to the top of `apps/mobile/src/app/settings/feedback.tsx`:

```tsx
import * as StoreReview from 'expo-store-review';
```

Run: `pnpm --filter @kitchen/mobile exec vitest run src/lib/store-policy.spec.ts`
Expected: FAIL, naming `feedback.tsx` in the offenders array.

**Then remove that line** and re-run to confirm PASS.

- [ ] **Step 4: Correct the iOS privacy manifest**

In `apps/mobile/ios/KitchenAI/PrivacyInfo.xcprivacy`, replace:

```xml
	<key>NSPrivacyCollectedDataTypes</key>
	<array/>
```

with:

```xml
	<key>NSPrivacyCollectedDataTypes</key>
	<array>
		<dict>
			<key>NSPrivacyCollectedDataType</key>
			<string>NSPrivacyCollectedDataTypeOtherUserContent</string>
			<key>NSPrivacyCollectedDataTypeLinked</key>
			<true/>
			<key>NSPrivacyCollectedDataTypeTracking</key>
			<false/>
			<key>NSPrivacyCollectedDataTypePurposes</key>
			<array>
				<string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string>
			</array>
		</dict>
		<dict>
			<key>NSPrivacyCollectedDataType</key>
			<string>NSPrivacyCollectedDataTypeEmailAddress</string>
			<key>NSPrivacyCollectedDataTypeLinked</key>
			<true/>
			<key>NSPrivacyCollectedDataTypeTracking</key>
			<false/>
			<key>NSPrivacyCollectedDataTypePurposes</key>
			<array>
				<string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string>
			</array>
		</dict>
	</array>
```

`Linked` is `true` because feedback carries `user_id` and the console shows the submitter's email. `Tracking` stays `false` — nothing here is shared with a data broker or joined with third-party data, so no App Tracking Transparency prompt is introduced.

The email entry is included because account email already existed and the manifest was under-declaring it; leaving it out now would mean shipping a manifest that is accurate about the new thing and wrong about the old one.

- [ ] **Step 5: Verify the manifest still parses**

Run: `plutil -lint apps/mobile/ios/KitchenAI/PrivacyInfo.xcprivacy`
Expected: `OK`. A malformed plist fails the build late and confusingly, so check it now.

- [ ] **Step 6: Write the store-listing record**

Create `docs/store-listing/data-safety.md`:

```markdown
# Store data declarations

The answers to give in App Store Connect and the Play Console, and why. Update
this file in the same change as any new data collection — the point is that the
console answers have a reviewable source, rather than being reconstructed from
memory at submission time.

## What this app collects

| Data | Where from | Linked to identity | Used for tracking | Purpose |
| --- | --- | --- | --- | --- |
| Email address | Account creation, OAuth | Yes | No | App functionality (sign-in, account recovery) |
| Name | Account creation, OAuth | Yes | No | App functionality (display name) |
| Photos | Kitchen/receipt capture | Yes | No | App functionality (recognising items) |
| Other user content | Feedback message | Yes | No | App functionality (product support) |
| Product interaction | Feedback rating | Yes | No | App functionality (product support) |

Nothing is shared with data brokers. No advertising identifiers are collected.
No third-party analytics SDK is present, so no App Tracking Transparency prompt
is required.

## App Store Connect — App Privacy

Declare **Other User Content** and **Product Interaction**, both *Linked to the
User* and *Not Used for Tracking*, purpose **App Functionality**. These must
match `apps/mobile/ios/KitchenAI/PrivacyInfo.xcprivacy`; the manifest and the
console answers are checked against each other.

## Play Console — Data safety

Under *Personal info* declare **Name** and **Email address**. Under *Photos and
videos* declare **Photos**. Under *App activity* declare **Other user-generated
content**. For each: collected, not shared, processed off-device (the feedback
row is stored on our server), and **not** ephemeral.

Answer "Yes" to *Can users request that their data be deleted?* only once
sub-project 2 ships an in-app account-deletion path. Until then this feature is
publishable but the app as a whole is not — see the note below.

## Privacy policy

The published policy must state, in plain language:

> When you send us feedback, we receive your rating, your message, the app
> version, and your language. Our staff can see this along with the email
> address and display name on your account, so we can understand and act on
> what you told us. We do not use your feedback to decide whether to show you
> an App Store or Google Play review prompt.

That last sentence is a commitment, not decoration: it is enforced in code by
`apps/mobile/src/lib/store-policy.spec.ts`.

## Known blocker, tracked elsewhere

The app has **no account-deletion path**. Apple Guideline 5.1.1(v) requires apps
that support account creation to also support in-app account deletion, and the
Play Console asks the same question directly. This is sub-project 2 and it must
ship before the first submission. Feedback rows are `ON DELETE CASCADE` from
`users` precisely so that deletion has a single erasure path when it is built.

## Guideline 1.2 (user-generated content)

Does **not** apply to this feature: no user can see another user's feedback, so
the filtering, reporting, blocking and published-contact obligations are not
triggered. This changes the moment grocery-item reviews ship (sub-project 4) —
revisit this section then rather than assuming it still holds.
```

- [ ] **Step 7: Verify**

Run: `pnpm --filter @kitchen/mobile exec vitest run && pnpm --filter @kitchen/mobile lint`
Expected: PASS. Confirm `docs/store-listing/data-safety.md` and the updated manifest are both present.

---

## Done

Every task above ends green. At this point the feature is complete: a user on any
of the three clients can rate the app and write a message, staff can triage it in
a console the API refuses to serve to anyone else, and the store declarations
describe what actually happens.

The one thing this plan does **not** deliver, deliberately, is account deletion —
it is a hard prerequisite for publishing and is scoped as sub-project 2.
