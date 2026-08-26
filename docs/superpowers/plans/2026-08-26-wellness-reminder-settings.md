# Wellness Reminder Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a household-scoped, get-or-default `reminder_settings` resource (contract + database + REST API) that stores which wellness nudges are on, the break cadence, the hydration goal, and quiet hours — the configuration the later scheduling engine will read.

**Architecture:** Mirror the existing singleton-per-scope `profiles` resource exactly. One row per household keyed by `household_id`; `GET /reminders/settings` returns the row or a fully-defaulted object when none exists; `PATCH /reminders/settings` upserts via `onConflictDoUpdate`. The contract (`packages/contracts/src/reminders.ts`) is the single source of truth for both the zod validation on the server and the derived typed `@kitchen/api-client`.

**Tech Stack:** TypeScript (ESM, `.js` import extensions), zod (`@kitchen/contracts`), NestJS controllers/guards, Drizzle ORM + PostgreSQL, drizzle-kit migrations, Vitest (contracts unit specs + API live-Postgres integration specs), supertest.

## Scope

This plan is the **settings** portion of Feature 2 (Wellness reminders engine) from the design spec `docs/superpowers/specs/2026-08-26-kitchen-companion-design.md` (§92–109). It deliberately does **not** include:

- The BullMQ `QUEUE_REMINDER` repeatable-job scheduler / `ReminderProcessor` (spec §101–104) — a follow-on plan, and it depends on the still-open push-provider question (spec §211).
- The `reminder_occurrences` log, `listReminderOccurrences`, `acknowledgeReminder` (spec §98, §108) — a follow-on plan (belongs with the firing engine that writes those rows).
- The web/mobile settings UI (prototype `03-wellness-settings.html`) and its MSW resolvers / i18n copy — a follow-on plan that consumes the routes this plan registers.

This slice produces working, testable software on its own: a validated, persisted, household-isolated settings resource reachable through the typed client in mock-free integration tests.

## Global Constraints

_Copied verbatim from the repo conventions and design spec; every task below implicitly includes these._

- ESM-style relative imports in `apps/api` carry the `.js` extension (e.g. `../db/index.js`) even though the compiler emits CommonJS.
- Never edit `packages/contracts` from an app; the contract is edited centrally and both request sides derive from it. This plan edits the contract package directly (that is the central change).
- Validation is `@Body(new ZodPipe(schema))` using the contract schema — no `class-validator` DTOs.
- The server never sends user-facing prose; throw `AppError` with a code + i18n `messageKey`. (No new error copy is needed in this slice.)
- Household-scoped routes require `household: true` in the registry and the `x-household-id` header; controllers combine `@UseGuards(AuthGuard, HouseholdGuard)` with `@CurrentHousehold()`. The verified context is `HouseholdContext { id, role }` — use `household.id`.
- Households own the data, not users (spec §55): the table is keyed by `household_id` with `onDelete: 'cascade'`.
- Schema changes: edit `apps/api/src/db/schema.ts`, then run `pnpm db:generate` and commit the generated SQL in `apps/api/drizzle/`. Never hand-write a migration.
- API integration specs hit the live Postgres at `DATABASE_URL`; run `pnpm infra:up && pnpm db:migrate && pnpm db:seed` before them. Delete households before users in cleanup (FK ordering).
- `turbo run build` must have produced `packages/*/dist` before typecheck/lint/test (`dependsOn: ["^build"]`). Run `pnpm build` once before the contract package is consumed by the API.
- Reminder settings fields (spec §96): per-type enabled flags `break`, `stretch`, `morning`, `hydration`; break cadence one of `30/60/90/120` minutes; quiet hours; hydration goal in cups/day.

---

## File Structure

**Contract package (`packages/contracts/src/`)**
- Create `reminders.ts` — zod schemas + inferred types for reminder settings. One responsibility: the reminder-settings interface.
- Create `reminders.spec.ts` — unit specs for those schemas' defaults/validation.
- Modify `index.ts` — re-export `./reminders.js` from the barrel.
- Modify `routes.ts` — register `getReminderSettings` + `updateReminderSettings`.
- Modify `routes.spec.ts` — assert the two routes are registered household-scoped. _(Folded into Task 2.)_

**API (`apps/api/src/`)**
- Modify `db/schema.ts` — add the `reminderSettings` table.
- Generate `drizzle/000X_*.sql` — via `pnpm db:generate` (drizzle chooses the name).
- Create `reminders/reminders.service.ts` — get-or-default + upsert against Postgres.
- Create `reminders/reminders.service.spec.ts` — live-DB integration spec (defaults, persistence, household isolation).
- Create `reminders/reminders.controller.ts` — the two HTTP endpoints, household-guarded.
- Create `reminders/reminders.module.ts` — Nest module wiring.
- Create `reminders/reminders.http.spec.ts` — supertest spec proving guard wiring + validation.
- Modify `app.module.ts` — import `RemindersModule`.

---

## Task 1: Reminder settings contract schema

**Files:**
- Create: `packages/contracts/src/reminders.ts`
- Test: `packages/contracts/src/reminders.spec.ts`
- Modify: `packages/contracts/src/index.ts`

**Interfaces:**
- Consumes: `uuidSchema` from `./common.js`.
- Produces:
  - `reminderSettingsSchema` (zod object) and `type ReminderSettings`
  - `updateReminderSettingsRequestSchema` (partial, no `householdId`) and `type UpdateReminderSettingsRequest`
  - `breakCadenceMinutesSchema` and `type BreakCadenceMinutes` (`30 | 60 | 90 | 120`)
  - `reminderTypeSchema` and `type ReminderType` (`'break' | 'stretch' | 'morning' | 'hydration'`)

- [ ] **Step 1: Write the failing test**

Create `packages/contracts/src/reminders.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  breakCadenceMinutesSchema,
  reminderSettingsSchema,
  reminderTypeSchema,
  updateReminderSettingsRequestSchema,
} from './reminders.js';

const HOUSEHOLD_ID = '11111111-1111-4111-8111-111111111111';

describe('reminderSettingsSchema', () => {
  it('fills every setting with a default when only the household id is given', () => {
    const parsed = reminderSettingsSchema.parse({ householdId: HOUSEHOLD_ID });
    expect(parsed).toEqual({
      householdId: HOUSEHOLD_ID,
      breakEnabled: true,
      stretchEnabled: true,
      morningEnabled: true,
      hydrationEnabled: true,
      breakCadenceMinutes: 60,
      hydrationGoalCups: 8,
      quietHoursStart: 22,
      quietHoursEnd: 7,
    });
  });

  it('rejects a non-uuid household id', () => {
    expect(reminderSettingsSchema.safeParse({ householdId: 'nope' }).success).toBe(false);
  });
});

describe('breakCadenceMinutesSchema', () => {
  it('accepts only the four supported cadences', () => {
    for (const value of [30, 60, 90, 120]) {
      expect(breakCadenceMinutesSchema.safeParse(value).success).toBe(true);
    }
    for (const value of [0, 45, 100, 120.5, -30]) {
      expect(breakCadenceMinutesSchema.safeParse(value).success).toBe(false);
    }
  });
});

describe('reminderTypeSchema', () => {
  it('enumerates exactly the four wellness nudge types', () => {
    expect(reminderTypeSchema.options).toEqual(['break', 'stretch', 'morning', 'hydration']);
  });
});

describe('updateReminderSettingsRequestSchema', () => {
  it('is fully optional so a client can patch a single field', () => {
    expect(updateReminderSettingsRequestSchema.parse({})).toEqual({});
    expect(updateReminderSettingsRequestSchema.parse({ breakEnabled: false })).toEqual({
      breakEnabled: false,
    });
  });

  it('does not allow the household id to be patched', () => {
    const parsed = updateReminderSettingsRequestSchema.parse({
      householdId: HOUSEHOLD_ID,
      hydrationGoalCups: 10,
    });
    expect(parsed).toEqual({ hydrationGoalCups: 10 });
  });

  it('rejects an out-of-range quiet hour and an out-of-range hydration goal', () => {
    expect(updateReminderSettingsRequestSchema.safeParse({ quietHoursStart: 24 }).success).toBe(false);
    expect(updateReminderSettingsRequestSchema.safeParse({ quietHoursEnd: -1 }).success).toBe(false);
    expect(updateReminderSettingsRequestSchema.safeParse({ hydrationGoalCups: 0 }).success).toBe(false);
    expect(updateReminderSettingsRequestSchema.safeParse({ hydrationGoalCups: 21 }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @kitchen/contracts exec vitest run src/reminders.spec.ts`
Expected: FAIL — `Cannot find module './reminders.js'` (the file does not exist yet).

- [ ] **Step 3: Write minimal implementation**

Create `packages/contracts/src/reminders.ts`:

```ts
import { z } from 'zod';
import { uuidSchema } from './common.js';

/* ------------------------------------------------------------------ */
/* Wellness reminders — settings (design spec §92–98)                  */
/* ------------------------------------------------------------------ */

/** The four nudge types the wellness engine can fire. Spec §96. */
export const reminderTypeSchema = z.enum(['break', 'stretch', 'morning', 'hydration']);
export type ReminderType = z.infer<typeof reminderTypeSchema>;

/** Break cadence is one of four fixed intervals, in minutes. Spec §96. */
export const breakCadenceMinutesSchema = z.union([
  z.literal(30),
  z.literal(60),
  z.literal(90),
  z.literal(120),
]);
export type BreakCadenceMinutes = z.infer<typeof breakCadenceMinutesSchema>;

export const reminderSettingsSchema = z.object({
  householdId: uuidSchema,
  breakEnabled: z.boolean().default(true),
  stretchEnabled: z.boolean().default(true),
  morningEnabled: z.boolean().default(true),
  hydrationEnabled: z.boolean().default(true),
  breakCadenceMinutes: breakCadenceMinutesSchema.default(60),
  /** Cups of water per day. */
  hydrationGoalCups: z.number().int().min(1).max(20).default(8),
  /** Quiet-hours window as whole hours 0–23; nudges are suppressed inside it. */
  quietHoursStart: z.number().int().min(0).max(23).default(22),
  quietHoursEnd: z.number().int().min(0).max(23).default(7),
});
export type ReminderSettings = z.infer<typeof reminderSettingsSchema>;

export const updateReminderSettingsRequestSchema = reminderSettingsSchema
  .omit({ householdId: true })
  .partial();
export type UpdateReminderSettingsRequest = z.infer<typeof updateReminderSettingsRequestSchema>;
```

Then add the barrel export to `packages/contracts/src/index.ts`. Insert `export * from './reminders.js';` immediately after the `export * from './feedback.js';` line:

```ts
export * from './feedback.js';
export * from './reminders.js';
export * from './routes.js';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @kitchen/contracts exec vitest run src/reminders.spec.ts`
Expected: PASS (all 7 cases green).

- [ ] **Step 5: Commit**

```bash
git add packages/contracts/src/reminders.ts packages/contracts/src/reminders.spec.ts packages/contracts/src/index.ts
git commit -m "feat(contracts): add reminder settings schema"
```

---

## Task 2: Register the reminder settings routes

**Files:**
- Modify: `packages/contracts/src/routes.ts`
- Test: `packages/contracts/src/routes.spec.ts`

**Interfaces:**
- Consumes: `reminderSettingsSchema`, `updateReminderSettingsRequestSchema` from Task 1.
- Produces: route names `getReminderSettings` (GET `/reminders/settings`) and `updateReminderSettings` (PATCH `/reminders/settings`), both `auth: true, household: true`. `@kitchen/api-client` will expose `call('getReminderSettings', …)` / `call('updateReminderSettings', …)` automatically.

- [ ] **Step 1: Write the failing test**

Append to `packages/contracts/src/routes.spec.ts`:

```ts
describe('reminder settings routes', () => {
  it('registers the read route as authenticated and household-scoped', () => {
    expect(routes.getReminderSettings).toMatchObject({
      method: 'GET',
      path: '/reminders/settings',
      auth: true,
      household: true,
    });
  });

  it('registers the update route with the partial-settings body', () => {
    expect(routes.updateReminderSettings).toMatchObject({
      method: 'PATCH',
      path: '/reminders/settings',
      auth: true,
      household: true,
    });
    expect(routes.updateReminderSettings.body).toBe(updateReminderSettingsRequestSchema);
  });
});
```

Add the import used by that block to the top of `routes.spec.ts` (below the existing imports):

```ts
import { updateReminderSettingsRequestSchema } from './reminders.js';
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @kitchen/contracts exec vitest run src/routes.spec.ts`
Expected: FAIL — `routes.getReminderSettings` is `undefined` (`Cannot read properties of undefined`).

- [ ] **Step 3: Write minimal implementation**

In `packages/contracts/src/routes.ts`, add the schema imports. Find the existing named imports pulled in for other routes and add these two names (they come from the barrel via `./reminders.js` — import them from `./reminders.js` alongside how the file imports the other feature schemas; match the file's existing import style):

```ts
import {
  reminderSettingsSchema,
  updateReminderSettingsRequestSchema,
} from './reminders.js';
```

Then register the two routes. Add this block just before the closing of the `routes` object (after the feedback/admin routes, mirroring the `getProfile`/`updateProfile` shape):

```ts
  /* ---------------- Wellness reminders ---------------- */
  getReminderSettings: {
    method: 'GET',
    path: '/reminders/settings',
    auth: true,
    household: true,
    response: reminderSettingsSchema,
  },
  updateReminderSettings: {
    method: 'PATCH',
    path: '/reminders/settings',
    auth: true,
    household: true,
    body: updateReminderSettingsRequestSchema,
    response: reminderSettingsSchema,
  },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @kitchen/contracts exec vitest run src/routes.spec.ts`
Expected: PASS.

Then rebuild the contract package so the API and api-client consume the new routes:

Run: `pnpm --filter @kitchen/contracts build`
Expected: succeeds, refreshing `packages/contracts/dist`.

- [ ] **Step 5: Commit**

```bash
git add packages/contracts/src/routes.ts packages/contracts/src/routes.spec.ts
git commit -m "feat(contracts): register reminder settings routes"
```

---

## Task 3: Add the reminder_settings table and migration

**Files:**
- Modify: `apps/api/src/db/schema.ts`
- Create (generated): `apps/api/drizzle/000X_*.sql` (drizzle-kit names it)

**Interfaces:**
- Consumes: existing `households` table, and the `pgTable`/`uuid`/`boolean`/`integer`/`timestamp` imports already present at the top of `schema.ts`.
- Produces: `export const reminderSettings` — a Drizzle table with columns `householdId, breakEnabled, stretchEnabled, morningEnabled, hydrationEnabled, breakCadenceMinutes, hydrationGoalCups, quietHoursStart, quietHoursEnd, updatedAt`. Consumed by Task 4's service.

- [ ] **Step 1: Write the failing test**

Add a schema-shape assertion so the column set is pinned. Append to `apps/api/src/db/schema.spec.ts`:

```ts
describe('reminderSettings table', () => {
  it('is keyed by household and carries every wellness setting column', async () => {
    const { reminderSettings } = await import('./schema.js');
    const columns = Object.keys(reminderSettings);
    expect(columns).toEqual(
      expect.arrayContaining([
        'householdId',
        'breakEnabled',
        'stretchEnabled',
        'morningEnabled',
        'hydrationEnabled',
        'breakCadenceMinutes',
        'hydrationGoalCups',
        'quietHoursStart',
        'quietHoursEnd',
        'updatedAt',
      ]),
    );
  });
});
```

> If `apps/api/src/db/schema.spec.ts` has no `describe`/`import` for vitest yet, add `import { describe, expect, it } from 'vitest';` at the top — check the existing file first and only add what is missing.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @kitchen/api exec vitest run src/db/schema.spec.ts -t 'reminderSettings table'`
Expected: FAIL — `reminderSettings` is not an export of `./schema.js`.

- [ ] **Step 3: Write minimal implementation**

In `apps/api/src/db/schema.ts`, add the table immediately after the `profiles` table definition (keep it near the other household-scoped tables). Do **not** add a `pgEnum` — cadence and quiet hours are integers validated by the contract:

```ts
export const reminderSettings = pgTable('reminder_settings', {
  householdId: uuid('household_id')
    .primaryKey()
    .references(() => households.id, { onDelete: 'cascade' }),
  breakEnabled: boolean('break_enabled').notNull().default(true),
  stretchEnabled: boolean('stretch_enabled').notNull().default(true),
  morningEnabled: boolean('morning_enabled').notNull().default(true),
  hydrationEnabled: boolean('hydration_enabled').notNull().default(true),
  breakCadenceMinutes: integer('break_cadence_minutes').notNull().default(60),
  hydrationGoalCups: integer('hydration_goal_cups').notNull().default(8),
  quietHoursStart: integer('quiet_hours_start').notNull().default(22),
  quietHoursEnd: integer('quiet_hours_end').notNull().default(7),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
```

- [ ] **Step 4: Run test to verify it passes, then generate + apply the migration**

Run: `pnpm --filter @kitchen/api exec vitest run src/db/schema.spec.ts -t 'reminderSettings table'`
Expected: PASS.

Generate the migration SQL (drizzle-kit diffs `schema.ts` and writes a new file under `apps/api/drizzle/`):

Run: `pnpm db:generate`
Expected: a new `apps/api/drizzle/000X_*.sql` creating `reminder_settings`, plus an updated `apps/api/drizzle/meta/` snapshot. Open the generated SQL and confirm it `CREATE TABLE "reminder_settings"` with the nine columns + the `households` FK — do not hand-edit it.

Apply it to the running database so the Task 4 integration spec can use it:

Run: `pnpm infra:up && pnpm db:migrate`
Expected: migration applies cleanly.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/db/schema.ts apps/api/src/db/schema.spec.ts apps/api/drizzle
git commit -m "feat(api): add reminder_settings table"
```

---

## Task 4: RemindersService (get-or-default + upsert)

**Files:**
- Create: `apps/api/src/reminders/reminders.service.ts`
- Test: `apps/api/src/reminders/reminders.service.spec.ts`

**Interfaces:**
- Consumes: `reminderSettingsSchema`, `ReminderSettings`, `UpdateReminderSettingsRequest`, `BreakCadenceMinutes` from `@kitchen/contracts`; `reminderSettings` table from Task 3; `DB`/`Database` from `../db/index.js`.
- Produces: `class RemindersService` with `get(householdId: string): Promise<ReminderSettings>` and `update(householdId: string, dto: UpdateReminderSettingsRequest): Promise<ReminderSettings>`. Consumed by Task 5's controller.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/reminders/reminders.service.spec.ts` (mirrors `inventory.service.spec.ts`: constructs the service against the live DB, seeds two households to prove isolation):

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { reminderSettings } from '../db/schema.js';
import {
  cleanup,
  createTestContext,
  seedHousehold,
  seedUser,
  type TestContext,
} from '../testing/harness.js';
import { RemindersService } from './reminders.service.js';

describe('RemindersService (live DB)', () => {
  let ctx: TestContext;
  let service: RemindersService;
  let userId: string;
  let hhA: string;
  let hhB: string;

  beforeAll(async () => {
    ctx = createTestContext();
    service = new RemindersService(ctx.db);
    userId = await seedUser(ctx.db);
    hhA = await seedHousehold(ctx.db, userId, 'owner');
    hhB = await seedHousehold(ctx.db, userId, 'owner');
  });

  afterAll(async () => {
    await ctx.db.delete(reminderSettings).where(eq(reminderSettings.householdId, hhA));
    await ctx.db.delete(reminderSettings).where(eq(reminderSettings.householdId, hhB));
    await cleanup(ctx.db, { households: [hhA, hhB], users: [userId] });
    await ctx.client.end({ timeout: 5 });
  });

  it('returns fully-defaulted settings for a household with no row yet', async () => {
    const settings = await service.get(hhA);
    expect(settings).toEqual({
      householdId: hhA,
      breakEnabled: true,
      stretchEnabled: true,
      morningEnabled: true,
      hydrationEnabled: true,
      breakCadenceMinutes: 60,
      hydrationGoalCups: 8,
      quietHoursStart: 22,
      quietHoursEnd: 7,
    });
  });

  it('persists a patch and merges it over the defaults', async () => {
    const updated = await service.update(hhA, {
      breakEnabled: false,
      breakCadenceMinutes: 90,
      hydrationGoalCups: 10,
    });
    expect(updated).toMatchObject({
      householdId: hhA,
      breakEnabled: false,
      breakCadenceMinutes: 90,
      hydrationGoalCups: 10,
      stretchEnabled: true,
    });

    const reread = await service.get(hhA);
    expect(reread.breakEnabled).toBe(false);
    expect(reread.breakCadenceMinutes).toBe(90);
    expect(reread.hydrationGoalCups).toBe(10);
  });

  it('updates the same row on a second patch instead of inserting a duplicate', async () => {
    await service.update(hhA, { quietHoursStart: 21 });
    const rows = await ctx.db
      .select()
      .from(reminderSettings)
      .where(eq(reminderSettings.householdId, hhA));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.quietHoursStart).toBe(21);
  });

  it('keeps each household isolated', async () => {
    await service.update(hhA, { morningEnabled: false });
    const other = await service.get(hhB);
    expect(other.morningEnabled).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @kitchen/api exec vitest run src/reminders/reminders.service.spec.ts`
Expected: FAIL — `Cannot find module './reminders.service.js'`.

_(Precondition: `pnpm infra:up && pnpm db:migrate && pnpm db:seed` have been run, per Global Constraints; Task 3 already migrated the new table.)_

- [ ] **Step 3: Write minimal implementation**

Create `apps/api/src/reminders/reminders.service.ts` (mirrors `profiles.service.ts`, scoped by household):

```ts
import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import {
  reminderSettingsSchema,
  type BreakCadenceMinutes,
  type ReminderSettings,
  type UpdateReminderSettingsRequest,
} from '@kitchen/contracts';
import { DB, type Database } from '../db/index.js';
import { reminderSettings } from '../db/schema.js';

interface ReminderSettingsRow {
  householdId: string;
  breakEnabled: boolean;
  stretchEnabled: boolean;
  morningEnabled: boolean;
  hydrationEnabled: boolean;
  breakCadenceMinutes: number;
  hydrationGoalCups: number;
  quietHoursStart: number;
  quietHoursEnd: number;
}

function toReminderSettings(row: ReminderSettingsRow): ReminderSettings {
  return {
    householdId: row.householdId,
    breakEnabled: row.breakEnabled,
    stretchEnabled: row.stretchEnabled,
    morningEnabled: row.morningEnabled,
    hydrationEnabled: row.hydrationEnabled,
    breakCadenceMinutes: row.breakCadenceMinutes as BreakCadenceMinutes,
    hydrationGoalCups: row.hydrationGoalCups,
    quietHoursStart: row.quietHoursStart,
    quietHoursEnd: row.quietHoursEnd,
  };
}

@Injectable()
export class RemindersService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async get(householdId: string): Promise<ReminderSettings> {
    const [row] = await this.db
      .select()
      .from(reminderSettings)
      .where(eq(reminderSettings.householdId, householdId))
      .limit(1);
    if (!row) return reminderSettingsSchema.parse({ householdId });
    return toReminderSettings(row);
  }

  async update(
    householdId: string,
    dto: UpdateReminderSettingsRequest,
  ): Promise<ReminderSettings> {
    const [row] = await this.db
      .insert(reminderSettings)
      .values({ householdId, ...dto, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: reminderSettings.householdId,
        set: { ...dto, updatedAt: new Date() },
      })
      .returning();
    if (!row) return this.get(householdId);
    return toReminderSettings(row);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @kitchen/api exec vitest run src/reminders/reminders.service.spec.ts`
Expected: PASS (all 4 cases green).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/reminders/reminders.service.ts apps/api/src/reminders/reminders.service.spec.ts
git commit -m "feat(api): add reminder settings service"
```

---

## Task 5: RemindersController + module wiring

**Files:**
- Create: `apps/api/src/reminders/reminders.controller.ts`
- Create: `apps/api/src/reminders/reminders.module.ts`
- Test: `apps/api/src/reminders/reminders.http.spec.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Consumes: `RemindersService` (Task 4); `updateReminderSettingsRequestSchema`, `ReminderSettings`, `UpdateReminderSettingsRequest`, `HOUSEHOLD_HEADER` from `@kitchen/contracts`; `AuthGuard`, `HouseholdGuard`, `CurrentHousehold`, `HouseholdContext`, `ZodPipe` from `../common/*`.
- Produces: `RemindersController` (`GET`/`PATCH /reminders/settings`) and `RemindersModule`, imported by `AppModule`. This is the last task — nothing downstream consumes it.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/reminders/reminders.http.spec.ts` (mirrors `feedback.spec.ts`, adds the `HouseholdGuard` + `x-household-id` header wiring that household routes need):

```ts
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtModule } from '@nestjs/jwt';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import { HOUSEHOLD_HEADER } from '@kitchen/contracts';
import { DB } from '../db/index.js';
import { reminderSettings } from '../db/schema.js';
import { AppExceptionFilter } from '../common/errors.js';
import { AuthGuard } from '../common/auth.guard.js';
import { HouseholdGuard } from '../common/household.guard.js';
import {
  cleanup,
  createTestContext,
  seedHousehold,
  seedUser,
  type TestContext,
} from '../testing/harness.js';
import { RemindersController } from './reminders.controller.js';
import { RemindersService } from './reminders.service.js';

describe('reminders/settings HTTP', () => {
  let ctx: TestContext;
  let app: INestApplication;
  let userId: string;
  let householdId: string;
  let token: string;

  beforeAll(async () => {
    ctx = createTestContext();
    userId = await seedUser(ctx.db, `test+reminders-${randomUUID()}@example.com`);
    householdId = await seedHousehold(ctx.db, userId, 'owner');
    token = await ctx.jwt.signAsync({ sub: userId });

    const moduleRef = await Test.createTestingModule({
      imports: [
        JwtModule.register({
          secret: ctx.env.JWT_SECRET,
          signOptions: { expiresIn: ctx.env.JWT_ACCESS_TTL },
        }),
      ],
      controllers: [RemindersController],
      providers: [{ provide: DB, useValue: ctx.db }, AuthGuard, HouseholdGuard, RemindersService],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new AppExceptionFilter());
    await app.init();
  });

  beforeEach(async () => {
    await ctx.db.delete(reminderSettings).where(eq(reminderSettings.householdId, householdId));
  });

  afterAll(async () => {
    await app?.close();
    await ctx.db.delete(reminderSettings).where(eq(reminderSettings.householdId, householdId));
    await cleanup(ctx.db, { households: [householdId], users: [userId] });
    await ctx.client.end({ timeout: 5 });
  });

  const auth = (req: request.Test) =>
    req.set('authorization', `Bearer ${token}`).set(HOUSEHOLD_HEADER, householdId);

  it('returns defaults on first GET', async () => {
    const res = await auth(request(app.getHttpServer()).get('/reminders/settings')).expect(200);
    expect(res.body).toMatchObject({
      householdId,
      breakEnabled: true,
      breakCadenceMinutes: 60,
      quietHoursStart: 22,
    });
  });

  it('PATCH persists a partial update and echoes the merged settings', async () => {
    const res = await auth(request(app.getHttpServer()).patch('/reminders/settings'))
      .send({ breakCadenceMinutes: 30, hydrationEnabled: false })
      .expect(200);
    expect(res.body).toMatchObject({
      breakCadenceMinutes: 30,
      hydrationEnabled: false,
      stretchEnabled: true,
    });
  });

  it('rejects an unsupported cadence with a validation error', async () => {
    await auth(request(app.getHttpServer()).patch('/reminders/settings'))
      .send({ breakCadenceMinutes: 45 })
      .expect(400);
  });

  it('requires the household header', async () => {
    await request(app.getHttpServer())
      .get('/reminders/settings')
      .set('authorization', `Bearer ${token}`)
      .expect(400);
  });

  it('rejects an unauthenticated request', async () => {
    await request(app.getHttpServer())
      .get('/reminders/settings')
      .set(HOUSEHOLD_HEADER, householdId)
      .expect(401);
  });
});
```

> Confirm the exact HTTP status the app maps `HOUSEHOLD_REQUIRED` and validation errors to by checking `AppExceptionFilter` in `apps/api/src/common/errors.ts`; the `.expect(...)` codes above assume the standard `400` for `HOUSEHOLD_REQUIRED`/validation and `401` for unauthenticated. Adjust the expected codes to match the filter if they differ — do not change the filter.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @kitchen/api exec vitest run src/reminders/reminders.http.spec.ts`
Expected: FAIL — `Cannot find module './reminders.controller.js'`.

- [ ] **Step 3: Write minimal implementation**

Create `apps/api/src/reminders/reminders.controller.ts` (mirrors `profiles.controller.ts`, household-scoped like `locations.controller.ts`):

```ts
import { Body, Controller, Get, Inject, Patch, UseGuards } from '@nestjs/common';
import {
  updateReminderSettingsRequestSchema,
  type ReminderSettings,
  type UpdateReminderSettingsRequest,
} from '@kitchen/contracts';
import { ZodPipe } from '../common/http.js';
import { AuthGuard } from '../common/auth.guard.js';
import { HouseholdGuard } from '../common/household.guard.js';
import { CurrentHousehold } from '../common/current-household.decorator.js';
import type { HouseholdContext } from '../common/request-context.js';
import { RemindersService } from './reminders.service.js';

@Controller('reminders/settings')
@UseGuards(AuthGuard, HouseholdGuard)
export class RemindersController {
  constructor(@Inject(RemindersService) private readonly reminders: RemindersService) {}

  @Get()
  get(@CurrentHousehold() household: HouseholdContext): Promise<ReminderSettings> {
    return this.reminders.get(household.id);
  }

  @Patch()
  update(
    @CurrentHousehold() household: HouseholdContext,
    @Body(new ZodPipe(updateReminderSettingsRequestSchema)) body: UpdateReminderSettingsRequest,
  ): Promise<ReminderSettings> {
    return this.reminders.update(household.id, body);
  }
}
```

Create `apps/api/src/reminders/reminders.module.ts` (mirrors `profiles.module.ts`):

```ts
import { Module } from '@nestjs/common';
import { RemindersController } from './reminders.controller.js';
import { RemindersService } from './reminders.service.js';

@Module({
  controllers: [RemindersController],
  providers: [RemindersService],
})
export class RemindersModule {}
```

Wire it into `apps/api/src/app.module.ts`. Add the import next to the other feature modules:

```ts
import { RemindersModule } from './reminders/reminders.module.js';
```

and add `RemindersModule` to the `imports` array (place it after `FeedbackModule`):

```ts
    FeedbackModule,
    RemindersModule,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @kitchen/api exec vitest run src/reminders/reminders.http.spec.ts`
Expected: PASS (all 5 cases green).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/reminders/reminders.controller.ts apps/api/src/reminders/reminders.module.ts apps/api/src/reminders/reminders.http.spec.ts apps/api/src/app.module.ts
git commit -m "feat(api): expose reminder settings endpoints"
```

---

## Task 6: Full-suite verification

**Files:** none (validation only).

- [ ] **Step 1: Typecheck the whole workspace**

Run: `pnpm build && pnpm typecheck`
Expected: PASS. (`pnpm build` first so every `packages/*/dist` — including the new contract exports — exists before `typecheck`, per the `dependsOn: ["^build"]` rule.)

- [ ] **Step 2: Lint**

Run: `pnpm lint`
Expected: PASS. In particular no physical-direction style lint (this slice adds no UI) and no missing `.js` import extensions in `apps/api`.

- [ ] **Step 3: Run the affected package test suites**

Run: `pnpm --filter @kitchen/contracts test && pnpm --filter @kitchen/api exec vitest run src/reminders src/db/schema.spec.ts`
Expected: PASS. (Requires `pnpm infra:up && pnpm db:migrate && pnpm db:seed` to have been run for the API integration specs.)

- [ ] **Step 4: Commit any lint/format fixups**

```bash
pnpm format
git add -u apps/api/src/reminders packages/contracts/src
git commit -m "chore: format reminder settings slice" || echo "nothing to format"
```

---

## Self-Review

**1. Spec coverage (design spec §92–98 — reminder_settings):**
- Per-type enabled flags `break`/`stretch`/`morning`/`hydration` → `breakEnabled`/`stretchEnabled`/`morningEnabled`/`hydrationEnabled` (Task 1 schema, Task 3 columns). ✓
- Break cadence 30/60/90/120 → `breakCadenceMinutesSchema` union + `break_cadence_minutes` integer (Tasks 1, 3). ✓
- Quiet hours → `quietHoursStart`/`quietHoursEnd` (Tasks 1, 3). ✓
- Hydration goal cups/day → `hydrationGoalCups` (Tasks 1, 3). ✓
- Household-scoped ownership (spec §55) → `household_id` PK + cascade FK, `household: true` routes, `HouseholdGuard` (Tasks 2, 3, 5). ✓
- Routes `getReminderSettings`, `updateReminderSettings` (spec §108) → Task 2. ✓
- **Deferred (documented in Scope):** `reminder_occurrences`, `listReminderOccurrences`, `acknowledgeReminder`, the BullMQ scheduler/`ReminderProcessor`, and the settings UI. These are named as follow-on plans, not gaps.

**2. Placeholder scan:** No "TBD"/"TODO"/"add validation"/"similar to Task N". Every code step ships real code. The generated migration filename `000X_*.sql` is an accurate description of a drizzle-kit-named artifact, not a placeholder. Two `>` notes ask the implementer to confirm an existing file's shape (schema.spec imports, `AppExceptionFilter` status codes) rather than assert an unknown — verification, not a gap.

**3. Type consistency:** Names are identical across tasks — `reminderSettingsSchema`, `updateReminderSettingsRequestSchema`, `breakCadenceMinutesSchema`, `reminderTypeSchema`, `ReminderSettings`, `UpdateReminderSettingsRequest`, `BreakCadenceMinutes`; `reminderSettings` table; `RemindersService.get`/`.update`; `RemindersController`; `RemindersModule`. Household context accessed as `household.id` everywhere (matches `HouseholdContext { id, role }`). Defaults are consistent across the contract (Task 1), the DB column defaults (Task 3), and every test expectation (Tasks 1, 4, 5): break/stretch/morning/hydration `true`, cadence `60`, hydration `8`, quiet hours `22`→`7`.
