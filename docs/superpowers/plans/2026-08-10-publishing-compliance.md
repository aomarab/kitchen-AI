# Publishing Compliance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship in-app account deletion with household succession and Sign in with Apple token revocation, plus the store paperwork, so the app can be submitted to the App Store and Google Play.

**Architecture:** A new `DELETE /me` route re-authenticates the user, best-effort revokes their Apple token *outside* the database transaction, then deletes the user inside one transaction that first hands each shared household to its longest-standing member. Apple's token endpoints sit behind a `Mock`/`Http` adapter pair on a DI token, defaulting to the mock so the system still runs offline and free.

**Tech Stack:** NestJS + Drizzle + PostgreSQL (API), Next.js + TanStack Query + MSW (web), Expo + React Native (mobile), Zod contracts in `packages/contracts`, Vitest everywhere, `node:crypto` for AES-256-GCM and ES256 JWT signing.

**Design spec:** `docs/superpowers/specs/2026-08-10-publishing-compliance-design.md`

## Global Constraints

- Run every command from the repo root. pnpm 10.34.5, Node >= 20.
- `turbo run build` must have produced `packages/*/dist` before typecheck/lint/test. If a package changed, run `pnpm build` before running tests that import it.
- API imports are ESM-style with a `.js` extension (`./common/errors.js`) even though the compiler emits CommonJS. Web and mobile imports have **no** extension.
- API validation is `@Body(new ZodPipe(schema))` using the contract schema. Never `class-validator`.
- **The server never sends user-facing prose.** Throw `AppError` with an i18n `messageKey`.
- Drizzle `numeric` comes back as a string and timestamps as `Date`. Convert via `common/serialization.ts` (`toIso`, `toNumber`).
- Schema changes: edit `apps/api/src/db/schema.ts`, then `pnpm db:generate`, and commit the generated SQL under `apps/api/drizzle/`. **Never hand-write a migration.**
- `packages/i18n/src/en.ts` is the key-set source of truth; `ar.ts` is typed against it, so a missing Arabic string is a build error. Namespaces are append-only: shared `en.ts`/`ar.ts`, web `web.{en,ar}.ts`, mobile `mobile.{en,ar}.ts`. Backend contributes shared `auth.*`/`errors.*` keys only.
- **The catalogs are nested objects, not flat dotted keys.** `auth: { invalidCredentials: '…' }`, not `'auth.invalidCredentials': '…'`. The dotted strings you see in `t('web.feedback.title')` and in `AppError` message keys are *lookup paths* into that nesting. Add entries as nested objects; reference them with dotted paths.
- **No physical-direction styles.** ESLint rejects `ml-*`, `pl-*`, `left-*`, `text-left`, `border-l-*`, `rounded-l-*` in web string literals and `marginLeft`, `left`, `borderRightColor` style keys on mobile. Use `ms/me`, `ps/pe`, `start/end`, `text-start`, `marginStart`.
- **No new design tokens and no hex literals** outside `apps/web/src/app/globals.css` and `apps/mobile/src/theme/index.ts`. `token-usage.test.ts` sweeps for them. Use the existing `danger` / `dangerSoft` tokens and the existing `danger` Button variant.
- **`beforeEach`/`afterEach` must use a block body.** `beforeEach(() => x.mockReset())` implicitly returns the mock, which Vitest registers as a teardown callback and invokes after every test. This has already cost this project two debugging sessions. Write `beforeEach(() => { x.mockReset(); })`.
- Do **not** add `@testing-library/user-event`. It is absent from `apps/web/package.json` and CI installs with `--frozen-lockfile`. Use `fireEvent`.
- API integration specs need infra: `pnpm infra:up && pnpm db:migrate && pnpm db:seed`. Postgres credentials are user `kitchen` / db `kitchen`.
- In `apps/api/src/testing/harness.ts`, `cleanup` must delete **households before users** — `households.created_by` is `ON DELETE RESTRICT`.
- Never edit `apps/mobile/ios` or `apps/mobile/android`. They are gitignored `expo prebuild` output. Native configuration goes in `apps/mobile/app.json`.

---

## File Structure

**`packages/contracts`** — the frozen interface both sides derive from.
- `src/auth.ts` — `userSchema` gains `hasPassword`; new `deleteMeRequestSchema`; `oauthLoginRequestSchema` gains `authorizationCode`.
- `src/routes.ts` — new `deleteMe` route.

**`apps/api/src/auth/`** — everything deletion-related lives beside the identity code that owns it.
- `token-crypto.ts` (new) — AES-256-GCM encrypt/decrypt for the stored Apple token. Pure functions, no Nest.
- `auth.constants.ts` (new) — the `APPLE_TOKEN_REVOKER` DI symbol.
- `apple-token-revoker.ts` (new) — the `AppleTokenRevoker` interface plus `MockAppleTokenRevoker` and `HttpAppleTokenRevoker`.
- `account-deletion.ts` (new) — `applyHouseholdSuccession`, the succession algorithm, isolated so it can be tested against a real transaction without going through HTTP.
- `auth.service.ts` — gains `deleteAccount`; `oauthLogin` gains the token exchange.
- `auth.controller.ts` — gains `DELETE /me`.
- `auth.serializer.ts` — `UserRow` gains `passwordHash`; `toUser` derives `hasPassword`.
- `oauth.service.ts` — `VerifiedIdentity` gains `audience`.

**`apps/web/src/`**
- `lib/delete-confirmation.ts` (new) — locale-aware confirmation word matching.
- `hooks/account.ts` (new) — `useDeleteAccount`.
- `components/settings/DeleteAccount.tsx` (new) — the screen. Kept out of `SettingsView.tsx`, which is already 225 lines.
- `app/(app)/settings/delete-account/page.tsx` (new) — route shell.

**`apps/mobile/src/`**
- `lib/delete-confirmation.ts` (new) — same contract as the web one.
- `lib/oauth.ts` — returns the authorization code alongside the identity token.
- `hooks/account.ts` (new) — `useDeleteAccount`.
- `app/settings/delete-account.tsx` (new) — the screen.

**`docs/store-listing/`**
- `age-rating.md` (new), `data-safety.md` (updated).

---

## Task 1: Contract additions

**Files:**
- Modify: `packages/contracts/src/auth.ts`
- Modify: `packages/contracts/src/routes.ts`
- Modify: `apps/api/src/auth/auth.serializer.ts`
- Modify: `apps/web/src/mocks/db.ts:340-347`
- Modify: `apps/mobile/src/mocks/data.ts:50-57`
- Test: `packages/contracts/src/routes.spec.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `deleteMeRequestSchema` / `DeleteMeRequest` (`{ password?: string }`), `userSchema.hasPassword: boolean`, `oauthLoginRequestSchema.authorizationCode?: string`, and the `deleteMe` route (`DELETE /me`, `auth: true`, `household: false`, response `emptyResponse`).

Adding `hasPassword` to `userSchema` breaks typecheck everywhere a `User` is constructed, which is why the serializer and both mock fixtures are in this task: the workspace must be green when it ends.

- [ ] **Step 1: Write the failing test**

Append to `packages/contracts/src/routes.spec.ts`:

```ts
describe('deleteMe route', () => {
  it('is authenticated but not household-scoped, so it works when the last household is gone', () => {
    expect(routes.deleteMe.method).toBe('DELETE');
    expect(routes.deleteMe.path).toBe('/me');
    expect(routes.deleteMe.auth).toBe(true);
    expect(routes.deleteMe.household).toBe(false);
  });

  it('accepts an omitted password, because OAuth-only accounts have none', () => {
    expect(deleteMeRequestSchema.parse({})).toEqual({});
    expect(deleteMeRequestSchema.parse({ password: 'hunter2' })).toEqual({ password: 'hunter2' });
    expect(deleteMeRequestSchema.safeParse({ password: '' }).success).toBe(false);
  });
});

describe('userSchema', () => {
  it('reports password presence so a client knows whether to ask for one', () => {
    const parsed = userSchema.parse({
      id: '11111111-1111-4111-8111-111111111111',
      email: 'chef@example.com',
      displayName: 'Amira',
      locale: 'en',
      hasPassword: true,
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    expect(parsed.hasPassword).toBe(true);
  });
});
```

Add `deleteMeRequestSchema` and `userSchema` to the existing import at the top of the file.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @kitchen/contracts exec vitest run src/routes.spec.ts`
Expected: FAIL — `routes.deleteMe` is undefined and `deleteMeRequestSchema` is not exported.

- [ ] **Step 3: Add the contract schemas**

In `packages/contracts/src/auth.ts`, add `hasPassword` to `userSchema`:

```ts
export const userSchema = z.object({
  id: uuidSchema,
  email: z.string().email(),
  displayName: z.string().min(1).max(80),
  locale: localeSchema,
  /**
   * Whether the account has a password. Derived from `password_hash`, never the
   * hash itself. Clients need it to decide whether account deletion should ask
   * for a password: an OAuth-only account has none to re-enter.
   */
  hasPassword: z.boolean(),
  createdAt: isoDateTimeSchema,
});
```

Add `authorizationCode` to `oauthLoginRequestSchema`:

```ts
export const oauthLoginRequestSchema = z.object({
  provider: oauthProviderSchema,
  /** Identity token from the native SDK, or authorization code from the web flow. */
  idToken: z.string().min(1),
  /**
   * Apple's single-use authorization code, sent only by the native Apple flow.
   * Exchanged at sign-in for a refresh token, which is what account deletion
   * later revokes (App Store Guideline 5.1.1(v)). Optional: the web flow and
   * older mobile builds do not send it.
   */
  authorizationCode: z.string().min(1).optional(),
  locale: localeSchema.optional(),
});
```

Add the delete request schema next to `updateMeRequestSchema`:

```ts
export const deleteMeRequestSchema = z.object({
  /** Required when the account has a password. Absent for OAuth-only accounts. */
  password: z.string().min(1).optional(),
});
export type DeleteMeRequest = z.infer<typeof deleteMeRequestSchema>;
```

- [ ] **Step 4: Register the route**

In `packages/contracts/src/routes.ts`, directly after the `getMe` entry:

```ts
  deleteMe: {
    method: 'DELETE',
    path: '/me',
    auth: true,
    // Deletion spans every household the user belongs to, and their last
    // household may be deleted by the call itself. Requiring x-household-id
    // would make deletion impossible for exactly the users who need it.
    household: false,
    body: deleteMeRequestSchema,
    response: emptyResponse,
  },
```

Add `deleteMeRequestSchema` to the imports from `./auth.js` at the top of `routes.ts`.

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @kitchen/contracts exec vitest run src/routes.spec.ts`
Expected: PASS

- [ ] **Step 6: Fix the API serializer**

In `apps/api/src/auth/auth.serializer.ts`:

```ts
export interface UserRow {
  id: string;
  email: string;
  displayName: string;
  locale: 'en' | 'ar';
  passwordHash: string | null;
  createdAt: Date;
}

export function toUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    locale: row.locale,
    hasPassword: row.passwordHash !== null,
    createdAt: toIso(row.createdAt),
  };
}
```

Every producer of a `UserRow` (`register`, `login`, `requireUser`, `updateMe`, `linkOrCreateOAuthUser`) already selects the full row, so no query changes are needed.

- [ ] **Step 7: Fix both mock fixtures**

`apps/web/src/mocks/db.ts`, inside `seed()`:

```ts
  db.user = {
    id: USER_ID,
    email: 'chef@example.com',
    displayName: 'Amira',
    locale: 'en',
    hasPassword: true,
    createdAt: iso(NOW()),
  };
```

`apps/mobile/src/mocks/data.ts`, in the user fixture at line ~53, add `hasPassword: true,` after `locale: 'en',`.

Search both apps for any other `User` literal (`rg "displayName: '" apps/web/src apps/mobile/src`) and add the field wherever typecheck complains.

- [ ] **Step 8: Verify the workspace is green**

Run: `pnpm build && pnpm typecheck && pnpm test`
Expected: PASS. If typecheck names a `User` literal missing `hasPassword`, add it and re-run.

- [ ] **Step 9: Commit**

```bash
git add packages/contracts apps/api/src/auth/auth.serializer.ts apps/web/src/mocks apps/mobile/src/mocks
git commit -m "feat(contracts): add deleteMe route, hasPassword, and Apple authorization code"
```

---

## Task 2: Token encryption helper and environment

**Files:**
- Create: `apps/api/src/auth/token-crypto.ts`
- Create: `apps/api/src/auth/token-crypto.spec.ts`
- Modify: `apps/api/src/config/env.ts`
- Test: `apps/api/src/config/env.spec.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `encryptToken(plaintext: string, keyBase64: string): string` and `decryptToken(payload: string, keyBase64: string): string | null`. Also the env vars `APPLE_REVOKE_MOCK` (boolean, default true), `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY`, `APPLE_TOKEN_ENC_KEY` (all strings, default `''`).

An Apple refresh token is a live third-party credential. Our own refresh tokens are stored hashed, but revocation needs this one back in plaintext, so it must be reversibly encrypted instead.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/auth/token-crypto.spec.ts`:

```ts
import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { decryptToken, encryptToken } from './token-crypto.js';

const KEY = randomBytes(32).toString('base64');

describe('token-crypto', () => {
  it('round-trips a token', () => {
    const cipher = encryptToken('apple-refresh-token', KEY);
    expect(cipher).not.toContain('apple-refresh-token');
    expect(decryptToken(cipher, KEY)).toBe('apple-refresh-token');
  });

  it('uses a fresh IV, so the same input never produces the same ciphertext', () => {
    expect(encryptToken('same', KEY)).not.toBe(encryptToken('same', KEY));
  });

  it('rejects tampered ciphertext rather than returning garbage', () => {
    const [iv, tag, data] = encryptToken('secret', KEY).split('.') as [string, string, string];
    const flipped = Buffer.from(data, 'base64');
    flipped[0] ^= 0xff;
    expect(decryptToken(`${iv}.${tag}.${flipped.toString('base64')}`, KEY)).toBeNull();
  });

  it('returns null for a wrong key, so a rotated key degrades to no-revoke', () => {
    const cipher = encryptToken('secret', KEY);
    expect(decryptToken(cipher, randomBytes(32).toString('base64'))).toBeNull();
  });

  it('returns null for a malformed payload', () => {
    expect(decryptToken('not-a-payload', KEY)).toBeNull();
  });

  it('refuses a key that is not 32 bytes', () => {
    expect(() => encryptToken('secret', randomBytes(16).toString('base64'))).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @kitchen/api exec vitest run src/auth/token-crypto.spec.ts`
Expected: FAIL — cannot resolve `./token-crypto.js`.

- [ ] **Step 3: Write the implementation**

Create `apps/api/src/auth/token-crypto.ts`:

```ts
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Reversible encryption for the Apple refresh token.
 *
 * Our own refresh tokens are stored hashed, which is strictly better — but
 * revoking an Apple token requires presenting it to Apple, so it has to come
 * back out in plaintext. AES-256-GCM gives confidentiality plus an
 * authentication tag, so a tampered row is detected rather than silently
 * decrypted into nonsense.
 */
const IV_BYTES = 12;

function readKey(keyBase64: string): Buffer {
  const key = Buffer.from(keyBase64, 'base64');
  if (key.length !== 32) {
    throw new Error('APPLE_TOKEN_ENC_KEY must decode to exactly 32 bytes');
  }
  return key;
}

export function encryptToken(plaintext: string, keyBase64: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', readKey(keyBase64), iv);
  const data = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return [iv.toString('base64'), cipher.getAuthTag().toString('base64'), data.toString('base64')].join('.');
}

/**
 * Returns null rather than throwing on any failure — a wrong key, a tampered
 * row or a malformed payload. Deletion treats "no token" and "undecryptable
 * token" identically: skip the revoke and delete anyway. Throwing here would
 * block a user's account deletion on a key-rotation mistake.
 */
export function decryptToken(payload: string, keyBase64: string): string | null {
  const parts = payload.split('.');
  if (parts.length !== 3) return null;
  const [ivB64, tagB64, dataB64] = parts as [string, string, string];
  try {
    const decipher = createDecipheriv('aes-256-gcm', readKey(keyBase64), Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @kitchen/api exec vitest run src/auth/token-crypto.spec.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Write the failing env test**

Append to `apps/api/src/config/env.spec.ts`, following the file's existing style for building a valid environment:

```ts
describe('Apple revocation configuration', () => {
  it('defaults to the mock revoker, so the API boots with no Apple credentials', () => {
    const env = loadEnv(baseEnv());
    expect(env.APPLE_REVOKE_MOCK).toBe(true);
  });

  it('refuses to boot in production with a live revoker and no key material', () => {
    expect(() =>
      loadEnv({ ...baseEnv(), NODE_ENV: 'production', APPLE_REVOKE_MOCK: 'false' }),
    ).toThrow();
  });

  it('refuses an encryption key that is not 32 bytes', () => {
    expect(() =>
      loadEnv({
        ...baseEnv(),
        NODE_ENV: 'production',
        APPLE_REVOKE_MOCK: 'false',
        APPLE_TEAM_ID: 'TEAM123456',
        APPLE_KEY_ID: 'KEY1234567',
        APPLE_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\nx\n-----END PRIVATE KEY-----',
        APPLE_TOKEN_ENC_KEY: Buffer.alloc(16).toString('base64'),
      }),
    ).toThrow();
  });
});
```

`baseEnv()` here means whatever helper the existing spec already uses to build a passing production environment (it must already set `CORS_ORIGINS`, `GOOGLE_CLIENT_ID` and `APPLE_CLIENT_ID`). Reuse it; do not invent a second one.

- [ ] **Step 6: Run test to verify it fails**

Run: `pnpm --filter @kitchen/api exec vitest run src/config/env.spec.ts`
Expected: FAIL — `APPLE_REVOKE_MOCK` is undefined.

- [ ] **Step 7: Extend the env schema**

In `apps/api/src/config/env.ts`, after `APPLE_CLIENT_ID`:

```ts
  /**
   * When true, Apple token exchange and revocation use recorded fakes instead
   * of calling Apple. Mirrors AI_MOCK, and defaults the same way, so the whole
   * system runs offline with no Apple developer credentials.
   */
  APPLE_REVOKE_MOCK: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
  APPLE_TEAM_ID: z.string().default(''),
  APPLE_KEY_ID: z.string().default(''),
  /** Contents of the Apple `.p8` private key used to sign the client secret. */
  APPLE_PRIVATE_KEY: z.string().default(''),
  /** Base64, 32 bytes decoded. Encrypts the stored Apple refresh token. */
  APPLE_TOKEN_ENC_KEY: z.string().default(''),
```

Add to the `superRefine` guard, after the existing client-id loop:

```ts
  // Without these the revoker cannot sign a client secret, and the stored
  // token cannot be decrypted — so deletion would silently stop revoking,
  // which is the exact guideline violation this feature exists to avoid.
  if (env.NODE_ENV === 'production' && !env.APPLE_REVOKE_MOCK) {
    for (const key of [
      'APPLE_TEAM_ID',
      'APPLE_KEY_ID',
      'APPLE_PRIVATE_KEY',
      'APPLE_TOKEN_ENC_KEY',
    ] as const) {
      if (env[key].trim() === '') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: 'is required when APPLE_REVOKE_MOCK is false',
        });
      }
    }
    if (
      env.APPLE_TOKEN_ENC_KEY.trim() !== '' &&
      Buffer.from(env.APPLE_TOKEN_ENC_KEY, 'base64').length !== 32
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['APPLE_TOKEN_ENC_KEY'],
        message: 'must decode to exactly 32 bytes (AES-256)',
      });
    }
  }
```

- [ ] **Step 8: Run test to verify it passes**

Run: `pnpm --filter @kitchen/api exec vitest run src/config/env.spec.ts src/auth/token-crypto.spec.ts`
Expected: PASS

- [ ] **Step 9: Document the new variables**

Add the five variables to `.env.example` with empty values and a one-line comment that they are only needed when `APPLE_REVOKE_MOCK=false`.

- [ ] **Step 10: Commit**

```bash
git add apps/api/src/auth/token-crypto.ts apps/api/src/auth/token-crypto.spec.ts apps/api/src/config/env.ts apps/api/src/config/env.spec.ts .env.example
git commit -m "feat(api): add Apple token encryption helper and revocation env guards"
```

---

## Task 3: Store the Apple refresh token on `oauth_accounts`

**Files:**
- Modify: `apps/api/src/db/schema.ts:126-140`
- Create: `apps/api/drizzle/<generated>.sql` (produced by `pnpm db:generate`)
- Test: `apps/api/src/auth/oauth-columns.spec.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `oauthAccounts.refreshTokenEncrypted` (`text`, nullable) and `oauthAccounts.revokeClientId` (`text`, nullable).

`revokeClientId` exists because `APPLE_CLIENT_ID` is a comma-separated list — Apple mints `aud` as the bundle id for native sign-in and as the Services ID on the web, and the revoke request must present the one the token was issued to.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/auth/oauth-columns.spec.ts`:

```ts
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestContext, cleanup, seedUser, type TestContext } from '../testing/harness.js';
import { oauthAccounts } from '../db/schema.js';

describe('oauth_accounts revocation columns', () => {
  let ctx: TestContext;
  let userId: string;

  beforeAll(async () => {
    ctx = createTestContext();
    userId = await seedUser(ctx.db);
  });

  afterAll(async () => {
    await cleanup(ctx.db, { users: [userId] });
    await ctx.client.end();
  });

  it('stores and reads back the encrypted token and its client id', async () => {
    await ctx.db.insert(oauthAccounts).values({
      userId,
      provider: 'apple',
      providerAccountId: randomUUID(),
      refreshTokenEncrypted: 'iv.tag.data',
      revokeClientId: 'ai.kitchen.app',
    });

    const [row] = await ctx.db
      .select()
      .from(oauthAccounts)
      .where(eq(oauthAccounts.userId, userId))
      .limit(1);

    expect(row?.refreshTokenEncrypted).toBe('iv.tag.data');
    expect(row?.revokeClientId).toBe('ai.kitchen.app');
  });

  it('defaults both columns to null, so existing Apple links keep working', async () => {
    const [row] = await ctx.db
      .insert(oauthAccounts)
      .values({ userId, provider: 'google', providerAccountId: randomUUID() })
      .returning();

    expect(row?.refreshTokenEncrypted).toBeNull();
    expect(row?.revokeClientId).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm infra:up && pnpm --filter @kitchen/api exec vitest run src/auth/oauth-columns.spec.ts`
Expected: FAIL — `refreshTokenEncrypted` is not a property of the insert type.

- [ ] **Step 3: Add the columns to the schema**

In `apps/api/src/db/schema.ts`, inside `oauthAccounts`, after `providerAccountId`:

```ts
    /**
     * Apple refresh token, AES-256-GCM ciphertext (see `auth/token-crypto.ts`).
     * Null for Google, and for Apple links created before revocation shipped.
     */
    refreshTokenEncrypted: text('refresh_token_encrypted'),
    /**
     * The `aud` the identity token was validated against. APPLE_CLIENT_ID is a
     * comma-separated list because Apple uses the bundle id natively and the
     * Services ID on the web; the revoke call must present the right one.
     */
    revokeClientId: text('revoke_client_id'),
```

- [ ] **Step 4: Generate and apply the migration**

```bash
pnpm db:generate
pnpm db:migrate
```

Expected: a new file under `apps/api/drizzle/` adding two nullable `text` columns. Read it and confirm it contains no `DROP` and no `NOT NULL`.

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @kitchen/api exec vitest run src/auth/oauth-columns.spec.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/db/schema.ts apps/api/drizzle apps/api/src/auth/oauth-columns.spec.ts
git commit -m "feat(api): store the Apple refresh token and its client id on oauth_accounts"
```

---

## Task 4: Apple token revoker port and adapters

**Files:**
- Create: `apps/api/src/auth/auth.constants.ts`
- Create: `apps/api/src/auth/apple-token-revoker.ts`
- Create: `apps/api/src/auth/apple-token-revoker.spec.ts`
- Modify: `apps/api/src/auth/auth.module.ts`

**Interfaces:**
- Consumes: `Env` from `../config/env.js`.
- Produces:
  - `APPLE_TOKEN_REVOKER` — the DI symbol.
  - `interface AppleTokenRevoker { exchangeCode(code: string, clientId: string): Promise<string | null>; revoke(refreshToken: string, clientId: string): Promise<void>; }`
  - `MockAppleTokenRevoker` — `exchangeCode` resolves `mock-apple-refresh-${clientId}`; `revoke` records calls on a public `revoked: Array<{ refreshToken: string; clientId: string }>`.
  - `HttpAppleTokenRevoker`.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/auth/apple-token-revoker.spec.ts`:

```ts
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { HttpAppleTokenRevoker, MockAppleTokenRevoker } from './apple-token-revoker.js';

const PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgevZzL1gdAFr88hb2
OF/2NxApJCzGCEDdfSp6VQO30hyhRANCAAQRWz+jn65BtOMvdyHKcvjBeBSDZH2r
1RTwjmYSi9R/zpBnuQ4EiMnCqfMPWiZqB4QdbAd0E7oH50VpuZ1P087G
-----END PRIVATE KEY-----`;

function revoker(): HttpAppleTokenRevoker {
  return new HttpAppleTokenRevoker({
    APPLE_TEAM_ID: 'TEAM123456',
    APPLE_KEY_ID: 'KEY1234567',
    APPLE_PRIVATE_KEY: PRIVATE_KEY,
  } as never);
}

describe('MockAppleTokenRevoker', () => {
  it('returns a deterministic token so the full flow runs offline', async () => {
    const mock = new MockAppleTokenRevoker();
    await expect(mock.exchangeCode('code', 'ai.kitchen.app')).resolves.toBe(
      'mock-apple-refresh-ai.kitchen.app',
    );
  });

  it('records revocations so specs can assert deletion revoked the token', async () => {
    const mock = new MockAppleTokenRevoker();
    await mock.revoke('token', 'ai.kitchen.app');
    expect(mock.revoked).toEqual([{ refreshToken: 'token', clientId: 'ai.kitchen.app' }]);
  });
});

describe('HttpAppleTokenRevoker', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('exchanges an authorization code and returns the refresh token', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ refresh_token: 'apple-refresh' }),
    });

    await expect(revoker().exchangeCode('the-code', 'ai.kitchen.app')).resolves.toBe('apple-refresh');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://appleid.apple.com/auth/token');
    const body = new URLSearchParams(init.body as string);
    expect(body.get('grant_type')).toBe('authorization_code');
    expect(body.get('code')).toBe('the-code');
    expect(body.get('client_id')).toBe('ai.kitchen.app');
    // The client secret is an ES256 JWT: three base64url segments.
    expect(body.get('client_secret')?.split('.')).toHaveLength(3);
  });

  it('returns null when Apple rejects the exchange, so sign-in still succeeds', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 400, text: async () => 'invalid_grant' });
    await expect(revoker().exchangeCode('bad', 'ai.kitchen.app')).resolves.toBeNull();
  });

  it('returns null when the network fails', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNRESET'));
    await expect(revoker().exchangeCode('code', 'ai.kitchen.app')).resolves.toBeNull();
  });

  it('posts the refresh token to the revoke endpoint', async () => {
    fetchMock.mockResolvedValue({ ok: true, text: async () => '' });

    await revoker().revoke('apple-refresh', 'ai.kitchen.app');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://appleid.apple.com/auth/revoke');
    const body = new URLSearchParams(init.body as string);
    expect(body.get('token')).toBe('apple-refresh');
    expect(body.get('token_type_hint')).toBe('refresh_token');
    expect(body.get('client_id')).toBe('ai.kitchen.app');
  });

  it('throws when Apple rejects the revoke, so the caller can log it', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 400, text: async () => 'invalid_client' });
    await expect(revoker().revoke('token', 'ai.kitchen.app')).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @kitchen/api exec vitest run src/auth/apple-token-revoker.spec.ts`
Expected: FAIL — cannot resolve `./apple-token-revoker.js`.

- [ ] **Step 3: Write the DI symbol**

Create `apps/api/src/auth/auth.constants.ts`:

```ts
/**
 * Dependency-injection tokens for the auth workstream, mirroring the shape of
 * `ai/ai.constants.ts` so external calls are swapped the same way everywhere.
 */
export const APPLE_TOKEN_REVOKER = Symbol('APPLE_TOKEN_REVOKER');
```

- [ ] **Step 4: Write the revoker**

Create `apps/api/src/auth/apple-token-revoker.ts`:

```ts
import { createSign } from 'node:crypto';
import { Logger } from '@nestjs/common';
import type { Env } from '../config/env.js';

const APPLE_TOKEN_URL = 'https://appleid.apple.com/auth/token';
const APPLE_REVOKE_URL = 'https://appleid.apple.com/auth/revoke';
const APPLE_AUDIENCE = 'https://appleid.apple.com';
/** Apple rejects client secrets valid for more than six months; ours lives for minutes. */
const CLIENT_SECRET_TTL_SECONDS = 300;
const REQUEST_TIMEOUT_MS = 10_000;

/**
 * Apple's token endpoints, behind a port so the whole system runs offline and
 * free by default (`APPLE_REVOKE_MOCK`), exactly like the AI providers.
 */
export interface AppleTokenRevoker {
  /**
   * Trades Apple's single-use authorization code for a refresh token.
   * Returns null on any failure — sign-in must not break because Apple's token
   * endpoint is unreachable.
   */
  exchangeCode(code: string, clientId: string): Promise<string | null>;
  /** Throws on failure. The caller decides whether that is fatal (it is not). */
  revoke(refreshToken: string, clientId: string): Promise<void>;
}

export class MockAppleTokenRevoker implements AppleTokenRevoker {
  readonly revoked: Array<{ refreshToken: string; clientId: string }> = [];

  async exchangeCode(_code: string, clientId: string): Promise<string | null> {
    return `mock-apple-refresh-${clientId}`;
  }

  async revoke(refreshToken: string, clientId: string): Promise<void> {
    this.revoked.push({ refreshToken, clientId });
  }
}

export class HttpAppleTokenRevoker implements AppleTokenRevoker {
  private readonly logger = new Logger(HttpAppleTokenRevoker.name);

  constructor(private readonly env: Env) {}

  async exchangeCode(code: string, clientId: string): Promise<string | null> {
    try {
      const response = await this.post(APPLE_TOKEN_URL, {
        grant_type: 'authorization_code',
        code,
        client_id: clientId,
        client_secret: this.clientSecret(clientId),
      });
      if (!response.ok) {
        this.logger.warn(`Apple code exchange failed: ${response.status} ${await response.text()}`);
        return null;
      }
      const payload = (await response.json()) as { refresh_token?: string };
      return payload.refresh_token ?? null;
    } catch (error) {
      this.logger.warn(`Apple code exchange errored: ${String(error)}`);
      return null;
    }
  }

  async revoke(refreshToken: string, clientId: string): Promise<void> {
    const response = await this.post(APPLE_REVOKE_URL, {
      token: refreshToken,
      token_type_hint: 'refresh_token',
      client_id: clientId,
      client_secret: this.clientSecret(clientId),
    });
    if (!response.ok) {
      throw new Error(`Apple revoke failed: ${response.status} ${await response.text()}`);
    }
  }

  private post(url: string, fields: Record<string, string>): Promise<Response> {
    return fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(fields).toString(),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  }

  /**
   * Apple's "client secret" is an ES256 JWT we sign ourselves with the `.p8`
   * key, scoped to the client id the token was issued to.
   */
  private clientSecret(clientId: string): string {
    const now = Math.floor(Date.now() / 1000);
    const header = { alg: 'ES256', kid: this.env.APPLE_KEY_ID, typ: 'JWT' };
    const payload = {
      iss: this.env.APPLE_TEAM_ID,
      iat: now,
      exp: now + CLIENT_SECRET_TTL_SECONDS,
      aud: APPLE_AUDIENCE,
      sub: clientId,
    };
    const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
    const signer = createSign('SHA256');
    signer.update(signingInput);
    const signature = signer.sign({ key: this.env.APPLE_PRIVATE_KEY, dsaEncoding: 'ieee-p1363' });
    return `${signingInput}.${signature.toString('base64url')}`;
  }
}

function b64url(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @kitchen/api exec vitest run src/auth/apple-token-revoker.spec.ts`
Expected: PASS (7 tests)

- [ ] **Step 6: Wire the provider**

In `apps/api/src/auth/auth.module.ts`, add to `providers` (import `ENV` and `Env` from `../config/env.js` if not already imported):

```ts
    {
      provide: APPLE_TOKEN_REVOKER,
      inject: [ENV],
      useFactory: (env: Env): AppleTokenRevoker =>
        env.APPLE_REVOKE_MOCK ? new MockAppleTokenRevoker() : new HttpAppleTokenRevoker(env),
    },
```

Export `APPLE_TOKEN_REVOKER` from the module so specs can override it.

- [ ] **Step 7: Verify the API still boots**

Run: `pnpm --filter @kitchen/api exec vitest run src/auth`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/auth/auth.constants.ts apps/api/src/auth/apple-token-revoker.ts apps/api/src/auth/apple-token-revoker.spec.ts apps/api/src/auth/auth.module.ts
git commit -m "feat(api): add Apple token revoker port with mock and http adapters"
```

---

## Task 5: Capture the Apple refresh token at sign-in

**Files:**
- Modify: `apps/api/src/auth/oauth.service.ts:7-17` and both verifier return statements
- Modify: `apps/api/src/auth/auth.service.ts` (`oauthLogin`, `linkOrCreateOAuthUser`)
- Test: `apps/api/src/auth/oauth-capture.spec.ts`

**Interfaces:**
- Consumes: `AppleTokenRevoker.exchangeCode` and `APPLE_TOKEN_REVOKER` (Task 4), `encryptToken` (Task 2), `oauthAccounts.refreshTokenEncrypted` / `.revokeClientId` (Task 3), `oauthLoginRequestSchema.authorizationCode` (Task 1).
- Produces: `VerifiedIdentity.audience: string | null`, and an `oauth_accounts` row carrying an encrypted Apple refresh token after a native Apple sign-in.

**The exchange must never fail a sign-in.** If Apple's token endpoint is down the user still signs in; we simply have no token to revoke later.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/auth/oauth-capture.spec.ts`. Follow the DI-override style the existing `apps/api/src/auth/*.spec.ts` integration specs use to build a testing module; override `OAuthService` with a stub whose `verify` resolves a fixed identity, and `APPLE_TOKEN_REVOKER` with a `MockAppleTokenRevoker`.

```ts
it('stores the encrypted Apple refresh token and the validated audience', async () => {
  const session = await service.oauthLogin({
    provider: 'apple',
    idToken: 'apple.id.token',
    authorizationCode: 'the-code',
  });
  createdUserIds.push(session.user.id);

  const [link] = await ctx.db
    .select()
    .from(oauthAccounts)
    .where(eq(oauthAccounts.userId, session.user.id))
    .limit(1);

  expect(link?.revokeClientId).toBe('ai.kitchen.app');
  expect(link?.refreshTokenEncrypted).not.toBeNull();
  expect(link?.refreshTokenEncrypted).not.toContain('mock-apple-refresh');
  expect(decryptToken(link!.refreshTokenEncrypted!, env.APPLE_TOKEN_ENC_KEY)).toBe(
    'mock-apple-refresh-ai.kitchen.app',
  );
});

it('signs in without a token when no authorization code is sent', async () => {
  const session = await service.oauthLogin({ provider: 'apple', idToken: 'apple.id.token' });
  createdUserIds.push(session.user.id);

  const [link] = await ctx.db
    .select()
    .from(oauthAccounts)
    .where(eq(oauthAccounts.userId, session.user.id))
    .limit(1);

  expect(link?.refreshTokenEncrypted).toBeNull();
});

it('still signs in when Apple refuses the exchange', async () => {
  vi.spyOn(revoker, 'exchangeCode').mockResolvedValue(null);

  const session = await service.oauthLogin({
    provider: 'apple',
    idToken: 'apple.id.token',
    authorizationCode: 'the-code',
  });
  createdUserIds.push(session.user.id);

  expect(session.tokens.accessToken).toBeTruthy();
});

it('ignores an authorization code from Google, which needs no revocation', async () => {
  const spy = vi.spyOn(revoker, 'exchangeCode');

  const session = await service.oauthLogin({
    provider: 'google',
    idToken: 'google.id.token',
    authorizationCode: 'the-code',
  });
  createdUserIds.push(session.user.id);

  expect(spy).not.toHaveBeenCalled();
});
```

Set `APPLE_TOKEN_ENC_KEY` for the spec by generating a 32-byte base64 key in `beforeAll` and injecting it through the overridden `ENV` provider.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @kitchen/api exec vitest run src/auth/oauth-capture.spec.ts`
Expected: FAIL — `revokeClientId` is null because nothing writes it.

- [ ] **Step 3: Expose the validated audience**

In `apps/api/src/auth/oauth.service.ts`, add to `VerifiedIdentity`:

```ts
  /**
   * The `aud` this token was validated against. Stored with an Apple refresh
   * token because APPLE_CLIENT_ID holds one id per platform and the revoke
   * call must present the matching one. Null only in development, where
   * `assertAudience` tolerates an unset client id.
   */
  audience: string | null;
```

In `verifyGoogle` and `verifyApple`, add `audience: payload.aud ?? null,` to the returned object.

- [ ] **Step 4: Exchange and store the token**

In `apps/api/src/auth/auth.service.ts`, inject the revoker and env into the constructor:

```ts
    @Inject(APPLE_TOKEN_REVOKER) private readonly appleTokens: AppleTokenRevoker,
    @Inject(ENV) private readonly env: Env,
```

Add a private helper and call it from `oauthLogin` after the user row is resolved:

```ts
  /**
   * Apple's authorization code is single-use and expires in about five
   * minutes, so it can only be exchanged here, at sign-in. Everything is
   * best-effort: a failure leaves us unable to revoke at deletion time, which
   * is bad, but breaking authentication to protect a deletion-time nicety
   * would be worse.
   */
  private async captureAppleRefreshToken(
    userId: string,
    dto: OAuthLoginRequest,
    identity: VerifiedIdentity,
  ): Promise<void> {
    if (dto.provider !== 'apple' || !dto.authorizationCode || !identity.audience) return;
    if (this.env.APPLE_TOKEN_ENC_KEY.trim() === '') return;

    const refreshToken = await this.appleTokens.exchangeCode(
      dto.authorizationCode,
      identity.audience,
    );
    if (!refreshToken) return;

    await this.db
      .update(oauthAccounts)
      .set({
        refreshTokenEncrypted: encryptToken(refreshToken, this.env.APPLE_TOKEN_ENC_KEY),
        revokeClientId: identity.audience,
      })
      .where(
        and(
          eq(oauthAccounts.provider, 'apple'),
          eq(oauthAccounts.providerAccountId, identity.providerAccountId),
        ),
      );
  }
```

In `oauthLogin`, after `const userRow = existingLink ? … : …;` and before issuing tokens:

```ts
    await this.captureAppleRefreshToken(userRow.id, dto, identity);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @kitchen/api exec vitest run src/auth/oauth-capture.spec.ts`
Expected: PASS (4 tests)

- [ ] **Step 6: Run the whole auth suite for regressions**

Run: `pnpm --filter @kitchen/api exec vitest run src/auth`
Expected: PASS. The added `audience` field is additive; if an existing spec builds a `VerifiedIdentity` literal, add `audience: 'ai.kitchen.app'` to it.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/auth
git commit -m "feat(api): exchange and store the Apple refresh token at sign-in"
```

---

## Task 6: Forward the Apple authorization code from mobile

**Files:**
- Modify: `apps/mobile/src/lib/oauth.ts:60-83,132-135`
- Modify: `apps/mobile/src/hooks/auth.ts:32-40`
- Modify: `apps/mobile/src/lib/oauth.spec.ts`

**Interfaces:**
- Consumes: `oauthLoginRequestSchema.authorizationCode` (Task 1).
- Produces: `interface OAuthCredential { idToken: string; authorizationCode?: string }` and `requestIdentityToken(provider: OAuthProvider): Promise<OAuthCredential | null>`.

This changes an existing return type from `string | null` to an object, so all 14 assertions in `oauth.spec.ts` must be updated. That churn is the whole reason this is its own task.

- [ ] **Step 1: Update the failing tests**

In `apps/mobile/src/lib/oauth.spec.ts`, change every `requestIdentityToken` resolution assertion to expect the object form. For example:

```ts
await expect(requestIdentityToken('apple')).resolves.toEqual({ idToken: 'apple.id.token' });
```

and under mocks:

```ts
await expect(requestIdentityToken('apple')).resolves.toEqual({ idToken: 'mock-apple-token' });
await expect(requestIdentityToken('google')).resolves.toEqual({ idToken: 'mock-google-token' });
```

Assertions that resolve to `null` (cancellation, dismissal) and those that reject stay exactly as they are. Add one new test:

```ts
it('forwards the authorization code, which is what deletion later revokes', async () => {
  isAvailableAsync.mockResolvedValue(true);
  signInAsync.mockResolvedValue({
    identityToken: 'apple.id.token',
    authorizationCode: 'apple-auth-code',
  });

  await expect(requestIdentityToken('apple')).resolves.toEqual({
    idToken: 'apple.id.token',
    authorizationCode: 'apple-auth-code',
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @kitchen/mobile exec vitest run src/lib/oauth.spec.ts`
Expected: FAIL — resolves to a string, not an object.

- [ ] **Step 3: Change the return type**

In `apps/mobile/src/lib/oauth.ts`:

```ts
export interface OAuthCredential {
  idToken: string;
  /**
   * Apple only. Single-use, expires in minutes, and is the only way to obtain
   * the refresh token that account deletion revokes (App Store 5.1.1(v)).
   */
  authorizationCode?: string;
}
```

In `requestAppleToken`, replace the final `return credential.identityToken;` with:

```ts
  return {
    idToken: credential.identityToken,
    authorizationCode: credential.authorizationCode ?? undefined,
  };
```

and change its signature to `Promise<OAuthCredential | null>`. Do the same for `requestGoogleToken`, returning `{ idToken }` (Google needs no code). Then:

```ts
export async function requestIdentityToken(
  provider: OAuthProvider,
): Promise<OAuthCredential | null> {
  if (usingMocks) return { idToken: `mock-${provider}-token` };
  return provider === 'apple' ? requestAppleToken() : requestGoogleToken();
}
```

- [ ] **Step 4: Update the caller**

In `apps/mobile/src/hooks/auth.ts`:

```ts
    mutationFn: async (provider: OAuthProvider): Promise<Session | null> => {
      const credential = await requestIdentityToken(provider);
      if (credential === null) return null;
      return api.call('oauthLogin', {
        body: {
          provider,
          idToken: credential.idToken,
          authorizationCode: credential.authorizationCode,
        },
      });
    },
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @kitchen/mobile exec vitest run src/lib/oauth.spec.ts`
Expected: PASS

- [ ] **Step 6: Verify the whole mobile suite and typecheck**

Run: `pnpm --filter @kitchen/mobile exec vitest run && pnpm --filter @kitchen/mobile typecheck`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/src/lib/oauth.ts apps/mobile/src/lib/oauth.spec.ts apps/mobile/src/hooks/auth.ts
git commit -m "feat(mobile): forward Apple's authorization code so deletion can revoke it"
```

---

## Task 7: Household succession

**Files:**
- Create: `apps/api/src/auth/account-deletion.ts`
- Create: `apps/api/src/auth/account-deletion.spec.ts`

**Interfaces:**
- Consumes: `households`, `householdMembers` from `../db/schema.js`; `createTestContext` / `seedUser` / `seedHousehold` / `cleanup` from `../testing/harness.js`.
- Produces: `applyHouseholdSuccession(tx: DbTx, userId: string): Promise<void>` and `export type DbTx = Parameters<Parameters<Database['transaction']>[0]>[0]`.

This is the dangerous part of the feature, isolated from HTTP so it can be tested directly against a real transaction. `households.created_by` is `ON DELETE RESTRICT`, so if this function is wrong the user delete does not silently corrupt data — it throws. That is the safety net, not the design.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/auth/account-deletion.spec.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { applyHouseholdSuccession } from './account-deletion.js';
import { households, householdMembers, users } from '../db/schema.js';
import { cleanup, createTestContext, seedHousehold, seedUser, type TestContext } from '../testing/harness.js';

describe('applyHouseholdSuccession', () => {
  let ctx: TestContext;
  const userIds: string[] = [];
  const householdIds: string[] = [];

  async function addMember(
    householdId: string,
    userId: string,
    role: 'owner' | 'member',
    joinedAt: Date,
  ): Promise<void> {
    await ctx.db.insert(householdMembers).values({ householdId, userId, role, joinedAt });
  }

  async function track(fn: () => Promise<string>): Promise<string> {
    const id = await fn();
    userIds.push(id);
    return id;
  }

  beforeAll(() => {
    ctx = createTestContext();
  });

  afterAll(async () => {
    await cleanup(ctx.db, { households: householdIds, users: userIds });
    await ctx.client.end();
  });

  it('deletes a household whose only member is leaving', async () => {
    const owner = await track(() => seedUser(ctx.db));
    const householdId = await seedHousehold(ctx.db, owner);

    await ctx.db.transaction(async (tx) => {
      await applyHouseholdSuccession(tx, owner);
    });

    const rows = await ctx.db.select().from(households).where(eq(households.id, householdId));
    expect(rows).toEqual([]);
  });

  it('promotes the longest-standing member when the only owner leaves', async () => {
    const owner = await track(() => seedUser(ctx.db));
    const early = await track(() => seedUser(ctx.db));
    const late = await track(() => seedUser(ctx.db));
    const householdId = await seedHousehold(ctx.db, owner);
    householdIds.push(householdId);
    await addMember(householdId, early, 'member', new Date('2026-01-01T00:00:00Z'));
    await addMember(householdId, late, 'member', new Date('2026-06-01T00:00:00Z'));

    await ctx.db.transaction(async (tx) => {
      await applyHouseholdSuccession(tx, owner);
    });

    const rows = await ctx.db
      .select()
      .from(householdMembers)
      .where(eq(householdMembers.householdId, householdId));

    expect(rows.find((row) => row.userId === early)?.role).toBe('owner');
    expect(rows.find((row) => row.userId === late)?.role).toBe('member');
  });

  it('breaks a joined_at tie by the lowest user id, so the result is deterministic', async () => {
    const owner = await track(() => seedUser(ctx.db));
    const a = await track(() => seedUser(ctx.db));
    const b = await track(() => seedUser(ctx.db));
    const householdId = await seedHousehold(ctx.db, owner);
    householdIds.push(householdId);
    const sameMoment = new Date('2026-03-03T00:00:00Z');
    await addMember(householdId, a, 'member', sameMoment);
    await addMember(householdId, b, 'member', sameMoment);

    await ctx.db.transaction(async (tx) => {
      await applyHouseholdSuccession(tx, owner);
    });

    const expected = [a, b].sort()[0];
    const rows = await ctx.db
      .select()
      .from(householdMembers)
      .where(eq(householdMembers.householdId, householdId));

    expect(rows.find((row) => row.userId === expected)?.role).toBe('owner');
  });

  it('leaves an existing co-owner in place instead of promoting anyone', async () => {
    const owner = await track(() => seedUser(ctx.db));
    const coOwner = await track(() => seedUser(ctx.db));
    const member = await track(() => seedUser(ctx.db));
    const householdId = await seedHousehold(ctx.db, owner);
    householdIds.push(householdId);
    await addMember(householdId, coOwner, 'owner', new Date('2026-05-01T00:00:00Z'));
    await addMember(householdId, member, 'member', new Date('2026-01-01T00:00:00Z'));

    await ctx.db.transaction(async (tx) => {
      await applyHouseholdSuccession(tx, owner);
    });

    const rows = await ctx.db
      .select()
      .from(householdMembers)
      .where(eq(householdMembers.householdId, householdId));

    expect(rows.find((row) => row.userId === member)?.role).toBe('member');
    expect(rows.find((row) => row.userId === coOwner)?.role).toBe('owner');
  });

  it('repoints created_by to the surviving owner', async () => {
    const owner = await track(() => seedUser(ctx.db));
    const survivor = await track(() => seedUser(ctx.db));
    const householdId = await seedHousehold(ctx.db, owner);
    householdIds.push(householdId);
    await addMember(householdId, survivor, 'member', new Date('2026-01-01T00:00:00Z'));

    await ctx.db.transaction(async (tx) => {
      await applyHouseholdSuccession(tx, owner);
    });

    const [row] = await ctx.db.select().from(households).where(eq(households.id, householdId));
    expect(row?.createdBy).toBe(survivor);
  });

  it('repoints created_by when the creator was never an owner', async () => {
    const creator = await track(() => seedUser(ctx.db));
    const owner = await track(() => seedUser(ctx.db));
    const householdId = await seedHousehold(ctx.db, creator);
    householdIds.push(householdId);
    // The creator handed the household over and stayed on as a plain member.
    await ctx.db
      .update(householdMembers)
      .set({ role: 'member' })
      .where(eq(householdMembers.userId, creator));
    await addMember(householdId, owner, 'owner', new Date('2026-02-02T00:00:00Z'));

    await ctx.db.transaction(async (tx) => {
      await applyHouseholdSuccession(tx, creator);
      await tx.delete(users).where(eq(users.id, creator));
    });

    const [row] = await ctx.db.select().from(households).where(eq(households.id, householdId));
    expect(row?.createdBy).toBe(owner);
  });

  it('handles a user in several households at once', async () => {
    const user = await track(() => seedUser(ctx.db));
    const survivor = await track(() => seedUser(ctx.db));
    const soloId = await seedHousehold(ctx.db, user);
    const sharedId = await seedHousehold(ctx.db, user);
    householdIds.push(sharedId);
    await addMember(sharedId, survivor, 'member', new Date('2026-01-01T00:00:00Z'));

    await ctx.db.transaction(async (tx) => {
      await applyHouseholdSuccession(tx, user);
    });

    const remaining = await ctx.db
      .select()
      .from(households)
      .where(inArray(households.id, [soloId, sharedId]));

    expect(remaining.map((row) => row.id)).toEqual([sharedId]);
    expect(remaining[0]?.createdBy).toBe(survivor);
  });

  it('does nothing for a user with no households', async () => {
    const loner = await track(() => seedUser(ctx.db));
    await expect(
      ctx.db.transaction(async (tx) => {
        await applyHouseholdSuccession(tx, loner);
      }),
    ).resolves.not.toThrow();
  });
});
```

`seedHousehold` inserts exactly one membership row for its creator with role `owner`, so every additional member above is inserted explicitly with a controlled `joined_at`. The solo-household cases do not push onto `householdIds` because the function itself deletes them.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @kitchen/api exec vitest run src/auth/account-deletion.spec.ts`
Expected: FAIL — cannot resolve `./account-deletion.js`.

- [ ] **Step 3: Write the implementation**

Create `apps/api/src/auth/account-deletion.ts`:

```ts
import { and, eq, ne, sql } from 'drizzle-orm';
import { households, householdMembers } from '../db/schema.js';
import type { Database } from '../db/database.js';

/** The transaction handle Drizzle hands to `db.transaction`. */
export type DbTx = Parameters<Parameters<Database['transaction']>[0]>[0];

/**
 * Hands over or tears down every household the user belongs to, so the user
 * row can then be deleted.
 *
 * `households.created_by` is ON DELETE RESTRICT, so this is not optional
 * housekeeping: without it, deleting the user throws a foreign-key error.
 * Must run inside the same transaction as the user delete — a crash between
 * the two would leave a household owned by a user who is halfway gone.
 */
export async function applyHouseholdSuccession(tx: DbTx, userId: string): Promise<void> {
  const memberships = await tx
    .select({ householdId: householdMembers.householdId })
    .from(householdMembers)
    .where(eq(householdMembers.userId, userId));

  for (const { householdId } of memberships) {
    // Lock every membership row for this household. Two co-owners deleting
    // concurrently would otherwise each see the other as a survivor, both skip
    // promotion, and leave the household with no owner at all.
    const locked = await tx
      .select({
        userId: householdMembers.userId,
        role: householdMembers.role,
        joinedAt: householdMembers.joinedAt,
      })
      .from(householdMembers)
      .where(eq(householdMembers.householdId, householdId))
      .for('update');

    const survivors = locked.filter((row) => row.userId !== userId);

    if (survivors.length === 0) {
      // Cascades through every household-scoped table.
      await tx.delete(households).where(eq(households.id, householdId));
      continue;
    }

    // min(joined_at), tie-broken by the lowest user id so the outcome is
    // deterministic and therefore testable.
    const bySeniority = [...survivors].sort(
      (a, b) =>
        a.joinedAt.getTime() - b.joinedAt.getTime() || (a.userId < b.userId ? -1 : 1),
    );

    let owners = bySeniority.filter((row) => row.role === 'owner');
    if (owners.length === 0) {
      const heir = bySeniority[0]!;
      await tx
        .update(householdMembers)
        .set({ role: 'owner' })
        .where(
          and(
            eq(householdMembers.householdId, householdId),
            eq(householdMembers.userId, heir.userId),
          ),
        );
      owners = [heir];
    }

    // The RESTRICT fires whenever created_by points at the departing user,
    // even when they were never an owner — a creator who handed the household
    // over still trips it. So this runs for every surviving household, not
    // only the promotion case.
    await tx
      .update(households)
      .set({ createdBy: owners[0]!.userId })
      .where(and(eq(households.id, householdId), eq(households.createdBy, userId)));
  }
}
```

Delete the unused `ne` / `sql` imports if the final code does not reference them; `pnpm lint` will flag them.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @kitchen/api exec vitest run src/auth/account-deletion.spec.ts`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/auth/account-deletion.ts apps/api/src/auth/account-deletion.spec.ts
git commit -m "feat(api): hand over or tear down households before a user is deleted"
```

---

## Task 8: `DELETE /me`

**Files:**
- Modify: `apps/api/src/auth/auth.service.ts`
- Modify: `apps/api/src/auth/auth.controller.ts`
- Modify: `packages/i18n/src/en.ts`, `packages/i18n/src/ar.ts`
- Create: `apps/api/src/auth/delete-account.spec.ts`

**Interfaces:**
- Consumes: `applyHouseholdSuccession` (Task 7), `decryptToken` (Task 2), `APPLE_TOKEN_REVOKER` / `AppleTokenRevoker` (Task 4), `oauthAccounts.refreshTokenEncrypted` / `.revokeClientId` (Task 3), `deleteMeRequestSchema` / `DeleteMeRequest` (Task 1).
- Produces: `AuthService.deleteAccount(userId: string, dto: DeleteMeRequest): Promise<void>` and the `DELETE /me` endpoint. Adds the shared i18n key `auth.passwordRequired`.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/auth/delete-account.spec.ts`. Build the testing module the same way `oauth-capture.spec.ts` (Task 5) does, overriding `APPLE_TOKEN_REVOKER` with a `MockAppleTokenRevoker` you keep a reference to.

```ts
it('deletes a password account after the password is verified', async () => {
  const session = await service.register({
    email: unique('chef'),
    password: 'correct-horse',
    displayName: 'Amira',
    locale: 'en',
  });

  await service.deleteAccount(session.user.id, { password: 'correct-horse' });

  const rows = await ctx.db.select().from(users).where(eq(users.id, session.user.id));
  expect(rows).toEqual([]);
});

it('rejects a missing password with the specific key, so the client can prompt', async () => {
  const session = await register();
  await expect(service.deleteAccount(session.user.id, {})).rejects.toMatchObject({
    messageKey: 'auth.passwordRequired',
  });
  const rows = await ctx.db.select().from(users).where(eq(users.id, session.user.id));
  expect(rows).toHaveLength(1);
});

it('rejects a wrong password and leaves the account intact', async () => {
  const session = await register();
  await expect(
    service.deleteAccount(session.user.id, { password: 'wrong' }),
  ).rejects.toMatchObject({ messageKey: 'auth.invalidCredentials' });
  const rows = await ctx.db.select().from(users).where(eq(users.id, session.user.id));
  expect(rows).toHaveLength(1);
});

it('needs no password for an OAuth-only account', async () => {
  const session = await service.oauthLogin({ provider: 'apple', idToken: 'apple.id.token' });
  await expect(service.deleteAccount(session.user.id, {})).resolves.toBeUndefined();
});

it('revokes the Apple token with the decrypted value and the stored client id', async () => {
  const session = await service.oauthLogin({
    provider: 'apple',
    idToken: 'apple.id.token',
    authorizationCode: 'the-code',
  });

  await service.deleteAccount(session.user.id, {});

  expect(revoker.revoked).toEqual([
    { refreshToken: 'mock-apple-refresh-ai.kitchen.app', clientId: 'ai.kitchen.app' },
  ]);
});

it('deletes the account even when Apple refuses the revoke', async () => {
  const session = await service.oauthLogin({
    provider: 'apple',
    idToken: 'apple.id.token',
    authorizationCode: 'the-code',
  });
  vi.spyOn(revoker, 'revoke').mockRejectedValue(new Error('Apple is down'));

  await service.deleteAccount(session.user.id, {});

  const rows = await ctx.db.select().from(users).where(eq(users.id, session.user.id));
  expect(rows).toEqual([]);
});

it('removes refresh tokens, so an issued session cannot be refreshed afterwards', async () => {
  const session = await register();
  await service.deleteAccount(session.user.id, { password: PASSWORD });

  await expect(service.refresh({ refreshToken: session.tokens.refreshToken })).rejects.toThrow();
});

it('cascades the user\'s feedback rows', async () => {
  const session = await register();
  await ctx.db.insert(feedback).values({
    userId: session.user.id,
    rating: 5,
    message: 'Loved it',
    appVersion: '1.0.0',
    platform: 'ios',
  });

  await service.deleteAccount(session.user.id, { password: PASSWORD });

  const rows = await ctx.db.select().from(feedback).where(eq(feedback.userId, session.user.id));
  expect(rows).toEqual([]);
});

it('de-attributes inventory events without changing the pantry quantity', async () => {
  // A household with two members; the departing one recorded an event.
  const departing = await register();
  const survivor = await seedUser(ctx.db);
  const householdId = await seedHousehold(ctx.db, departing.user.id);
  await ctx.db.insert(householdMembers).values({
    householdId,
    userId: survivor,
    role: 'member',
    joinedAt: new Date('2026-01-01T00:00:00Z'),
  });
  const { itemId, eventId } = await seedInventoryEvent(ctx.db, householdId, departing.user.id);

  await service.deleteAccount(departing.user.id, { password: PASSWORD });

  const [event] = await ctx.db
    .select()
    .from(inventoryEvents)
    .where(eq(inventoryEvents.id, eventId));
  const [item] = await ctx.db
    .select()
    .from(inventoryItems)
    .where(eq(inventoryItems.id, itemId));

  expect(event?.actorUserId).toBeNull();
  expect(item?.quantity).toBe('2');
});
```

`seedInventoryEvent` here means inserting one `inventory_items` row with `quantity: '2'` and one `inventory_events` row referencing it with `actorUserId` set to the departing user — write it inline in the spec, using whatever column names `db/schema.ts` declares. Do not add a helper to `harness.ts` for a single spec.

Also add to the existing `getMe` coverage:

```ts
it('reports hasPassword for both account kinds', async () => {
  const passwordUser = await register();
  expect((await service.me(passwordUser.user.id)).hasPassword).toBe(true);

  const oauthUser = await service.oauthLogin({ provider: 'google', idToken: 'google.id.token' });
  expect((await service.me(oauthUser.user.id)).hasPassword).toBe(false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @kitchen/api exec vitest run src/auth/delete-account.spec.ts`
Expected: FAIL — `service.deleteAccount` is not a function.

- [ ] **Step 3: Add the i18n key**

The catalogs are **nested objects**, not flat dotted keys — `messageKey` strings are dotted paths that resolve *against* that nesting. Add the key inside the existing `auth` object.

In `packages/i18n/src/en.ts`, inside `auth`, next to `invalidCredentials`:

```ts
    passwordRequired: 'Enter your password to continue.',
```

In `packages/i18n/src/ar.ts`, in the same position inside `auth`:

```ts
    passwordRequired: 'أدخل كلمة المرور للمتابعة.',
```

- [ ] **Step 4: Implement `deleteAccount`**

In `apps/api/src/auth/auth.service.ts`:

```ts
  /**
   * Irreversibly deletes the account. Required by App Store Guideline
   * 5.1.1(v) and Google Play's data-deletion policy.
   *
   * Ordering matters: revoke first, outside the transaction. Network I/O
   * inside a transaction holds row locks for the length of a third-party
   * round trip, and revoking after a successful delete would mean losing the
   * token permanently on any failure. Revoking first has the only recoverable
   * failure mode — the user re-links Apple and tries again.
   */
  async deleteAccount(userId: string, dto: DeleteMeRequest): Promise<void> {
    const [user] = await this.db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) throw AppError.notFound();

    if (user.passwordHash !== null) {
      if (!dto.password) throw AppError.unauthenticated('auth.passwordRequired');
      const ok = await verifyPassword(dto.password, user.passwordHash);
      // Reuse the existing key rather than minting one that distinguishes
      // "wrong password" from "no such account" in a new place.
      if (!ok) throw AppError.unauthenticated('auth.invalidCredentials');
    }

    await this.revokeAppleTokens(userId);

    await this.db.transaction(async (tx) => {
      await applyHouseholdSuccession(tx, userId);
      await tx.delete(users).where(eq(users.id, userId));
    });
  }

  /**
   * Best-effort. A revoke failure is logged and ignored: blocking a user's
   * account deletion on an Apple outage would itself violate the guideline
   * the revoke exists to satisfy.
   */
  private async revokeAppleTokens(userId: string): Promise<void> {
    if (this.env.APPLE_TOKEN_ENC_KEY.trim() === '') return;

    const links = await this.db
      .select()
      .from(oauthAccounts)
      .where(and(eq(oauthAccounts.userId, userId), eq(oauthAccounts.provider, 'apple')));

    for (const link of links) {
      if (!link.refreshTokenEncrypted || !link.revokeClientId) continue;
      const token = decryptToken(link.refreshTokenEncrypted, this.env.APPLE_TOKEN_ENC_KEY);
      // A null here means a rotated or wrong key. Treated exactly like "no
      // token": skip the revoke, delete anyway.
      if (!token) continue;
      try {
        await this.appleTokens.revoke(token, link.revokeClientId);
      } catch (error) {
        this.logger.warn(`Apple revoke failed for user ${userId}: ${String(error)}`);
      }
    }
  }
```

Add `private readonly logger = new Logger(AuthService.name);` if the class does not already have one.

- [ ] **Step 5: Add the controller endpoint**

In `apps/api/src/auth/auth.controller.ts`, following the shape of the existing `getMe`:

```ts
  @Delete('me')
  @HttpCode(204)
  @UseGuards(AuthGuard)
  async deleteMe(
    @CurrentUser() userId: string,
    @Body(new ZodPipe(deleteMeRequestSchema)) body: DeleteMeRequest,
  ): Promise<void> {
    await this.authService.deleteAccount(userId, body);
  }
```

Match the surrounding code exactly for how the current user id is obtained (`@CurrentUser()` may yield an object rather than a string) and for the status code the other `emptyResponse` routes use — copy `logout`.

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm --filter @kitchen/api exec vitest run src/auth`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/auth packages/i18n/src/en.ts packages/i18n/src/ar.ts
git commit -m "feat(api): add DELETE /me with household succession and Apple revocation"
```

---

## Task 9: Web delete-account screen

**Files:**
- Create: `apps/web/src/lib/delete-confirmation.ts`
- Create: `apps/web/src/lib/delete-confirmation.test.ts`
- Create: `apps/web/src/hooks/account.ts`
- Create: `apps/web/src/components/settings/DeleteAccount.tsx`
- Create: `apps/web/src/components/settings/DeleteAccount.test.tsx`
- Create: `apps/web/src/app/(app)/settings/delete-account/page.tsx`
- Modify: `apps/web/src/components/settings/SettingsView.tsx`
- Modify: `apps/web/src/mocks/handlers.ts`
- Modify: `packages/i18n/src/web.en.ts`, `packages/i18n/src/web.ar.ts`

**Interfaces:**
- Consumes: the `deleteMe` route and `hasPassword` (Task 1); `listHouseholds`, which already returns `members: Array<{ userId, displayName, email, role, joinedAt }>`.
- Produces: `matchesDeleteConfirmation(input: string, locale: 'en' | 'ar'): boolean` and `useDeleteAccount()`.

The succession preview is computed client-side from `listHouseholds` — the same seniority rule as Task 7, so the sentence the user reads matches what the server will do.

- [ ] **Step 1: Write the failing confirmation test**

Create `apps/web/src/lib/delete-confirmation.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { deleteConfirmationWord, matchesDeleteConfirmation } from './delete-confirmation';

describe('matchesDeleteConfirmation', () => {
  it('accepts the English word in any case, with surrounding whitespace', () => {
    expect(matchesDeleteConfirmation('DELETE', 'en')).toBe(true);
    expect(matchesDeleteConfirmation('delete', 'en')).toBe(true);
    expect(matchesDeleteConfirmation('  Delete  ', 'en')).toBe(true);
  });

  it('accepts the Arabic word', () => {
    expect(matchesDeleteConfirmation('حذف', 'ar')).toBe(true);
    expect(matchesDeleteConfirmation(' حذف ', 'ar')).toBe(true);
  });

  it('rejects the other locale word, near-misses and empty input', () => {
    expect(matchesDeleteConfirmation('حذف', 'en')).toBe(false);
    expect(matchesDeleteConfirmation('DELETE', 'ar')).toBe(false);
    expect(matchesDeleteConfirmation('DELET', 'en')).toBe(false);
    expect(matchesDeleteConfirmation('', 'en')).toBe(false);
  });

  it('exposes the word so the prompt and the check cannot drift apart', () => {
    expect(deleteConfirmationWord('en')).toBe('DELETE');
    expect(deleteConfirmationWord('ar')).toBe('حذف');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @kitchen/web exec vitest run src/lib/delete-confirmation.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the confirmation helper**

Create `apps/web/src/lib/delete-confirmation.ts`:

```ts
import type { Locale } from '@kitchen/contracts';

/**
 * Typed confirmation for account deletion. Localized, and therefore checked on
 * the client: comparing localized prose server-side is exactly the fragility
 * the i18n rules exist to prevent. This is accident prevention — the real
 * controls are the bearer token and the password.
 */
const WORDS: Record<Locale, string> = { en: 'DELETE', ar: 'حذف' };

export function deleteConfirmationWord(locale: Locale): string {
  return WORDS[locale];
}

export function matchesDeleteConfirmation(input: string, locale: Locale): boolean {
  const trimmed = input.trim();
  if (trimmed === '') return false;
  const word = WORDS[locale];
  // Arabic has no case, so `localeCompare` semantics buy nothing; a
  // case-insensitive compare is correct for both and free for one.
  return trimmed.toLocaleUpperCase(locale) === word.toLocaleUpperCase(locale);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @kitchen/web exec vitest run src/lib/delete-confirmation.test.ts`
Expected: PASS

- [ ] **Step 5: Add the MSW handler**

In `apps/web/src/mocks/handlers.ts`, next to the existing `/me` handlers:

```ts
  http.delete(u('/me'), async () => {
    db.user = null;
    return new HttpResponse(null, { status: 204 });
  }),
```

If `db.user` is not nullable in `apps/web/src/mocks/db.ts`, widen its type to `User | null` and make the `GET /me` handler return a 401 envelope when it is null — a deleted user must not still resolve.

- [ ] **Step 6: Add the i18n strings**

The catalogs are **nested objects**, not flat dotted keys. Add a `deleteAccount` object inside the top-level `web` object, next to the existing `feedback` object.

In `packages/i18n/src/web.en.ts`:

```ts
    deleteAccount: {
      link: 'Delete account',
      title: 'Delete your account',
      intro:
        'This permanently deletes your account, your profile, your saved preferences and your feedback. It cannot be undone.',
      householdsTitle: 'What happens to your kitchens',
      handover: '{household} will be handed over to {successor}.',
      destroy: '{household} and everything in it will be deleted.',
      confirmLabel: 'Type {word} to confirm',
      passwordLabel: 'Your password',
      submit: 'Delete my account',
      cancel: 'Cancel',
      working: 'Deleting…',
    },
```

In `packages/i18n/src/web.ar.ts`, in the same position:

```ts
    deleteAccount: {
      link: 'حذف الحساب',
      title: 'حذف حسابك',
      intro:
        'سيؤدي هذا إلى حذف حسابك وملفك الشخصي وتفضيلاتك وملاحظاتك نهائيًا. لا يمكن التراجع عن هذا الإجراء.',
      householdsTitle: 'ماذا سيحدث لمطابخك',
      handover: 'سيتم نقل {household} إلى {successor}.',
      destroy: 'سيتم حذف {household} وكل ما فيه.',
      confirmLabel: 'اكتب {word} للتأكيد',
      passwordLabel: 'كلمة المرور',
      submit: 'حذف حسابي',
      cancel: 'إلغاء',
      working: 'جارٍ الحذف…',
    },
```

Components reference these with the dotted path (`t('web.deleteAccount.title')`) — the dots are a lookup path into the nested object, not part of any key.

- [ ] **Step 7: Write the failing component test**

Create `apps/web/src/components/settings/DeleteAccount.test.tsx`. Follow the render/provider setup used by the existing `FeedbackForm` test in the same directory, and use `fireEvent` — `@testing-library/user-event` is not a declared dependency and CI installs with `--frozen-lockfile`.

```ts
it('keeps submit disabled until the confirmation word is typed', async () => {
  renderDeleteAccount();
  const submit = await screen.findByRole('button', { name: /delete my account/i });
  expect(submit).toBeDisabled();

  fireEvent.change(screen.getByLabelText(/type delete to confirm/i), {
    target: { value: 'DELETE' },
  });
  expect(submit).toBeEnabled();
});

it('shows the password field only for an account that has one', async () => {
  renderDeleteAccount();
  expect(await screen.findByLabelText(/your password/i)).toBeInTheDocument();
});

it('hides the password field for an OAuth-only account', async () => {
  db.user = { ...db.user!, hasPassword: false };
  renderDeleteAccount();
  await screen.findByRole('button', { name: /delete my account/i });
  expect(screen.queryByLabelText(/your password/i)).not.toBeInTheDocument();
});

it('names the successor for a shared kitchen', async () => {
  seedSharedHousehold(); // two members, the other joined earliest
  renderDeleteAccount();
  expect(await screen.findByText(/handed over to Sara/i)).toBeInTheDocument();
});

it('warns that a solo kitchen is destroyed', async () => {
  renderDeleteAccount();
  expect(await screen.findByText(/will be deleted/i)).toBeInTheDocument();
});

it('renders the server error envelope', async () => {
  server.use(
    http.delete(u('/me'), () =>
      HttpResponse.json({ code: 'UNAUTHENTICATED', messageKey: 'auth.invalidCredentials' }, { status: 401 }),
    ),
  );
  renderDeleteAccount();
  fireEvent.change(screen.getByLabelText(/type delete to confirm/i), { target: { value: 'DELETE' } });
  fireEvent.change(screen.getByLabelText(/your password/i), { target: { value: 'nope' } });
  fireEvent.click(screen.getByRole('button', { name: /delete my account/i }));

  expect(await screen.findByText(/email or password/i)).toBeInTheDocument();
});

it('clears the cached session and redirects to sign-in on success', async () => {
  renderDeleteAccount();
  fireEvent.change(await screen.findByLabelText(/type delete to confirm/i), {
    target: { value: 'DELETE' },
  });
  fireEvent.change(screen.getByLabelText(/your password/i), { target: { value: 'correct-horse' } });
  fireEvent.click(screen.getByRole('button', { name: /delete my account/i }));

  await waitFor(() => {
    expect(replace).toHaveBeenCalledWith('/sign-in');
  });
  expect(useSession.getState().token).toBeNull();
});
```

`replace` is the `next/navigation` `useRouter().replace` mock the other web tests in this repo already install; reuse that setup rather than adding a second router mock. Match `useSession`'s real state property for the persisted token.

- [ ] **Step 8: Run test to verify it fails**

Run: `pnpm --filter @kitchen/web exec vitest run src/components/settings/DeleteAccount.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 9: Write the hook**

Create `apps/web/src/hooks/account.ts`:

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { DeleteMeRequest } from '@kitchen/contracts';
import { api } from '../lib/api';
import { useSession } from '../stores/session';

export function useDeleteAccount() {
  const queryClient = useQueryClient();
  const clearSession = useSession((state) => state.clear);

  return useMutation({
    mutationFn: (body: DeleteMeRequest) => api.call('deleteMe', { body }),
    onSuccess: () => {
      // The account is gone; anything cached about it is now a lie. Locale and
      // appearance are deliberately left alone — they are device preferences,
      // and resetting them would flip an Arabic user to English mid-flow.
      clearSession();
      queryClient.clear();
    },
  });
}
```

Match the real names in `apps/web/src/stores/session.ts` for the session store and its clear/sign-out action; do not invent one.

- [ ] **Step 10: Write the screen**

Create `apps/web/src/components/settings/DeleteAccount.tsx`. It must:

- read the user via the existing `useMe`-equivalent hook and the households via the existing `useHouseholds`-equivalent hook, matching the names already used in `SettingsView.tsx`;
- for each household, compute the successor with the same rule as Task 7 — the surviving member with the earliest `joinedAt`, tie-broken by the lowest `userId` — and render `web.deleteAccount.handover` or `web.deleteAccount.destroy`;
- render the confirmation input labelled with `web.deleteAccount.confirmLabel` interpolating `deleteConfirmationWord(locale)`;
- render the password `Field` only when `user.hasPassword`;
- keep the `danger` Button disabled until `matchesDeleteConfirmation(input, locale)` and, when `hasPassword`, the password field is non-empty;
- render `errorMessageKey(mutation.error)` through `t` on failure;
- on success, `router.replace('/sign-in')`.

Use only existing tokens (`text-danger`, `bg-danger-soft`, the `danger` Button variant) and logical properties (`ms/me`, `ps/pe`, `text-start`). No hex literals — `token-usage.test.ts` will fail the build.

- [ ] **Step 11: Add the route and the link**

Create `apps/web/src/app/(app)/settings/delete-account/page.tsx`:

```tsx
import { DeleteAccount } from '../../../../components/settings/DeleteAccount';

export default function DeleteAccountPage() {
  return (
    <div className="mx-auto w-full max-w-2xl">
      <DeleteAccount />
    </div>
  );
}
```

In `apps/web/src/components/settings/SettingsView.tsx`, add a link to `/settings/delete-account` next to the existing feedback link, styled with the `danger` text token and labelled `web.deleteAccount.link`.

- [ ] **Step 12: Run test to verify it passes**

Run: `pnpm --filter @kitchen/web exec vitest run`
Expected: PASS, including `palette.test.ts` and `token-usage.test.ts`.

- [ ] **Step 13: Verify RTL in the browser**

Run `WEB_PORT=3200 pnpm dev`, open `http://localhost:3200/settings/delete-account`, switch the locale to Arabic and confirm the layout mirrors and no Latin tracking is applied to the Arabic text.

- [ ] **Step 14: Commit**

```bash
git add apps/web/src packages/i18n/src/web.en.ts packages/i18n/src/web.ar.ts
git commit -m "feat(web): add the delete-account screen with per-household consequences"
```

---

## Task 10: Mobile delete-account screen

**Files:**
- Create: `apps/mobile/src/lib/delete-confirmation.ts`
- Create: `apps/mobile/src/lib/delete-confirmation.spec.ts`
- Create: `apps/mobile/src/hooks/account.ts`
- Create: `apps/mobile/src/app/settings/delete-account.tsx`
- Create: `apps/mobile/src/stores/account-reset.ts`
- Create: `apps/mobile/src/stores/account-reset.spec.ts`
- Modify: `apps/mobile/src/app/settings/index.tsx`
- Modify: `apps/mobile/src/mocks/handlers.ts`
- Modify: `packages/i18n/src/mobile.en.ts`, `packages/i18n/src/mobile.ar.ts`

**Interfaces:**
- Consumes: the `deleteMe` route and `hasPassword` (Task 1).
- Produces: `matchesDeleteConfirmation(input: string, locale: Locale): boolean`, `deleteConfirmationWord(locale: Locale): string`, `useDeleteAccount()`.

Mobile has an obligation web does not: **the offline event queue must be emptied.** Clearing `expo-secure-store` while leaving queued inventory writes behind would replay them on reconnect for a user who no longer exists.

- [ ] **Step 1: Write the failing confirmation test**

Create `apps/mobile/src/lib/delete-confirmation.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { deleteConfirmationWord, matchesDeleteConfirmation } from './delete-confirmation';

describe('matchesDeleteConfirmation', () => {
  it('accepts the English word in any case, with surrounding whitespace', () => {
    expect(matchesDeleteConfirmation('DELETE', 'en')).toBe(true);
    expect(matchesDeleteConfirmation('delete', 'en')).toBe(true);
    expect(matchesDeleteConfirmation('  Delete  ', 'en')).toBe(true);
  });

  it('accepts the Arabic word', () => {
    expect(matchesDeleteConfirmation('حذف', 'ar')).toBe(true);
    expect(matchesDeleteConfirmation(' حذف ', 'ar')).toBe(true);
  });

  it('rejects the other locale word, near-misses and empty input', () => {
    expect(matchesDeleteConfirmation('حذف', 'en')).toBe(false);
    expect(matchesDeleteConfirmation('DELETE', 'ar')).toBe(false);
    expect(matchesDeleteConfirmation('DELET', 'en')).toBe(false);
    expect(matchesDeleteConfirmation('', 'en')).toBe(false);
  });

  it('exposes the word so the prompt and the check cannot drift apart', () => {
    expect(deleteConfirmationWord('en')).toBe('DELETE');
    expect(deleteConfirmationWord('ar')).toBe('حذف');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @kitchen/mobile exec vitest run src/lib/delete-confirmation.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the helper**

Create `apps/mobile/src/lib/delete-confirmation.ts`:

```ts
import type { Locale } from '@kitchen/contracts';

/**
 * Typed confirmation for account deletion. Localized, and therefore checked on
 * the client: comparing localized prose server-side is exactly the fragility
 * the i18n rules exist to prevent. This is accident prevention — the real
 * controls are the bearer token and the password.
 */
const WORDS: Record<Locale, string> = { en: 'DELETE', ar: 'حذف' };

export function deleteConfirmationWord(locale: Locale): string {
  return WORDS[locale];
}

export function matchesDeleteConfirmation(input: string, locale: Locale): boolean {
  const trimmed = input.trim();
  if (trimmed === '') return false;
  const word = WORDS[locale];
  // Arabic has no case, so `localeCompare` semantics buy nothing; a
  // case-insensitive compare is correct for both and free for one.
  return trimmed.toLocaleUpperCase(locale) === word.toLocaleUpperCase(locale);
}
```

The duplication with the web copy is intentional: the two apps share no runtime module, and adding a shared package for one twelve-line function would be worse.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @kitchen/mobile exec vitest run src/lib/delete-confirmation.spec.ts`
Expected: PASS

- [ ] **Step 5: Write the failing reset test**

Create `apps/mobile/src/stores/account-reset.spec.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { useOfflineQueue } from './offline-queue';
import { useAuth } from './auth';
import { resetAfterAccountDeletion } from './account-reset';

describe('resetAfterAccountDeletion', () => {
  beforeEach(() => {
    // Block body on purpose: an arrow with an implicit return hands Vitest a
    // teardown callback, which it then runs after every test.
    useOfflineQueue.setState({ events: [] });
  });

  it('empties the offline queue, so nothing replays for a deleted user', async () => {
    useOfflineQueue.setState({
      events: [{ id: 'evt-1', route: 'createInventoryEvent', body: {} } as never],
    });

    await resetAfterAccountDeletion();

    expect(useOfflineQueue.getState().events).toEqual([]);
  });

  it('clears the auth session', async () => {
    await resetAfterAccountDeletion();
    expect(useAuth.getState().session).toBeNull();
  });
});
```

Match the real state shape of `apps/mobile/src/stores/offline-queue.ts` and `apps/mobile/src/stores/auth.ts` — read them first and adjust the property names above to whatever they actually declare.

- [ ] **Step 6: Run test to verify it fails**

Run: `pnpm --filter @kitchen/mobile exec vitest run src/stores/account-reset.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 7: Write the reset and the hook**

Create `apps/mobile/src/stores/account-reset.ts`:

```ts
import { queryClient } from '../lib/query-client';
import { useAuth } from './auth';
import { useOfflineQueue } from './offline-queue';

/**
 * Local teardown after the server has deleted the account.
 *
 * Broader than sign-out on purpose: sign-out leaves queued offline events
 * alone because the same user will come back. Here they must go, or the queue
 * replays inventory writes on reconnect for a user who no longer exists.
 *
 * Locale and appearance are deliberately kept. They are device preferences,
 * not account data, and clearing them would drop an Arabic user onto an
 * English sign-in screen.
 */
export async function resetAfterAccountDeletion(): Promise<void> {
  await useOfflineQueue.getState().clear();
  await useAuth.getState().signOut();
  queryClient.clear();
}
```

If `offline-queue` has no `clear` action, add one that empties the persisted queue, and cover it in the spec above.

Create `apps/mobile/src/hooks/account.ts`:

```ts
import { useMutation } from '@tanstack/react-query';
import type { DeleteMeRequest } from '@kitchen/contracts';
import { api } from '../lib/api';
import { resetAfterAccountDeletion } from '../stores/account-reset';

export function useDeleteAccount() {
  return useMutation({
    mutationFn: (body: DeleteMeRequest) => api.call('deleteMe', { body }),
    onSuccess: async () => {
      await resetAfterAccountDeletion();
    },
  });
}
```

- [ ] **Step 8: Add the mock resolver**

In `apps/mobile/src/mocks/handlers.ts`, add to the `resolvers` record:

```ts
  deleteMe: () => new HttpResponse(null, { status: 204 }),
```

`coverage.spec.ts` fails if a route the app calls has no resolver, so this is not optional once the screen ships.

- [ ] **Step 9: Add the i18n strings**

The catalogs are **nested objects**, not flat dotted keys. Add a `deleteAccount` object inside the top-level `mobile` object, next to the existing `feedback` object.

In `packages/i18n/src/mobile.en.ts`:

```ts
    deleteAccount: {
      link: 'Delete account',
      title: 'Delete your account',
      intro:
        'This permanently deletes your account, your profile, your saved preferences and your feedback. It cannot be undone.',
      householdsTitle: 'What happens to your kitchens',
      handover: '{household} will be handed over to {successor}.',
      destroy: '{household} and everything in it will be deleted.',
      confirmLabel: 'Type {word} to confirm',
      passwordLabel: 'Your password',
      submit: 'Delete my account',
      cancel: 'Cancel',
      working: 'Deleting…',
    },
```

In `packages/i18n/src/mobile.ar.ts`, in the same position:

```ts
    deleteAccount: {
      link: 'حذف الحساب',
      title: 'حذف حسابك',
      intro:
        'سيؤدي هذا إلى حذف حسابك وملفك الشخصي وتفضيلاتك وملاحظاتك نهائيًا. لا يمكن التراجع عن هذا الإجراء.',
      householdsTitle: 'ماذا سيحدث لمطابخك',
      handover: 'سيتم نقل {household} إلى {successor}.',
      destroy: 'سيتم حذف {household} وكل ما فيه.',
      confirmLabel: 'اكتب {word} للتأكيد',
      passwordLabel: 'كلمة المرور',
      submit: 'حذف حسابي',
      cancel: 'إلغاء',
      working: 'جارٍ الحذف…',
    },
```

- [ ] **Step 10: Write the screen**

Create `apps/mobile/src/app/settings/delete-account.tsx`, modelled on `apps/mobile/src/app/settings/feedback.tsx`: `Screen` + `Header` with `onBack`, a `Card` per section, `Field` for the confirmation and the password, and a `danger` `Button`.

Behaviour is identical to the web screen: per-household consequence lines computed with the earliest-`joinedAt` rule, the password `Field` only when `user.hasPassword`, submit disabled until the confirmation matches, `errorMessageKey` on failure, and `router.replace('/sign-in')` on success.

Style keys must be logical (`marginStart`, `paddingEnd`) and colours must come from `../../theme` — the ESLint rule and `token-usage` sweep both apply.

- [ ] **Step 11: Link it from settings**

In `apps/mobile/src/app/settings/index.tsx`, add a `ListRow` pointing at `/settings/delete-account` beneath the feedback row, using `colors.danger` for its label and a `DirectionalIcon` chevron.

- [ ] **Step 12: Run the mobile suite**

Run: `pnpm --filter @kitchen/mobile exec vitest run && pnpm --filter @kitchen/mobile typecheck && pnpm --filter @kitchen/mobile lint`
Expected: PASS, including `mocks/coverage.spec.ts`, `theme/palette.spec.ts` and `theme/typography.spec.ts`.

- [ ] **Step 13: Commit**

```bash
git add apps/mobile/src packages/i18n/src/mobile.en.ts packages/i18n/src/mobile.ar.ts
git commit -m "feat(mobile): add the delete-account screen and clear the offline queue"
```

---

## Task 11: Store paperwork and the compliance guard

**Files:**
- Create: `docs/store-listing/age-rating.md`
- Modify: `docs/store-listing/data-safety.md`
- Modify: `apps/mobile/src/lib/store-policy.spec.ts`

**Interfaces:**
- Consumes: the `deleteMe` route (Task 1).
- Produces: nothing consumed by later tasks.

The repo's habit is to make store requirements self-enforcing rather than merely documented. Account deletion is a submission blocker, so a guard test asserts the route exists and is auth-gated.

- [ ] **Step 1: Write the failing guard test**

Append to `apps/mobile/src/lib/store-policy.spec.ts`:

```ts
/**
 * App Store Guideline 5.1.1(v) and Google Play's data-deletion policy both
 * require in-app account deletion. Removing the route would pass typecheck
 * and every feature test while making the app rejectable, so it is asserted
 * here alongside the other store rules.
 */
describe('account deletion policy', () => {
  it('exposes an authenticated account-deletion route', () => {
    expect(routes.deleteMe).toBeDefined();
    expect(routes.deleteMe.method).toBe('DELETE');
    expect(routes.deleteMe.auth).toBe(true);
  });

  it('is not household-scoped, so a user whose only kitchen is gone can still delete', () => {
    expect(routes.deleteMe.household).toBe(false);
  });

  it('ships a screen that reaches it', () => {
    const screen = readFileSync(join(SRC, 'app', 'settings', 'delete-account.tsx'), 'utf8');
    expect(screen).toContain('useDeleteAccount');
  });
});
```

Add `import { routes } from '@kitchen/contracts';` to the file's imports.

- [ ] **Step 2: Run test to verify it fails, then passes**

Run: `pnpm --filter @kitchen/mobile exec vitest run src/lib/store-policy.spec.ts`
Expected: PASS, because Tasks 1 and 10 already shipped both halves. If it fails, the earlier task is incomplete — fix that, not this test.

- [ ] **Step 3: Write the age rating document**

Create `docs/store-listing/age-rating.md`, matching the structure of `data-safety.md`. It must record, with the reasoning that produced each answer:

- **Apple** — the age-rating questionnaire answers. Every violence, sexual content, gambling, horror and mature-themes question is *None*. Unrestricted web access: **No** — the app opens YouTube recipe videos, but through specific video ids obtained from the YouTube Data API, not an in-app browser. User-generated content: **No** — feedback is submitted to us privately and is never shown to other users. Expected result: **4+**.
- **Google Play / IARC** — the same answers in IARC's wording. Expected result: **Everyone**.
- A note that the answers must be revisited if the app ever renders another user's text, or opens an arbitrary URL.

- [ ] **Step 4: Update the data safety document**

In `docs/store-listing/data-safety.md`:

- Replace the claim that feedback cascade is the only erasure path with a description of `DELETE /me`: what it erases, what survives de-attributed (`inventory_events.actor_user_id`, `feedback.reviewed_by`) and why.
- Record the Google Play **account deletion URL** as the web route `/settings/delete-account`. Note that Google permits that page to require sign-in, but it may not require installing the app — which is why the web client implements the screen too, not only mobile.
- Record that Sign in with Apple tokens are revoked on deletion, per Guideline 5.1.1(v).

- [ ] **Step 5: Full workspace verification**

Run: `pnpm build && pnpm typecheck && pnpm lint && pnpm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add docs/store-listing apps/mobile/src/lib/store-policy.spec.ts
git commit -m "docs: record the age rating and account-deletion data safety answers"
```

---

## Done when

- `DELETE /me` deletes the account, hands over shared households, tears down solo ones, and best-effort revokes Apple.
- Both clients ship a reachable deletion screen that names the per-household consequence before it happens.
- `docs/store-listing/age-rating.md` and the updated `data-safety.md` answer both questionnaires.
- `pnpm build && pnpm typecheck && pnpm lint && pnpm test` passes from a clean checkout with `pnpm infra:up && pnpm db:migrate && pnpm db:seed` done first.
