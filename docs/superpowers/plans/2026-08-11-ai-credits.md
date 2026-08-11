# AI Credits Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every household a credit balance that covers AI cost — a resetting free monthly grant plus non-expiring purchased credits — debited per user-facing action.

**Architecture:** An append-only `credit_ledger` with a materialised `household_credits` balance, mirroring the existing `inventory_events` → `inventory_items.quantity` pattern. Debits happen at the four user-facing action sites (not in `AiGateway`, because one plan is several gateway calls and is discarded whole if any fails). Purchases arrive through mobile IAP via RevenueCat, verified behind a `PAYMENT_VERIFIER` DI token with a mock adapter, exactly like `AI_MOCK` works today.

**Tech Stack:** NestJS + Drizzle (PostgreSQL 17), zod contracts in `@kitchen/contracts`, Vitest, Next.js web, Expo mobile, `react-native-purchases` (RevenueCat).

**Spec:** `docs/superpowers/specs/2026-08-11-ai-credits-design.md`

## Global Constraints

- **Credit prices are exact and come from spec §3.** `pantry.scan` 1, `receipt.scan` 2, `plan.daily` 4, `plan.weekly` 20, `plan.monthly` 50, `plan.regenerateEntry` 2. Free monthly grant **150**. Pack `credits_300` = **300** credits for **$4.99**.
- **`name.resolve` and `recipe.translate` are never billed separately** — they are absorbed by the action that triggered them.
- **Free credits are always spent before purchased credits.**
- **Purchased credits never expire.** Only the free grant resets. (Apple Guideline 3.1.1.)
- **`paid_balance` may go negative** after a refund of consumed credits. Never clamp it to zero.
- **Debits must be a single conditional `UPDATE`**, never read-then-write. Two members spending simultaneously must not both pass a check for a balance covering one.
- **API imports use the `.js` extension** on relative paths (`./credits.service.js`). Web and mobile imports have none.
- **Validation is `@Body(new ZodPipe(schema))`** using the contract schema. No `class-validator` DTOs.
- **The server never sends user-facing prose.** Throw `AppError(code, 'errors.<KEY>', details)`.
- **Drizzle `numeric` returns strings, timestamps return `Date`.** Convert via `common/serialization.ts`.
- **Never hand-write a migration.** Edit `src/db/schema.ts`, run `pnpm db:generate`, commit the generated SQL in `apps/api/drizzle/`.
- **i18n catalogs are append-only per namespace.** `packages/i18n/src/en.ts` + `ar.ts` for shared/`errors.*`; `web.en.ts`/`web.ar.ts` for web; `mobile.en.ts`/`mobile.ar.ts` for mobile. A missing Arabic key is a build error.
- **No physical-direction styles.** Use `ms/me`, `ps/pe`, `text-start`, `marginStart`. ESLint rejects `ml-*`, `pl-*`, `text-left`, `marginLeft`.
- **No hex literals outside the token files** and no opacity tints like `bg-primary/8` — use a solid `*-soft` token. `text-primary` is for fills/rings only; aubergine text uses `text-primary-text`.
- **`packages/contracts` is edited only by the tasks below that explicitly say so.**
- API integration specs need `pnpm infra:up && pnpm db:migrate && pnpm db:seed` first.

---

### Task 1: Contracts — credit prices, schemas, error code

**Files:**

- Create: `packages/contracts/src/credits.ts`
- Create: `packages/contracts/src/credits.spec.ts`
- Modify: `packages/contracts/src/common.ts` (add `INSUFFICIENT_CREDITS` to `errorCodeSchema` and `ERROR_STATUS`)
- Modify: `packages/contracts/src/index.ts` (add `export * from './credits.js';`)

**Interfaces:**

- Consumes: nothing.
- Produces: `CreditAction`, `CREDIT_COSTS`, `FREE_MONTHLY_GRANT`, `CREDIT_PACKS`, `creditBalanceSchema`/`CreditBalance`, `purchaseIntentRequestSchema`/`PurchaseIntentRequest`, `purchaseIntentSchema`/`PurchaseIntent`, `confirmPurchaseRequestSchema`/`ConfirmPurchaseRequest`, and error code `INSUFFICIENT_CREDITS`.

- [ ] **Step 1: Write the failing test**

Create `packages/contracts/src/credits.spec.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  CREDIT_COSTS,
  CREDIT_PACKS,
  FREE_MONTHLY_GRANT,
  creditActionSchema,
  creditBalanceSchema,
} from "./credits.js";
import { ERROR_STATUS, errorCodeSchema } from "./common.js";

describe("credit contracts", () => {
  it("prices every action", () => {
    for (const action of creditActionSchema.options) {
      expect(CREDIT_COSTS[action]).toBeGreaterThan(0);
    }
  });

  it("uses the exact prices from the spec", () => {
    expect(CREDIT_COSTS).toEqual({
      "pantry.scan": 1,
      "receipt.scan": 2,
      "plan.daily": 4,
      "plan.weekly": 20,
      "plan.monthly": 50,
      "plan.regenerateEntry": 2,
    });
  });

  it("grants 150 free credits a month", () => {
    expect(FREE_MONTHLY_GRANT).toBe(150);
  });

  it("sells 300 credits for $4.99", () => {
    const pack = CREDIT_PACKS.find((p) => p.productId === "credits_300");
    expect(pack).toEqual({
      productId: "credits_300",
      credits: 300,
      priceUsd: 4.99,
    });
  });

  it("keeps the monthly plan the most expensive action", () => {
    const costs = Object.values(CREDIT_COSTS);
    expect(Math.max(...costs)).toBe(CREDIT_COSTS["plan.monthly"]);
  });

  it("registers INSUFFICIENT_CREDITS as a 402", () => {
    expect(errorCodeSchema.options).toContain("INSUFFICIENT_CREDITS");
    expect(ERROR_STATUS.INSUFFICIENT_CREDITS).toBe(402);
  });

  it("parses a balance", () => {
    const parsed = creditBalanceSchema.parse({
      householdId: "00000000-0000-4000-8000-000000000000",
      freeBalance: 150,
      paidBalance: 0,
      grantPeriod: "2026-08",
      freeGrant: 150,
    });
    expect(parsed.freeBalance).toBe(150);
  });

  it("rejects a malformed grant period", () => {
    expect(() =>
      creditBalanceSchema.parse({
        householdId: "00000000-0000-4000-8000-000000000000",
        freeBalance: 1,
        paidBalance: 0,
        grantPeriod: "August 2026",
        freeGrant: 150,
      }),
    ).toThrow();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @kitchen/contracts exec vitest run src/credits.spec.ts`
Expected: FAIL — cannot resolve `./credits.js`.

- [ ] **Step 3: Add the error code**

In `packages/contracts/src/common.ts`, add `'INSUFFICIENT_CREDITS',` to `errorCodeSchema` immediately after `'QUOTA_EXCEEDED',`, and add `INSUFFICIENT_CREDITS: 402,` to `ERROR_STATUS` immediately after the `QUOTA_EXCEEDED: 429,` line.

402 (Payment Required) rather than 429: the household is not rate-limited, it is out of a purchasable resource, and the client must distinguish "wait" from "buy".

- [ ] **Step 4: Write the implementation**

Create `packages/contracts/src/credits.ts`:

```ts
import { z } from "zod";
import { uuidSchema } from "./common.js";

/**
 * Billable user-facing actions. Credits are priced per *action*, not per AI
 * call: one plan is several gateway calls and is discarded whole if any of them
 * fails, so per-call billing would charge for work that was thrown away.
 *
 * `name.resolve` and `recipe.translate` are deliberately absent — they are
 * internal steps absorbed by the action that triggered them.
 */
export const creditActionSchema = z.enum([
  "pantry.scan",
  "receipt.scan",
  "plan.daily",
  "plan.weekly",
  "plan.monthly",
  "plan.regenerateEntry",
]);
export type CreditAction = z.infer<typeof creditActionSchema>;

/**
 * Credits per action. One credit is roughly $0.0045 of model cost, so these
 * track the real cost ratio: a monthly plan costs ~51x a pantry scan, and a
 * flat "one credit per action" price would be insolvent at that spread.
 *
 * See spec §3. Change these only with the cost table in `ai.constants.ts`.
 */
export const CREDIT_COSTS: Record<CreditAction, number> = {
  "pantry.scan": 1,
  "receipt.scan": 2,
  "plan.daily": 4,
  "plan.weekly": 20,
  "plan.monthly": 50,
  "plan.regenerateEntry": 2,
};

/**
 * Free credits granted each calendar month. Monthly rather than daily because
 * meal planning is bursty — people plan on Sunday — and a daily drip punishes
 * exactly the behaviour the product encourages.
 */
export const FREE_MONTHLY_GRANT = 150;

export interface CreditPack {
  productId: string;
  credits: number;
  priceUsd: number;
}

/** Store SKUs. `productId` must match the App Store / Play Console product id. */
export const CREDIT_PACKS: readonly CreditPack[] = [
  { productId: "credits_300", credits: 300, priceUsd: 4.99 },
];

/** `YYYY-MM`; the month a free balance belongs to. */
export const grantPeriodSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

export const creditBalanceSchema = z.object({
  householdId: uuidSchema,
  freeBalance: z.number().int().nonnegative(),
  /** May be negative after a refund of already-consumed credits. */
  paidBalance: z.number().int(),
  grantPeriod: grantPeriodSchema,
  freeGrant: z.number().int().nonnegative(),
});
export type CreditBalance = z.infer<typeof creditBalanceSchema>;

export const purchaseIntentRequestSchema = z.object({
  productId: z.string().min(1),
});
export type PurchaseIntentRequest = z.infer<typeof purchaseIntentRequestSchema>;

export const purchaseIntentSchema = z.object({
  intentId: uuidSchema,
  productId: z.string(),
  credits: z.number().int().positive(),
});
export type PurchaseIntent = z.infer<typeof purchaseIntentSchema>;

export const confirmPurchaseRequestSchema = z.object({
  intentId: uuidSchema,
  storeTransactionId: z.string().min(1),
  store: z.enum(["apple", "google"]),
});
export type ConfirmPurchaseRequest = z.infer<
  typeof confirmPurchaseRequestSchema
>;
```

Add `export * from './credits.js';` to `packages/contracts/src/index.ts` after the `./ai.js` line.

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @kitchen/contracts exec vitest run src/credits.spec.ts`
Expected: PASS, 7 tests.

- [ ] **Step 6: Build the package and typecheck the workspace**

Run: `pnpm --filter @kitchen/contracts build && pnpm typecheck`
Expected: exit 0. `ERROR_STATUS` is a `Record<ErrorCode, number>`, so a missing status entry is a compile error — this proves you added both.

- [ ] **Step 7: Commit**

```bash
git add packages/contracts/src/credits.ts packages/contracts/src/credits.spec.ts \
        packages/contracts/src/common.ts packages/contracts/src/index.ts
git commit -m "Add credit pricing contracts and INSUFFICIENT_CREDITS"
```

---

### Task 2: Database schema and migration

**Files:**

- Modify: `apps/api/src/db/schema.ts` (add three tables + relations + the export list near line 674)
- Create: `apps/api/drizzle/<generated>.sql` (produced by `pnpm db:generate` — never hand-written)

**Interfaces:**

- Consumes: Task 1's `CreditAction` (only as a text column value; the column is `text`, not a pg enum, so adding an action later needs no migration).
- Produces: Drizzle tables `creditLedger`, `householdCredits`, `creditPurchases`.

- [ ] **Step 1: Add the tables**

In `apps/api/src/db/schema.ts`, after the `aiUsage` table (ends around line 520) and before the Feedback section, add:

```ts
/* ------------------------------------------------------------------ */
/* Credits                                                             */
/* ------------------------------------------------------------------ */

/**
 * Append-only record of every credit movement, mirroring `inventory_events`:
 * `household_credits` is materialised state, this is the truth that explains it.
 *
 * `aiUsageId` ties a spend to the vendor cost it caused, which is what lets
 * "are we covering costs?" be a query rather than a guess.
 */
export const creditLedger = pgTable(
  "credit_ledger",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    /** Signed: positive credits the household, negative debits it. */
    delta: integer("delta").notNull(),
    /** grant | purchase | spend | refund | reversal */
    kind: text("kind").notNull(),
    /** free | paid — which bucket moved. */
    bucket: text("bucket").notNull(),
    /** The `CreditAction` for spends and reversals; null otherwise. */
    action: text("action"),
    aiUsageId: uuid("ai_usage_id").references(() => aiUsage.id, {
      onDelete: "set null",
    }),
    purchaseId: uuid("purchase_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("credit_ledger_household_idx").on(table.householdId, table.createdAt),
  ],
);

/**
 * Materialised balance. `grantPeriod` is the month (`2026-08`) the free balance
 * belongs to: any read compares it to the current month and resets the free
 * bucket if stale, so the monthly grant needs no scheduled job.
 *
 * `paidBalance` is deliberately signed. A refund of already-consumed credits
 * must be able to drive it negative; clamping at zero silently writes off the
 * exact abuse both stores warn about.
 */
export const householdCredits = pgTable("household_credits", {
  householdId: uuid("household_id")
    .primaryKey()
    .references(() => households.id, { onDelete: "cascade" }),
  freeBalance: integer("free_balance").notNull().default(0),
  paidBalance: integer("paid_balance").notNull().default(0),
  grantPeriod: text("grant_period").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * One row per store transaction.
 *
 * `storeTransactionId` is unique because the client confirm call and the
 * RevenueCat webhook both report the same purchase, and webhooks retry — without
 * the constraint a redelivery silently doubles someone's balance. It is
 * nullable only while the row is `pending` (created before the store sheet
 * opens, so a webhook-first delivery can still resolve the household).
 */
export const creditPurchases = pgTable(
  "credit_purchases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** apple | google */
    store: text("store"),
    productId: text("product_id").notNull(),
    storeTransactionId: text("store_transaction_id"),
    credits: integer("credits").notNull(),
    priceUsd: numeric("price_usd", { precision: 10, scale: 2 })
      .notNull()
      .default("0"),
    /** pending | active | refunded */
    status: text("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("credit_purchases_store_txn_key").on(table.storeTransactionId),
    index("credit_purchases_household_idx").on(table.householdId),
  ],
);
```

Add to the export list near line 674 (where `aiUsage, feedback,` appear): `creditLedger,`, `householdCredits,`, `creditPurchases,`.

- [ ] **Step 2: Generate the migration**

Run: `pnpm db:generate`
Expected: a new SQL file in `apps/api/drizzle/`. Open it and confirm it creates all three tables and the unique index `credit_purchases_store_txn_key`.

- [ ] **Step 3: Apply the migration**

Run: `pnpm infra:up && pnpm db:migrate`
Expected: exit 0.

- [ ] **Step 4: Verify the unique index actually rejects duplicates**

Run:

```bash
psql "$DATABASE_URL" -c "\d credit_purchases" | grep store_txn_key
```

Expected: a line showing `credit_purchases_store_txn_key` as UNIQUE. If it is missing, the idempotency guarantee the whole purchase flow rests on does not exist — stop and fix the schema.

Note Postgres treats NULLs as distinct in a unique index, so multiple `pending` rows with a null transaction id coexist correctly.

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @kitchen/api typecheck`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/db/schema.ts apps/api/drizzle/
git commit -m "Add credit ledger, balance and purchase tables"
```

---

### Task 3: CreditsService — balance, lazy grant, atomic debit

**Files:**

- Create: `apps/api/src/credits/credits.service.ts`
- Create: `apps/api/src/credits/credits.module.ts`
- Create: `apps/api/src/credits/credits.spec.ts`

**Interfaces:**

- Consumes: Task 1 (`CREDIT_COSTS`, `FREE_MONTHLY_GRANT`, `CreditAction`, `CreditBalance`), Task 2 (`creditLedger`, `householdCredits`).
- Produces:
  - `CreditsService.balance(householdId): Promise<CreditBalance>`
  - `CreditsService.spend(householdId, action, opts?: { aiUsageId?: string }): Promise<void>` — throws `AppError('INSUFFICIENT_CREDITS', …)`
  - `CreditsService.refund(householdId, action): Promise<void>`
  - `CreditsService.grantPurchase(householdId, credits, purchaseId): Promise<void>`
  - `CreditsModule` exporting `CreditsService`
  - `currentGrantPeriod(now?: Date): string`

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/credits/credits.spec.ts`. These are integration tests against the live Postgres (`pnpm infra:up && pnpm db:migrate` first):

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { CREDIT_COSTS, FREE_MONTHLY_GRANT } from "@kitchen/contracts";
import {
  createTestContext,
  seedHousehold,
  seedUser,
  cleanup,
} from "../testing/harness.js";
import { creditLedger, householdCredits } from "../db/schema.js";
import { CreditsService, currentGrantPeriod } from "./credits.service.js";

const ctx = createTestContext();
const createdHouseholds: string[] = [];
const createdUsers: string[] = [];
let userId: string;
let householdId: string;
let credits: CreditsService;

beforeAll(() => {
  credits = new CreditsService(ctx.db);
});

beforeEach(async () => {
  userId = await seedUser(ctx.db);
  householdId = await seedHousehold(ctx.db, userId);
  createdUsers.push(userId);
  createdHouseholds.push(householdId);
});

// Households are deleted before users: the FK ordering matters.
afterAll(async () => {
  await cleanup(ctx.db, { households: createdHouseholds, users: createdUsers });
  await ctx.client.end();
});

describe("CreditsService", () => {
  it("gives a brand-new household the full free grant", async () => {
    const balance = await credits.balance(householdId);
    expect(balance.freeBalance).toBe(FREE_MONTHLY_GRANT);
    expect(balance.paidBalance).toBe(0);
    expect(balance.grantPeriod).toBe(currentGrantPeriod());
  });

  it("spends free credits first", async () => {
    await credits.grantPurchase(householdId, 300, null);
    await credits.spend(householdId, "pantry.scan");
    const balance = await credits.balance(householdId);
    expect(balance.freeBalance).toBe(
      FREE_MONTHLY_GRANT - CREDIT_COSTS["pantry.scan"],
    );
    expect(balance.paidBalance).toBe(300);
  });

  it("spills into paid credits when free runs short", async () => {
    // Drain free to 2, then spend a 4-credit action.
    await ctx.db
      .update(householdCredits)
      .set({ freeBalance: 2 })
      .where(eq(householdCredits.householdId, householdId));
    await credits.grantPurchase(householdId, 300, null);

    await credits.spend(householdId, "plan.daily");

    const balance = await credits.balance(householdId);
    expect(balance.freeBalance).toBe(0);
    expect(balance.paidBalance).toBe(298);
  });

  it("throws INSUFFICIENT_CREDITS and moves nothing when short", async () => {
    await ctx.db
      .update(householdCredits)
      .set({ freeBalance: 1, paidBalance: 0 })
      .where(eq(householdCredits.householdId, householdId));

    await expect(
      credits.spend(householdId, "plan.monthly"),
    ).rejects.toMatchObject({
      code: "INSUFFICIENT_CREDITS",
      details: { required: 50, balance: 1 },
    });

    const balance = await credits.balance(householdId);
    expect(balance.freeBalance).toBe(1);
  });

  it("resets the free grant when the month rolls over, leaving paid untouched", async () => {
    await credits.grantPurchase(householdId, 300, null);
    await credits.spend(householdId, "plan.weekly");
    await ctx.db
      .update(householdCredits)
      .set({ grantPeriod: "2000-01", freeBalance: 3 })
      .where(eq(householdCredits.householdId, householdId));

    const balance = await credits.balance(householdId);

    expect(balance.freeBalance).toBe(FREE_MONTHLY_GRANT);
    expect(balance.paidBalance).toBe(300);
    expect(balance.grantPeriod).toBe(currentGrantPeriod());
  });

  it("never lets concurrent spends overdraw the balance", async () => {
    await ctx.db
      .update(householdCredits)
      .set({ freeBalance: 10, paidBalance: 0 })
      .where(eq(householdCredits.householdId, householdId));

    // 10 parallel 4-credit spends against a 10-credit balance: exactly 2 win.
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () =>
        credits.spend(householdId, "plan.daily"),
      ),
    );
    const ok = results.filter((r) => r.status === "fulfilled").length;

    expect(ok).toBe(2);
    const balance = await credits.balance(householdId);
    expect(balance.freeBalance).toBe(2);
    expect(balance.paidBalance).toBe(0);
  });

  it("writes an append-only ledger row per movement", async () => {
    await credits.spend(householdId, "pantry.scan");
    await credits.refund(householdId, "pantry.scan");

    const rows = await ctx.db
      .select()
      .from(creditLedger)
      .where(eq(creditLedger.householdId, householdId));

    const kinds = rows.map((r) => r.kind).sort();
    expect(kinds).toEqual(["grant", "reversal", "spend"]);
    expect(rows.find((r) => r.kind === "spend")?.delta).toBe(-1);
    expect(rows.find((r) => r.kind === "reversal")?.delta).toBe(1);
  });

  it("refunds to the same bucket the spend came from", async () => {
    await ctx.db
      .update(householdCredits)
      .set({ freeBalance: 0, paidBalance: 100 })
      .where(eq(householdCredits.householdId, householdId));

    await credits.spend(householdId, "plan.daily");
    await credits.refund(householdId, "plan.daily");

    const balance = await credits.balance(householdId);
    expect(balance.freeBalance).toBe(0);
    expect(balance.paidBalance).toBe(100);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @kitchen/api exec vitest run src/credits/credits.spec.ts`
Expected: FAIL — cannot resolve `./credits.service.js`.

- [ ] **Step 3: Write the implementation**

Create `apps/api/src/credits/credits.service.ts`:

```ts
import { Inject, Injectable } from "@nestjs/common";
import { eq, sql } from "drizzle-orm";
import {
  CREDIT_COSTS,
  FREE_MONTHLY_GRANT,
  type CreditAction,
  type CreditBalance,
} from "@kitchen/contracts";
import { DB, type Database } from "../db/index.js";
import { creditLedger, householdCredits } from "../db/schema.js";
import { AppError } from "../common/errors.js";

/** The transaction-scoped client Drizzle hands to a `db.transaction()` callback. */
type TxClient = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** `YYYY-MM` in UTC — the month a free balance belongs to. */
export function currentGrantPeriod(now: Date = new Date()): string {
  return now.toISOString().slice(0, 7);
}

/**
 * Household credit balances (spec §4, §5).
 *
 * Two buckets: a free grant that resets each calendar month, and a purchased
 * balance that never expires because Apple Guideline 3.1.1 forbids it. Free is
 * always spent first, so a light user never touches what they paid for.
 */
@Injectable()
export class CreditsService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async balance(householdId: string): Promise<CreditBalance> {
    const row = await this.db.transaction((tx) =>
      this.ensureRow(tx, householdId),
    );
    return {
      householdId,
      freeBalance: row.freeBalance,
      paidBalance: row.paidBalance,
      grantPeriod: row.grantPeriod,
      freeGrant: FREE_MONTHLY_GRANT,
    };
  }

  /**
   * Debit `action`'s price, free bucket first.
   *
   * The debit is a single conditional UPDATE rather than a read-then-write:
   * two household members tapping "generate" at once must not both pass a check
   * against a balance that only covers one.
   */
  async spend(
    householdId: string,
    action: CreditAction,
    opts: { aiUsageId?: string } = {},
  ): Promise<void> {
    const cost = CREDIT_COSTS[action];

    await this.db.transaction(async (tx) => {
      const row = await this.ensureRow(tx, householdId);

      const fromFree = Math.min(row.freeBalance, cost);
      const fromPaid = cost - fromFree;

      const [updated] = await tx
        .update(householdCredits)
        .set({
          freeBalance: sql`${householdCredits.freeBalance} - ${fromFree}`,
          paidBalance: sql`${householdCredits.paidBalance} - ${fromPaid}`,
          updatedAt: new Date(),
        })
        .where(
          sql`${householdCredits.householdId} = ${householdId}
              and ${householdCredits.freeBalance} >= ${fromFree}
              and ${householdCredits.paidBalance} >= ${fromPaid}`,
        )
        .returning({ householdId: householdCredits.householdId });

      if (!updated) {
        throw new AppError(
          "INSUFFICIENT_CREDITS",
          "errors.INSUFFICIENT_CREDITS",
          {
            required: cost,
            balance: row.freeBalance + row.paidBalance,
          },
        );
      }

      const rows = [];
      if (fromFree > 0) {
        rows.push({
          householdId,
          delta: -fromFree,
          kind: "spend",
          bucket: "free",
          action,
          ...(opts.aiUsageId ? { aiUsageId: opts.aiUsageId } : {}),
        });
      }
      if (fromPaid > 0) {
        rows.push({
          householdId,
          delta: -fromPaid,
          kind: "spend",
          bucket: "paid",
          action,
          ...(opts.aiUsageId ? { aiUsageId: opts.aiUsageId } : {}),
        });
      }
      if (rows.length > 0) await tx.insert(creditLedger).values(rows);
    });
  }

  /**
   * Return an action's price after the work failed. Refunds to the free bucket
   * first, which mirrors the spend order: a user whose plan job died gets back
   * what they would have had.
   */
  async refund(householdId: string, action: CreditAction): Promise<void> {
    const amount = CREDIT_COSTS[action];

    await this.db.transaction(async (tx) => {
      const row = await this.ensureRow(tx, householdId);
      const toFree = Math.min(FREE_MONTHLY_GRANT - row.freeBalance, amount);
      const toPaid = amount - toFree;

      await tx
        .update(householdCredits)
        .set({
          freeBalance: sql`${householdCredits.freeBalance} + ${toFree}`,
          paidBalance: sql`${householdCredits.paidBalance} + ${toPaid}`,
          updatedAt: new Date(),
        })
        .where(eq(householdCredits.householdId, householdId));

      const rows = [];
      if (toFree > 0) {
        rows.push({
          householdId,
          delta: toFree,
          kind: "reversal",
          bucket: "free",
          action,
        });
      }
      if (toPaid > 0) {
        rows.push({
          householdId,
          delta: toPaid,
          kind: "reversal",
          bucket: "paid",
          action,
        });
      }
      if (rows.length > 0) await tx.insert(creditLedger).values(rows);
    });
  }

  /** Add purchased credits. `credits` may be negative for a refunded purchase. */
  async grantPurchase(
    householdId: string,
    credits: number,
    purchaseId: string | null,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      await this.ensureRow(tx, householdId);
      await tx
        .update(householdCredits)
        .set({
          paidBalance: sql`${householdCredits.paidBalance} + ${credits}`,
          updatedAt: new Date(),
        })
        .where(eq(householdCredits.householdId, householdId));

      await tx.insert(creditLedger).values({
        householdId,
        delta: credits,
        kind: credits >= 0 ? "purchase" : "refund",
        bucket: "paid",
        ...(purchaseId ? { purchaseId } : {}),
      });
    });
  }

  /**
   * Read the balance row, creating it or rolling the monthly grant over as
   * needed, and lock it for the rest of the transaction.
   *
   * `FOR UPDATE` is what serialises concurrent spends: without it two
   * transactions read the same balance and both believe they can afford it.
   */
  private async ensureRow(
    tx: TxClient,
    householdId: string,
  ): Promise<{
    freeBalance: number;
    paidBalance: number;
    grantPeriod: string;
  }> {
    const period = currentGrantPeriod();

    const inserted = await tx
      .insert(householdCredits)
      .values({
        householdId,
        freeBalance: FREE_MONTHLY_GRANT,
        paidBalance: 0,
        grantPeriod: period,
      })
      .onConflictDoNothing()
      .returning({ householdId: householdCredits.householdId });

    // `returning` yields a row only when this call actually created the record,
    // so the opening grant lands exactly once even if two first reads race.
    if (inserted.length > 0) {
      await tx.insert(creditLedger).values({
        householdId,
        delta: FREE_MONTHLY_GRANT,
        kind: "grant",
        bucket: "free",
      });
    }

    const locked = await tx.execute(
      sql`select free_balance, paid_balance, grant_period
          from household_credits
          where household_id = ${householdId}
          for update`,
    );
    const row = locked[0] as
      | { free_balance: number; paid_balance: number; grant_period: string }
      | undefined;
    if (!row) throw new AppError("INTERNAL_ERROR", "errors.INTERNAL_ERROR");

    if (row.grant_period !== period) {
      await tx
        .update(householdCredits)
        .set({
          freeBalance: FREE_MONTHLY_GRANT,
          grantPeriod: period,
          updatedAt: new Date(),
        })
        .where(eq(householdCredits.householdId, householdId));
      await tx.insert(creditLedger).values({
        householdId,
        delta: FREE_MONTHLY_GRANT,
        kind: "grant",
        bucket: "free",
      });
      return {
        freeBalance: FREE_MONTHLY_GRANT,
        paidBalance: row.paid_balance,
        grantPeriod: period,
      };
    }

    return {
      freeBalance: row.free_balance,
      paidBalance: row.paid_balance,
      grantPeriod: row.grant_period,
    };
  }
}
```

The opening `grant` ledger row is written by the `returning`-guarded branch above, and the rollover branch writes one more each time the period changes. The test `writes an append-only ledger row per movement` expects exactly one `grant` row for a fresh household, which this satisfies.

Create `apps/api/src/credits/credits.module.ts`:

```ts
import { Module } from "@nestjs/common";
import { CreditsService } from "./credits.service.js";

@Module({
  providers: [CreditsService],
  exports: [CreditsService],
})
export class CreditsModule {}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @kitchen/api exec vitest run src/credits/credits.spec.ts`
Expected: PASS, 8 tests.

If `never lets concurrent spends overdraw` fails with more than 2 successes, `FOR UPDATE` is not being applied — the whole concurrency guarantee rests on it. Do not "fix" the test by relaxing the assertion.

- [ ] **Step 5: Prove the concurrency test can actually fail**

Temporarily delete `for update` from the `sql` block in `ensureRow`, re-run only that test, and confirm it now fails with more than 2 successes. Restore the line and confirm it passes again.

A concurrency test that passes with and without the lock is testing nothing.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/credits/
git commit -m "Add CreditsService with lazy monthly grant and atomic debits"
```

---

### Task 4: Debit the four action sites

**Files:**

- Modify: `apps/api/src/ai/recognition/recognition.service.ts` (constructor + `recognize`)
- Modify: `apps/api/src/ai/plan/plan.service.ts` (constructor + `regenerateEntry`)
- Modify: `apps/api/src/ai/jobs/jobs.service.ts` (constructor + `enqueuePlan`, `enqueueReceipt`)
- Modify: `apps/api/src/ai/jobs/plan.processor.ts` (refund on failure)
- Modify: `apps/api/src/ai/jobs/receipt.processor.ts` (refund on failure)
- Modify: `apps/api/src/ai/ai.module.ts` (import `CreditsModule`)
- Create: `apps/api/src/credits/credit-debits.spec.ts`

**Interfaces:**

- Consumes: Task 3 (`CreditsService.spend`, `.refund`), Task 1 (`CREDIT_COSTS`, `CreditAction`).
- Produces: `creditActionForScope(scope: PlanScope): CreditAction` exported from `apps/api/src/credits/credit-actions.ts`.

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/credits/credit-debits.spec.ts`:

```ts
import { describe, expect, it } from "vitest";
import { CREDIT_COSTS } from "@kitchen/contracts";
import { creditActionForScope } from "./credit-actions.js";

describe("creditActionForScope", () => {
  it("maps each plan scope to its priced action", () => {
    expect(creditActionForScope("daily")).toBe("plan.daily");
    expect(creditActionForScope("weekly")).toBe("plan.weekly");
    expect(creditActionForScope("monthly")).toBe("plan.monthly");
  });

  it("prices a monthly plan far above a daily one", () => {
    expect(CREDIT_COSTS[creditActionForScope("monthly")]).toBeGreaterThan(
      CREDIT_COSTS[creditActionForScope("daily")] * 10,
    );
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @kitchen/api exec vitest run src/credits/credit-debits.spec.ts`
Expected: FAIL — cannot resolve `./credit-actions.js`.

- [ ] **Step 3: Add the scope mapping**

Create `apps/api/src/credits/credit-actions.ts`:

```ts
import type { CreditAction, PlanScope } from "@kitchen/contracts";

/** A plan's price depends on how many recipes it generates. See spec §3. */
export function creditActionForScope(scope: PlanScope): CreditAction {
  switch (scope) {
    case "daily":
      return "plan.daily";
    case "weekly":
      return "plan.weekly";
    case "monthly":
      return "plan.monthly";
  }
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm --filter @kitchen/api exec vitest run src/credits/credit-debits.spec.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Wire the synchronous debits**

In `recognition.service.ts`, inject `private readonly credits: CreditsService` and, as the **first** statement of `recognize`, before any provider call:

```ts
await this.credits.spend(input.householdId, "pantry.scan");
```

In `plan.service.ts`, inject `CreditsService` and add the same as the first statement of `regenerateEntry`, after `loadPlan` (so a request for someone else's plan 404s rather than being charged):

```ts
await this.credits.spend(householdId, "plan.regenerateEntry");
```

Both are synchronous actions, so this debits up-front and Task 4's job path is what handles refunds. A synchronous failure after the debit is covered by the same `AI_DAILY_BUDGET_USD` breaker that already exists; do not add ad-hoc refunds here.

- [ ] **Step 6: Wire the job debits, respecting idempotency**

In `jobs.service.ts`, inject `CreditsService`. In `enqueuePlan`, the debit must happen **before** `store.create` (so an insufficient balance never creates a job) but must not double-charge a retried `idempotency-key`. Replace the body of `enqueuePlan` with:

```ts
  async enqueuePlan(
    householdId: string,
    payload: PlanJobPayload,
    idempotencyKey: string | null,
  ): Promise<Job> {
    const action = creditActionForScope(payload.request.scope);
    await this.credits.spend(householdId, action);

    let created = false;
    let job;
    try {
      const result = await this.store.create({
        householdId,
        type: 'plan.generate',
        idempotencyKey,
        payload: { ...payload },
      });
      job = result.job;
      created = result.created;
    } catch (error) {
      await this.credits.refund(householdId, action).catch(() => undefined);
      throw error;
    }

    // A replayed idempotency key returns the original job without doing new
    // work, so the credits we just took must go straight back.
    if (!created) {
      await this.credits.refund(householdId, action);
      return toJob(job);
    }

    if (this.planQueue) {
      await this.planQueue.add('generate', { jobId: job.id }, { jobId: job.id });
    }
    return toJob(job);
  }
```

Apply the identical shape to `enqueueReceipt` using the action `'receipt.scan'` and the receipt queue.

- [ ] **Step 7: Refund on job failure**

In `plan.processor.ts`, inside the existing `catch (err)` block, immediately before `await this.store.markFailed(...)`:

```ts
await this.credits
  .refund(job.householdId, creditActionForScope(payload.request.scope))
  .catch((refundError) =>
    this.logger.error(
      `job ${jobId} credit refund failed: ${String(refundError)}`,
    ),
  );
```

Apply the same in `receipt.processor.ts` with `'receipt.scan'`.

The refund is best-effort and logged rather than thrown: a refund failure must not replace the original job error, which is what the client is waiting to see.

- [ ] **Step 8: Wire the module**

In `apps/api/src/ai/ai.module.ts`, add `CreditsModule` to the `imports` array. Import it as a **value** (`import { CreditsModule } from '../credits/credits.module.js';`) — never `import type`, which typechecks and lints cleanly but throws at boot.

- [ ] **Step 9: Run the affected suites**

Run: `pnpm --filter @kitchen/api exec vitest run src/credits src/ai`
Expected: PASS. Existing AI specs that construct these services now need a `CreditsService`; where a spec uses a fake, pass a stub with `spend: async () => {}` and `refund: async () => {}`.

- [ ] **Step 10: Commit**

```bash
git add apps/api/src/credits/ apps/api/src/ai/
git commit -m "Debit credits at the four user-facing action sites"
```

---

### Task 5: Credits API routes

**Files:**

- Modify: `packages/contracts/src/routes.ts` (add three routes)
- Create: `apps/api/src/credits/credits.controller.ts`
- Modify: `apps/api/src/credits/credits.module.ts` (register the controller)
- Create: `apps/api/src/credits/credits.controller.spec.ts`
- Modify: `packages/i18n/src/en.ts`, `packages/i18n/src/ar.ts` (`errors.INSUFFICIENT_CREDITS`)

**Interfaces:**

- Consumes: Tasks 1 and 3.
- Produces: routes `getCredits` (`GET /credits`), `createPurchaseIntent` (`POST /credits/intents`), `confirmPurchase` (`POST /credits/purchases`).

- [ ] **Step 1: Add the i18n keys**

In `packages/i18n/src/en.ts`, in the `errors` object after `QUOTA_EXCEEDED`:

```ts
    INSUFFICIENT_CREDITS: "You don't have enough credits for this. Top up to keep cooking.",
```

In `packages/i18n/src/ar.ts`, same position:

```ts
    INSUFFICIENT_CREDITS: 'ليس لديك رصيد كافٍ لهذه العملية. أضف رصيداً لمواصلة الطبخ.',
```

`ar.ts` is typed against `en.ts`, so omitting the Arabic key is a build error, not a silent gap.

- [ ] **Step 2: Add the routes**

In `packages/contracts/src/routes.ts`, after the Usage block, add:

```ts
  /* ---------------- Credits ---------------- */
  getCredits: {
    method: 'GET',
    path: '/credits',
    auth: true,
    household: true,
    response: creditBalanceSchema,
  },
  createPurchaseIntent: {
    method: 'POST',
    path: '/credits/intents',
    auth: true,
    household: true,
    body: purchaseIntentRequestSchema,
    response: purchaseIntentSchema,
  },
  confirmPurchase: {
    method: 'POST',
    path: '/credits/purchases',
    auth: true,
    household: true,
    body: confirmPurchaseRequestSchema,
    response: creditBalanceSchema,
  },
```

Import the four schemas at the top of the file from `./credits.js`.

- [ ] **Step 3: Write the failing controller test**

Create `apps/api/src/credits/credits.controller.spec.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { FREE_MONTHLY_GRANT } from "@kitchen/contracts";
import { CreditsController } from "./credits.controller.js";

const household = { id: "00000000-0000-4000-8000-000000000000" } as never;

describe("CreditsController", () => {
  it("returns the household balance", async () => {
    const service = {
      balance: vi.fn().mockResolvedValue({
        householdId: household.id,
        freeBalance: FREE_MONTHLY_GRANT,
        paidBalance: 0,
        grantPeriod: "2026-08",
        freeGrant: FREE_MONTHLY_GRANT,
      }),
    };
    const controller = new CreditsController(service as never, {} as never);

    const result = await controller.balance(household);

    expect(result.freeBalance).toBe(FREE_MONTHLY_GRANT);
    expect(service.balance).toHaveBeenCalledWith(household.id);
  });
});
```

- [ ] **Step 4: Run it to verify it fails**

Run: `pnpm --filter @kitchen/api exec vitest run src/credits/credits.controller.spec.ts`
Expected: FAIL — cannot resolve `./credits.controller.js`.

- [ ] **Step 5: Write the controller**

Create `apps/api/src/credits/credits.controller.ts`:

```ts
import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import {
  confirmPurchaseRequestSchema,
  purchaseIntentRequestSchema,
  type ConfirmPurchaseRequest,
  type CreditBalance,
  type PurchaseIntent,
  type PurchaseIntentRequest,
} from "@kitchen/contracts";
import { ZodPipe } from "../common/http.js";
import { AuthGuard } from "../common/auth.guard.js";
import { HouseholdGuard } from "../common/household.guard.js";
import { CurrentUser } from "../common/current-user.decorator.js";
import { CurrentHousehold } from "../common/current-household.decorator.js";
import type { AuthUser, HouseholdContext } from "../common/request-context.js";
import { CreditsService } from "./credits.service.js";
import { PurchaseService } from "./purchase.service.js";

/** Household credit balance and purchases (spec §5, §6). */
@Controller()
@UseGuards(AuthGuard, HouseholdGuard)
export class CreditsController {
  constructor(
    private readonly credits: CreditsService,
    private readonly purchases: PurchaseService,
  ) {}

  @Get("credits")
  balance(
    @CurrentHousehold() household: HouseholdContext,
  ): Promise<CreditBalance> {
    return this.credits.balance(household.id);
  }

  @Post("credits/intents")
  createIntent(
    @CurrentHousehold() household: HouseholdContext,
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(purchaseIntentRequestSchema)) body: PurchaseIntentRequest,
  ): Promise<PurchaseIntent> {
    return this.purchases.createIntent(
      household.id,
      user.userId,
      body.productId,
    );
  }

  @Post("credits/purchases")
  confirm(
    @CurrentHousehold() household: HouseholdContext,
    @Body(new ZodPipe(confirmPurchaseRequestSchema))
    body: ConfirmPurchaseRequest,
  ): Promise<CreditBalance> {
    return this.purchases.confirm(household.id, body);
  }
}
```

Confirm `AuthUser`'s id field name in `apps/api/src/common/request-context.ts` before using `user.userId` — match that file rather than assuming.

Register `CreditsController` in `credits.module.ts` under `controllers: [CreditsController]`, add `PurchaseService` to `providers`, and register `CreditsModule` in `app.module.ts`.

`PurchaseService` is built in Task 6. To keep this task independently testable, create a minimal stub now with both methods throwing `new AppError('INTERNAL_ERROR')`, and replace it in Task 6.

- [ ] **Step 6: Run it to verify it passes**

Run: `pnpm --filter @kitchen/api exec vitest run src/credits/`
Expected: PASS.

- [ ] **Step 7: Verify the app still boots**

Run: `pnpm --filter @kitchen/api exec vitest run src/testing/staff-routes.spec.ts`
Expected: PASS. This is the only spec that compiles the real `AppModule`, so it is what catches a DI wiring mistake.

- [ ] **Step 8: Commit**

```bash
git add packages/contracts/src/routes.ts packages/i18n/src/ apps/api/src/credits/ apps/api/src/app.module.ts
git commit -m "Add credits routes, controller and error copy"
```

---

### Task 6: Purchases — intent, verification, webhook

**Files:**

- Create: `apps/api/src/credits/purchase.service.ts` (replacing Task 5's stub)
- Create: `apps/api/src/credits/payment-verifier.ts` (port + `PAYMENT_VERIFIER` token + mock)
- Create: `apps/api/src/credits/revenuecat.verifier.ts`
- Create: `apps/api/src/credits/webhook.controller.ts`
- Create: `apps/api/src/credits/purchase.spec.ts`
- Modify: `apps/api/src/config/env.ts` (`PAYMENTS_MOCK`, `REVENUECAT_API_KEY`, `REVENUECAT_WEBHOOK_SECRET`)
- Modify: `.env.example`

**Interfaces:**

- Consumes: Tasks 1, 3, 5.
- Produces: `PurchaseService.createIntent(householdId, userId, productId)`, `PurchaseService.confirm(householdId, body)`, `PurchaseService.applyWebhook(event)`, `PAYMENT_VERIFIER`, `PaymentVerifier`.

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/credits/purchase.spec.ts`. The decisive test is that crediting is idempotent across both paths:

```ts
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  createTestContext,
  seedHousehold,
  seedUser,
  cleanup,
} from "../testing/harness.js";
import { creditPurchases } from "../db/schema.js";
import { CreditsService } from "./credits.service.js";
import { PurchaseService } from "./purchase.service.js";
import { MockPaymentVerifier } from "./payment-verifier.js";

const ctx = createTestContext();
const createdHouseholds: string[] = [];
const createdUsers: string[] = [];
let userId: string;
let householdId: string;
let credits: CreditsService;
let purchases: PurchaseService;

beforeEach(async () => {
  userId = await seedUser(ctx.db);
  householdId = await seedHousehold(ctx.db, userId);
  createdUsers.push(userId);
  createdHouseholds.push(householdId);
  credits = new CreditsService(ctx.db);
  purchases = new PurchaseService(ctx.db, credits, new MockPaymentVerifier());
});

afterAll(async () => {
  await cleanup(ctx.db, { households: createdHouseholds, users: createdUsers });
  await ctx.client.end();
});

describe("PurchaseService", () => {
  it("credits a confirmed purchase once", async () => {
    const intent = await purchases.createIntent(
      householdId,
      userId,
      "credits_300",
    );
    const balance = await purchases.confirm(householdId, {
      intentId: intent.intentId,
      storeTransactionId: "txn-1",
      store: "apple",
    });
    expect(balance.paidBalance).toBe(300);
  });

  it("is idempotent when the same transaction arrives twice", async () => {
    const intent = await purchases.createIntent(
      householdId,
      userId,
      "credits_300",
    );
    await purchases.confirm(householdId, {
      intentId: intent.intentId,
      storeTransactionId: "txn-2",
      store: "apple",
    });
    await purchases.confirm(householdId, {
      intentId: intent.intentId,
      storeTransactionId: "txn-2",
      store: "apple",
    });

    const balance = await credits.balance(householdId);
    expect(balance.paidBalance).toBe(300);
  });

  it("is idempotent when the webhook races the confirm call", async () => {
    const intent = await purchases.createIntent(
      householdId,
      userId,
      "credits_300",
    );
    await Promise.all([
      purchases.confirm(householdId, {
        intentId: intent.intentId,
        storeTransactionId: "txn-3",
        store: "apple",
      }),
      purchases.applyWebhook({
        type: "INITIAL_PURCHASE",
        intentId: intent.intentId,
        storeTransactionId: "txn-3",
        productId: "credits_300",
        store: "apple",
      }),
    ]);

    const balance = await credits.balance(householdId);
    expect(balance.paidBalance).toBe(300);
  });

  it("resolves the household from the intent when only the webhook arrives", async () => {
    const intent = await purchases.createIntent(
      householdId,
      userId,
      "credits_300",
    );
    await purchases.applyWebhook({
      type: "INITIAL_PURCHASE",
      intentId: intent.intentId,
      storeTransactionId: "txn-4",
      productId: "credits_300",
      store: "apple",
    });

    const balance = await credits.balance(householdId);
    expect(balance.paidBalance).toBe(300);
  });

  it("drives the balance negative when consumed credits are refunded", async () => {
    const intent = await purchases.createIntent(
      householdId,
      userId,
      "credits_300",
    );
    await purchases.confirm(householdId, {
      intentId: intent.intentId,
      storeTransactionId: "txn-5",
      store: "apple",
    });

    // Drain both buckets, then refund the purchase.
    for (let i = 0; i < 9; i += 1)
      await credits.spend(householdId, "plan.monthly");

    await purchases.applyWebhook({
      type: "CANCELLATION",
      intentId: intent.intentId,
      storeTransactionId: "txn-5",
      productId: "credits_300",
      store: "apple",
    });

    const balance = await credits.balance(householdId);
    expect(balance.paidBalance).toBeLessThan(0);

    const [row] = await ctx.db
      .select()
      .from(creditPurchases)
      .where(eq(creditPurchases.storeTransactionId, "txn-5"));
    expect(row?.status).toBe("refunded");
  });

  it("rejects an unknown product", async () => {
    await expect(
      purchases.createIntent(householdId, userId, "credits_9999"),
    ).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm --filter @kitchen/api exec vitest run src/credits/purchase.spec.ts`
Expected: FAIL — cannot resolve `./purchase.service.js`.

- [ ] **Step 3: Write the verifier port**

Create `apps/api/src/credits/payment-verifier.ts`:

```ts
export interface VerifiedPurchase {
  storeTransactionId: string;
  productId: string;
  valid: boolean;
}

/**
 * Port for store receipt verification, so the system runs offline and free with
 * no RevenueCat account — the same shape as the AI providers behind `AI_MOCK`.
 */
export interface PaymentVerifier {
  verify(
    storeTransactionId: string,
    productId: string,
  ): Promise<VerifiedPurchase>;
}

export const PAYMENT_VERIFIER = Symbol("PAYMENT_VERIFIER");

export class MockPaymentVerifier implements PaymentVerifier {
  async verify(
    storeTransactionId: string,
    productId: string,
  ): Promise<VerifiedPurchase> {
    return { storeTransactionId, productId, valid: true };
  }
}
```

Create `apps/api/src/credits/revenuecat.verifier.ts` calling RevenueCat's REST API with `REVENUECAT_API_KEY`, returning `valid: false` on any non-2xx or mismatched product id. Follow the bounded-fetch pattern in `apps/api/src/ai/providers/gemini.provider.ts`: a shared `AbortSignal.timeout`, the fetch inside the try, and a non-OK response raising `AppError('EXTERNAL_SERVICE_ERROR', …)` rather than being parsed as success.

- [ ] **Step 4: Write PurchaseService**

Create `apps/api/src/credits/purchase.service.ts`:

```ts
import { Inject, Injectable } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import {
  CREDIT_PACKS,
  type ConfirmPurchaseRequest,
  type CreditBalance,
  type PurchaseIntent,
} from "@kitchen/contracts";
import { DB, type Database } from "../db/index.js";
import { creditPurchases } from "../db/schema.js";
import { AppError } from "../common/errors.js";
import { CreditsService } from "./credits.service.js";
import { PAYMENT_VERIFIER, type PaymentVerifier } from "./payment-verifier.js";

export interface WebhookEvent {
  type: string;
  intentId: string;
  storeTransactionId: string;
  productId: string;
  store: "apple" | "google";
}

const PURCHASE_EVENTS = new Set(["INITIAL_PURCHASE", "NON_RENEWING_PURCHASE"]);
const REFUND_EVENTS = new Set(["CANCELLATION", "REFUND"]);

/**
 * Credit purchases (spec §6).
 *
 * A purchase reaches us twice — once from the client's confirm call and once
 * from the RevenueCat webhook — and webhooks retry. Every crediting path
 * therefore *claims* the pending row with a conditional UPDATE and credits only
 * if it won the claim, so the second arrival is a no-op rather than a doubled
 * balance.
 */
@Injectable()
export class PurchaseService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly credits: CreditsService,
    @Inject(PAYMENT_VERIFIER) private readonly verifier: PaymentVerifier,
  ) {}

  /**
   * Record the intent *before* the store sheet opens. A webhook identifies a
   * user, but credits belong to a household and a user may be in several — this
   * row is what lets a webhook-first delivery resolve the right one.
   */
  async createIntent(
    householdId: string,
    userId: string,
    productId: string,
  ): Promise<PurchaseIntent> {
    const pack = CREDIT_PACKS.find((p) => p.productId === productId);
    if (!pack) {
      throw new AppError("VALIDATION_FAILED", "errors.VALIDATION_FAILED", {
        productId,
      });
    }

    const [row] = await this.db
      .insert(creditPurchases)
      .values({
        householdId,
        userId,
        productId,
        credits: pack.credits,
        priceUsd: pack.priceUsd.toFixed(2),
        status: "pending",
      })
      .returning({ id: creditPurchases.id });
    if (!row) throw new AppError("INTERNAL_ERROR", "errors.INTERNAL_ERROR");

    return { intentId: row.id, productId, credits: pack.credits };
  }

  async confirm(
    householdId: string,
    body: ConfirmPurchaseRequest,
  ): Promise<CreditBalance> {
    const intent = await this.loadIntent(householdId, body.intentId);

    const verified = await this.verifier.verify(
      body.storeTransactionId,
      intent.productId,
    );
    if (!verified.valid) {
      throw new AppError("VALIDATION_FAILED", "errors.VALIDATION_FAILED", {
        storeTransactionId: body.storeTransactionId,
      });
    }

    await this.claimAndCredit(
      intent.id,
      intent.householdId,
      intent.credits,
      body.storeTransactionId,
      body.store,
    );
    return this.credits.balance(householdId);
  }

  async applyWebhook(event: WebhookEvent): Promise<void> {
    const [intent] = await this.db
      .select()
      .from(creditPurchases)
      .where(eq(creditPurchases.id, event.intentId));
    // An unknown intent is not an error: RevenueCat replays old events.
    if (!intent) return;

    if (PURCHASE_EVENTS.has(event.type)) {
      await this.claimAndCredit(
        intent.id,
        intent.householdId,
        intent.credits,
        event.storeTransactionId,
        event.store,
      );
      return;
    }

    if (REFUND_EVENTS.has(event.type)) {
      const claimed = await this.db
        .update(creditPurchases)
        .set({ status: "refunded" })
        .where(
          and(
            eq(creditPurchases.id, intent.id),
            eq(creditPurchases.status, "active"),
          ),
        )
        .returning({ id: creditPurchases.id });

      // Only the first refund event debits, and it may drive the balance
      // negative — the credits are already spent and that is the honest record.
      if (claimed.length > 0) {
        await this.credits.grantPurchase(
          intent.householdId,
          -intent.credits,
          intent.id,
        );
      }
    }
  }

  /**
   * Move `pending` → `active` and credit only if this call performed the
   * transition. Two concurrent arrivals both reach the UPDATE; exactly one
   * matches `status = 'pending'` and the loser credits nothing.
   */
  private async claimAndCredit(
    id: string,
    householdId: string,
    credits: number,
    storeTransactionId: string,
    store: "apple" | "google",
  ): Promise<void> {
    const claimed = await this.db
      .update(creditPurchases)
      .set({ status: "active", storeTransactionId, store })
      .where(
        and(eq(creditPurchases.id, id), eq(creditPurchases.status, "pending")),
      )
      .returning({ id: creditPurchases.id });

    if (claimed.length === 0) return;
    await this.credits.grantPurchase(householdId, credits, id);
  }

  private async loadIntent(householdId: string, intentId: string) {
    const [row] = await this.db
      .select()
      .from(creditPurchases)
      .where(
        and(
          eq(creditPurchases.id, intentId),
          eq(creditPurchases.householdId, householdId),
        ),
      );
    if (!row) throw AppError.notFound("errors.NOT_FOUND");
    return row;
  }
}
```

- [ ] **Step 5: Write the webhook controller**

Create `apps/api/src/credits/webhook.controller.ts` exposing `POST /webhooks/revenuecat`. It must **not** use `AuthGuard`/`HouseholdGuard` (the caller is RevenueCat, not a user). It must compare the `Authorization` header against `REVENUECAT_WEBHOOK_SECRET` using `crypto.timingSafeEqual` and throw `AppError.unauthenticated()` on mismatch.

An unauthenticated caller must never be able to move a balance. Add a test asserting a wrong secret returns 401 and does not change the balance.

- [ ] **Step 6: Add env vars**

In `apps/api/src/config/env.ts`:

```ts
  PAYMENTS_MOCK: z.coerce.boolean().default(true),
  REVENUECAT_API_KEY: z.string().default(''),
  REVENUECAT_WEBHOOK_SECRET: z.string().default(''),
```

Add a production guard matching the existing style: when `NODE_ENV === 'production'` and `PAYMENTS_MOCK` is false, both `REVENUECAT_API_KEY` and `REVENUECAT_WEBHOOK_SECRET` must be non-empty. Select the verifier in `credits.module.ts` with a `useFactory` on `PAYMENT_VERIFIER`, mirroring `createAiProvider` in `ai.module.ts`. Document all three in `.env.example`.

- [ ] **Step 7: Run the tests**

Run: `pnpm --filter @kitchen/api exec vitest run src/credits/`
Expected: PASS.

- [ ] **Step 8: Prove the idempotency test bites**

Temporarily change `confirm` to call `grantPurchase` unconditionally instead of only on a won claim. Re-run — the two idempotency tests must fail. Restore and confirm they pass.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/credits/ apps/api/src/config/env.ts .env.example
git commit -m "Add credit purchases with idempotent confirm and webhook paths"
```

---

### Task 7: Web — balance and out-of-credits

**Files:**

- Create: `apps/web/src/components/credit-balance.tsx`
- Create: `apps/web/src/hooks/use-credits.ts`
- Modify: `apps/web/src/mocks/db.ts` and the handlers file (resolvers for the three new routes)
- Modify: `apps/web/src/app/(app)/settings/page.tsx` (show the balance)
- Modify: `packages/i18n/src/web.en.ts`, `web.ar.ts`
- Create: `apps/web/src/components/credit-balance.test.tsx`

**Interfaces:**

- Consumes: Tasks 1 and 5.
- Produces: `useCredits()` returning the TanStack Query result for `getCredits`; `<CreditBalance />`.

- [ ] **Step 1: Add MSW resolvers**

`apps/web/src/mocks/coverage.spec.ts` fails when a route has no resolver, so add handlers for `getCredits`, `createPurchaseIntent` and `confirmPurchase` backed by a mock balance in `db.ts` seeded to `{ freeBalance: 150, paidBalance: 0, grantPeriod: <current>, freeGrant: 150 }`.

- [ ] **Step 2: Write the failing component test**

Create `apps/web/src/components/credit-balance.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CreditBalance } from "./credit-balance";

describe("CreditBalance", () => {
  it("shows the combined balance", () => {
    render(
      <CreditBalance freeBalance={120} paidBalance={300} freeGrant={150} />,
    );
    expect(screen.getByText("420")).toBeInTheDocument();
  });

  it("warns when the balance cannot cover a monthly plan", () => {
    render(<CreditBalance freeBalance={10} paidBalance={0} freeGrant={150} />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("does not warn when the balance is comfortable", () => {
    render(<CreditBalance freeBalance={150} paidBalance={0} freeGrant={150} />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `pnpm --filter @kitchen/web exec vitest run src/components/credit-balance.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement the hook and component**

Create `apps/web/src/hooks/use-credits.ts`:

```ts
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useMocksReady } from "./use-mocks-ready";

export function useCredits() {
  const ready = useMocksReady();
  return useQuery({
    queryKey: ["credits"],
    queryFn: () => api.call("getCredits"),
    enabled: ready,
  });
}
```

Match the surrounding file's import of `useMocksReady` — copy the specifier used by `apps/web/src/hooks/settings.ts` rather than assuming the path above.

Create `apps/web/src/components/credit-balance.tsx`:

```tsx
"use client";

import { CREDIT_COSTS } from "@kitchen/contracts";
import { useTranslation } from "@/lib/i18n";
import { useCredits } from "@/hooks/use-credits";

export function CreditBalance() {
  const { t } = useTranslation();
  const { data, isLoading } = useCredits();

  if (isLoading || !data) {
    return <p className="text-sm text-muted">{t("web.credits.loading")}</p>;
  }

  const total = data.freeBalance + data.paidBalance;
  const coversMonthly = total >= CREDIT_COSTS["plan.monthly"];

  return (
    <section className="rounded-lg bg-surface-soft p-4 text-start">
      <h2 className="text-sm font-medium text-primary-text">
        {t("web.credits.title")}
      </h2>
      <p className="mt-1 text-2xl font-semibold text-primary-text">
        {t("web.credits.total", { count: total })}
      </p>
      <p className="mt-1 text-sm text-muted">
        {t("web.credits.split", {
          free: data.freeBalance,
          paid: data.paidBalance,
        })}
      </p>
      <p className="mt-1 text-sm text-muted">{t("web.credits.resets")}</p>
      {!coversMonthly ? (
        <p role="status" className="mt-3 text-sm text-warning-text">
          {t("web.credits.belowMonthly")}
        </p>
      ) : null}
      <p className="mt-3 text-sm text-muted">{t("web.credits.buyOnMobile")}</p>
    </section>
  );
}
```

Copy the translation-hook import and the token class names from a neighbouring component — `text-muted`, `bg-surface-soft` and `text-warning-text` must be **real** tokens in `apps/web/src/app/globals.css`. If a name differs there, use the file's name; do not add a new token and do not fall back to a hex literal.

Constraints that `src/lib/token-usage.test.ts` enforces: logical properties only (`ms-*`, `pe-*`, `text-start`), no hex literals, no opacity tints such as `bg-primary/8` (use a solid `*-soft` token), and aubergine text is `text-primary-text` — never `text-primary`.

Add the strings to `web.en.ts`/`web.ar.ts` only; those namespaces are web-owned and `ar.ts` is typed against `en.ts`, so a missing Arabic key is a build error.

Web does **not** offer purchase (spec §9): it shows the balance and points at the mobile app.

- [ ] **Step 5: Remove the superseded USD hook**

Spec §7 moves clients off raw USD. `useAiUsage` in `apps/web/src/hooks/settings.ts` has **no consumers** on web — confirm that with `grep -rn "useAiUsage" apps/web/src` and, if the only hit is its own definition, delete the hook. Leave the `getAiUsage` route and its MSW resolver in place: the route still serves operators, and `coverage.spec.ts` requires the resolver.

- [ ] **Step 6: Run the tests**

Run: `pnpm --filter @kitchen/web exec vitest run`
Expected: PASS, including `coverage.spec.ts` and `src/lib/token-usage.test.ts`.

- [ ] **Step 7: Verify RTL in the browser**

Start the dev server (`WEB_PORT=3200 pnpm --filter @kitchen/web dev`) and use Playwright to open `/settings`, switch to Arabic, and confirm the balance block mirrors: the sidebar moves right and no value is clipped.

Port 3100 may be occupied by another project on this machine — check before assuming.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src packages/i18n/src/web.*.ts
git commit -m "Show the credit balance on web"
```

---

### Task 8: Mobile — balance, gating and IAP purchase

**Files:**

- Create: `apps/mobile/src/lib/credits.ts` (pure helpers)
- Create: `apps/mobile/src/lib/credits.spec.ts`
- Create: `apps/mobile/src/components/CreditBalance.tsx`
- Create: `apps/mobile/src/screens/BuyCreditsScreen.tsx`
- Modify: the mobile MSW handlers
- Modify: `packages/i18n/src/mobile.en.ts`, `mobile.ar.ts`
- Modify: `apps/mobile/package.json` (add `react-native-purchases`)

**Interfaces:**

- Consumes: Tasks 1 and 5.
- Produces: `canAfford(balance, action): boolean`, `creditsShort(balance, action): number`.

- [ ] **Step 1: Write the failing tests**

Mobile specs are pure logic only — no native render harness. Create `apps/mobile/src/lib/credits.spec.ts`:

```ts
import { describe, expect, it } from "vitest";
import { canAfford, creditsShort } from "./credits";

const balance = {
  freeBalance: 10,
  paidBalance: 5,
  grantPeriod: "2026-08",
  freeGrant: 150,
};

describe("credit helpers", () => {
  it("affords an action within the combined balance", () => {
    expect(canAfford(balance, "plan.daily")).toBe(true);
  });

  it("does not afford an action beyond it", () => {
    expect(canAfford(balance, "plan.monthly")).toBe(false);
  });

  it("reports how many credits are missing", () => {
    expect(creditsShort(balance, "plan.monthly")).toBe(35);
  });

  it("reports zero short when affordable", () => {
    expect(creditsShort(balance, "pantry.scan")).toBe(0);
  });

  it("treats a negative paid balance as reducing what is affordable", () => {
    expect(canAfford({ ...balance, paidBalance: -8 }, "plan.daily")).toBe(
      false,
    );
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm --filter @kitchen/mobile exec vitest run src/lib/credits.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the helpers**

```ts
import { CREDIT_COSTS, type CreditAction } from "@kitchen/contracts";

interface BalanceLike {
  freeBalance: number;
  paidBalance: number;
}

export function canAfford(balance: BalanceLike, action: CreditAction): boolean {
  return balance.freeBalance + balance.paidBalance >= CREDIT_COSTS[action];
}

export function creditsShort(
  balance: BalanceLike,
  action: CreditAction,
): number {
  const total = balance.freeBalance + balance.paidBalance;
  return Math.max(0, CREDIT_COSTS[action] - total);
}
```

- [ ] **Step 4: Run them to verify they pass**

Run: `pnpm --filter @kitchen/mobile exec vitest run src/lib/credits.spec.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Add the purchase flow**

Install with `pnpm --filter @kitchen/mobile add react-native-purchases`. Do **not** use `expo-in-app-purchases` — it is deprecated.

Create `apps/mobile/src/lib/purchase.ts` — the flow, kept out of the component so it stays testable:

```ts
import Purchases, { type PurchasesPackage } from "react-native-purchases";
import { api } from "./api";

export type PurchaseOutcome =
  { status: "credited" } | { status: "pending" } | { status: "cancelled" };

/**
 * Buy a credit pack (spec §6).
 *
 * The intent is created *before* the store sheet so a webhook-first delivery can
 * still resolve the household. If our confirm call fails after the store has
 * charged the card, the outcome is `pending`, not an error: the RevenueCat
 * webhook is the backstop and both paths are idempotent server-side.
 */
export async function buyCredits(
  productId: string,
  pkg: PurchasesPackage,
): Promise<PurchaseOutcome> {
  const intent = await api.call("createPurchaseIntent", {
    body: { productId },
  });

  let storeTransactionId: string;
  try {
    const result = await Purchases.purchasePackage(pkg);
    storeTransactionId = result.customerInfo.originalPurchaseDate
      ? (result.transaction?.transactionIdentifier ?? "")
      : "";
    if (!storeTransactionId) return { status: "pending" };
  } catch (error) {
    if ((error as { userCancelled?: boolean }).userCancelled)
      return { status: "cancelled" };
    throw error;
  }

  try {
    await api.call("confirmPurchase", {
      body: { intentId: intent.intentId, storeTransactionId, store: "apple" },
    });
    return { status: "credited" };
  } catch {
    // The charge succeeded; only our confirmation did not land.
    return { status: "pending" };
  }
}
```

Read `react-native-purchases`' current result shape from its types when wiring `storeTransactionId` and the `store` value — derive `store` from the running platform (`Platform.OS === 'ios' ? 'apple' : 'google'`) rather than hard-coding `'apple'` as sketched above.

`BuyCreditsScreen` calls `buyCredits`, then on `credited` invalidates the credits query key and on `pending` shows a "we'll finish this shortly" message — never an error. Telling a paying user their purchase failed when it succeeded is the worst outcome in this flow. On `cancelled`, return silently.

Show the credit cost before any action priced above `CREDIT_COSTS['plan.daily']`, and render an out-of-credits state naming what is needed versus held, using `creditsShort`.

Use `marginStart`/`paddingStart` style keys only — ESLint rejects `marginLeft`, `left`, `borderRightColor`. Add strings to `mobile.en.ts`/`mobile.ar.ts` only.

- [ ] **Step 6: Convert the AI usage screen to credits**

Spec §7 moves clients off raw USD. `apps/mobile/src/app/ai-usage.tsx` currently renders `useAiUsage()` (dollars and the daily budget). Change it to render the credit balance — total, free/paid split, when the free grant resets — and link to `BuyCreditsScreen`.

Keep the `getAiUsage` route and its mock resolver: the route still serves operators and the mobile `coverage` check needs the resolver. Only the screen changes.

- [ ] **Step 7: Run the mobile suite and lint**

Run: `pnpm --filter @kitchen/mobile exec vitest run && pnpm --filter @kitchen/mobile lint`
Expected: exit 0. The lint step is what catches physical-direction style keys.

- [ ] **Step 8: Commit**

```bash
git add apps/mobile packages/i18n/src/mobile.*.ts pnpm-lock.yaml
git commit -m "Add credit balance, gating and IAP purchase on mobile"
```

Commit `pnpm-lock.yaml` — CI installs with `--frozen-lockfile` and an uncommitted lockfile breaks the build.

---

### Task 9: Whole-workspace gate

**Files:** none — this task only verifies.

- [ ] **Step 1: Build**

Run: `pnpm build`
Expected: exit 0.

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: exit 0.

- [ ] **Step 3: Lint**

Run: `pnpm lint`
Expected: exit 0.

- [ ] **Step 4: Test**

Run: `pnpm test`
Expected: exit 0. Record the per-package counts; the API baseline before this plan was 399.

- [ ] **Step 5: Confirm the tree is clean**

Run: `git status --short`
Expected: empty. If `pnpm-lock.yaml` is modified, commit it.

- [ ] **Step 6: Commit only if something needed fixing**

If steps 1–4 required changes, commit them. Otherwise this task produces no commit.

---

## Manual verification gates

These cannot be automated and must be done before shipping:

1. **Sandbox purchase on a real device.** App Store Connect sandbox account, buy `credits_300`, confirm the balance rises by exactly 300 and a `credit_purchases` row lands with `status='active'`.
2. **Webhook-only delivery.** Kill the app between the store sheet and the confirm call; confirm the webhook still credits the right household.
3. **Refund clawback.** Refund the sandbox purchase and confirm `paid_balance` goes negative rather than clamping.
4. **App Store Connect / Play Console setup** — Paid Applications Agreement, banking and tax forms, and the `credits_300` SKU on both stores. This is calendar time no code can shorten.
5. **The model-routing cost gate** (`docs/superpowers/specs/2026-08-11-model-routing-design.md`), because every credit price in §3 derives from estimated token counts. If measured cost diverges materially, revise `CREDIT_COSTS`.
