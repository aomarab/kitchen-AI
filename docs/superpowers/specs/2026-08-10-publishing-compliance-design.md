# Publishing compliance: account deletion, Apple token revocation, age rating

**Date:** 2026-08-10
**Status:** Approved design
**Sub-project:** 2 of 4 from `2026-08-09-product-feedback-admin-console-design.md` §Decomposition

## 1. Why

The app cannot be submitted to either store without in-app account deletion.

- **Apple App Store Review Guideline 5.1.1(v)** — an app that supports account creation must
  let the user initiate account deletion from inside the app.
- **Google Play Data deletion policy** — the same requirement, plus a deletion URL declared on
  the store listing.
- **Apple Guideline 5.1.1(v) / Sign in with Apple** — an account created through Sign in with
  Apple must have its Apple token revoked on deletion, so the user's Apple ID is fully
  disconnected from the app.

Two secondary blockers ship with it: the age rating questionnaires (Apple + Google IARC) are
required at submission, and `docs/store-listing/data-safety.md` currently asserts that feedback
cascade is the only erasure path, which stops being true.

Nothing here is optional or deferrable. The store rejects the binary without it.

## 2. Scope

**In scope**

1. `DELETE /me` — permanent, immediate account deletion.
2. Household succession, so deleting a user never destroys a co-member's data.
3. Apple refresh-token capture at sign-in and revocation at deletion, behind a mock adapter.
4. Deletion UI on web and mobile.
5. `docs/store-listing/age-rating.md`, and an update to `data-safety.md`.

**Out of scope** — deliberately, not by omission

- Data export or portability. Neither store requires it for this app's data classes.
- A grace period, soft delete, or restore window. Decided against in brainstorming: deletion is
  immediate and permanent, which is what the privacy policy already promises.
- Transfer-ownership or promote-to-owner UI. Succession happens automatically during deletion;
  a user-facing ownership screen is a separate feature.
- The transitive native-pod data-collection audit logged during Task 10. It needs a real
  `expo prebuild` to inspect and belongs with sub-project 3 (device compatibility).

## 3. Decisions

| Question | Decision |
| --- | --- |
| What happens to a shared household? | Auto-promote the longest-standing member. Delete the household only if the leaving user was its last member. |
| Timing | Immediate and permanent. No grace period. |
| Feedback rows | Let them `CASCADE`. This matches the published privacy policy and the existing `data-safety.md` claim. |
| Apple revocation | Included now, behind a `Mock`/`Http` adapter pair like every other external call. |
| Friction | Type a localized confirmation word, plus password re-entry where a password exists. |
| Revoke ordering | Revoke **before** the deletion transaction, best-effort — a revoke failure never blocks deletion. |
| `households.created_by` | Repoint to a surviving owner. No migration, no contract change. |

### 3.1 Why revoke first, and why best-effort

Revoking after a successful delete means that if the revoke call fails, the token is already
gone and we are permanently non-compliant with no way to retry. Revoking first inverts the
failure into a recoverable one: if the revoke succeeds but the delete fails, the user simply
re-links Apple at next sign-in.

The call is made **outside** the transaction. Network I/O inside a database transaction holds
locks for the duration of a third-party round trip.

Best-effort is the other half. If Apple is unreachable we log the failure and delete anyway.
Blocking a user's account deletion on a third-party outage would itself violate the guideline
this feature exists to satisfy.

### 3.2 Why `created_by` needs no migration

`households.created_by` is `ON DELETE RESTRICT`, so a naive `DELETE FROM users` fails for
anyone who has ever created a household.

It is pure provenance: written once in `households.service.ts`, read only by the serializer,
exposed as `createdBy: uuidSchema` in the contract, and **rendered by no client**. Because the
algorithm below guarantees that a surviving household always has a surviving owner,
`created_by` can always be repointed. Making the column nullable instead would force the
contract to `string | null` and every consumer to handle a case that cannot occur.

## 4. Data model

One migration, generated with `pnpm db:generate` and committed under `apps/api/drizzle/`.

Two nullable columns on `oauth_accounts`:

| Column | Type | Purpose |
| --- | --- | --- |
| `refresh_token_encrypted` | `text` | Apple refresh token, AES-256-GCM ciphertext. Null for Google and for Apple accounts predating this change. |
| `revoke_client_id` | `text` | The `aud` value validated at sign-in. |

`revoke_client_id` exists because `APPLE_CLIENT_ID` is a comma-separated list — Apple issues a
different client id per platform, and the revoke request must present the one the token was
issued to. Guessing would silently fail for whichever platform we guessed wrong.

No other schema change. No change to `users`, `households`, or any cascade rule.

### 4.1 Encryption

An Apple refresh token is a live third-party credential. Unlike our own refresh tokens — which
are stored hashed — revocation needs it back in plaintext, so hashing is not available.

AES-256-GCM via `node:crypto`, no new dependency. A fresh random 12-byte IV per record; stored
as base64 `iv.tag.ciphertext`. The key comes from `APPLE_TOKEN_ENC_KEY` (32 bytes, base64).

Helper lives at `apps/api/src/auth/token-crypto.ts` with its own unit spec covering round-trip,
tampered-ciphertext rejection (GCM auth tag), and distinct IVs across two encryptions of the
same input.

### 4.2 Environment

Added to the `env.ts` zod contract:

| Var | Shape | Default |
| --- | --- | --- |
| `APPLE_REVOKE_MOCK` | `'true' \| 'false'`, transformed to boolean — mirrors `AI_MOCK` | `'true'` |
| `APPLE_TEAM_ID` | string | `''` |
| `APPLE_KEY_ID` | string | `''` |
| `APPLE_PRIVATE_KEY` | string, `.p8` contents | `''` |
| `APPLE_TOKEN_ENC_KEY` | string, base64, 32 bytes decoded | `''` |

A `superRefine` guard alongside the existing ones: when `NODE_ENV === 'production'` and
`APPLE_REVOKE_MOCK` is false, all four of the above are required, and `APPLE_TOKEN_ENC_KEY` must
decode to exactly 32 bytes. The API refuses to boot otherwise, matching how the OpenAI key and
OAuth client ids are already guarded.

Defaulting `APPLE_REVOKE_MOCK` to true keeps the whole system running offline and free, like
`AI_MOCK`.

## 5. Apple token revocation

### 5.1 Capturing the token

Apple returns an `authorizationCode` alongside the identity token. It is single-use and expires
in about five minutes, so it must be exchanged during sign-in; there is no lazy option.

- `apps/mobile/src/lib/oauth.ts` currently returns `credential.identityToken` and **discards
  `credential.authorizationCode`**. It starts forwarding it.
- `oauthLoginRequestSchema` gains `authorizationCode: z.string().min(1).optional()`. Optional,
  so the web flow and older mobile builds keep working unchanged.
- On receiving one for `provider: 'apple'`, the API exchanges it at Apple's token endpoint for a
  refresh token, encrypts it, and stores it with the validated `aud`.

**The exchange is best-effort and must never fail a sign-in.** If Apple's token endpoint is
down, the user still signs in; we simply have no token to revoke later, and deletion proceeds
without a revoke. Breaking authentication to preserve a deletion-time nicety is the wrong
trade.

### 5.2 The adapter

`APPLE_TOKEN_REVOKER`, a symbol in a new `apps/api/src/auth/auth.constants.ts`, following the
shape of `ai.constants.ts`.

```
interface AppleTokenRevoker {
  exchangeCode(code: string, clientId: string): Promise<string | null>;
  revoke(refreshToken: string, clientId: string): Promise<void>;
}
```

- `MockAppleTokenRevoker` — returns a deterministic fake token, records revoke calls. Selected
  when `APPLE_REVOKE_MOCK` is true, which is the default, so the full flow is exercised in tests
  and local development with no Apple credentials.
- `HttpAppleTokenRevoker` — signs a client-secret JWT (ES256, from the `.p8` key, key id and
  team id) and calls Apple's `/auth/token` and `/auth/revoke`. Bounded timeout, no retries: the
  caller is already best-effort.

Google needs no equivalent. Google's deletion policy is satisfied by deleting the linked
account record; token revocation is an Apple-specific guideline.

## 6. Deletion algorithm

`AuthService.deleteAccount(userId, password?)`.

**Step 1 — re-authenticate.** If the user has a `passwordHash`, `password` is required and
verified. Missing → `AppError.unauthenticated('auth.passwordRequired')`; wrong →
`AppError.unauthenticated('auth.invalidCredentials')`, reusing the existing key rather than
revealing that the account exists in a new way. OAuth-only accounts skip this; their bearer
token is the proof.

**Step 2 — revoke.** Read and decrypt any Apple refresh token, call `revoke`, swallow and log
failures. Outside the transaction.

**Step 3 — delete**, in one transaction, with `SELECT … FOR UPDATE` on the household's
membership rows:

```
for each household the user belongs to:
    lock its household_members rows
    if the user is the only member:
        delete the household            -- cascades 10 tables
    else:
        if no other member has role 'owner':
            promote the longest-standing member to 'owner'
        if created_by == this user:
            repoint it to the longest-standing owner
delete the user row                     -- cascades oauth_accounts, refresh_tokens,
                                        -- profiles, household_members, feedback
```

"Longest-standing" is `min(joined_at)`, tie-broken by `min(user_id)` so the result is
deterministic and testable.

The `created_by` repoint applies to **every** surviving household, not only the promotion case.
The `RESTRICT` fires whenever the column points at the departing user, even if they were never
the sole owner — a non-owner who created the household and later handed it over still trips it.

The row lock exists because two co-owners deleting concurrently would otherwise each observe the
other as a surviving member, and both could skip promotion, leaving an ownerless household.

### 6.1 What survives

`inventory_events.actor_user_id` is `ON DELETE SET NULL`, and that is correct, not an oversight.
`inventory_items.quantity` is materialized from the event ledger; deleting a departing member's
events would silently corrupt every remaining member's pantry totals. The events are
**de-attributed, not destroyed** — the audit trail keeps its arithmetic and loses its identity.
The same applies to `feedback.reviewed_by` for a deleted staff reviewer.

## 7. API surface

`packages/contracts` is coordinator-owned; this is a coordinated change.

```
deleteMe: {
  method: 'DELETE',
  path: '/me',
  auth: true,
  household: false,       // deletion spans every household, so it is not scoped to one
  body: deleteMeRequestSchema,
  response: emptyResponse,
}
```

```
export const deleteMeRequestSchema = z.object({
  password: z.string().min(1).optional(),
});
```

`userSchema` gains `hasPassword: z.boolean()`. Without it a client cannot know whether to render
the password field: the schema today exposes only `id`, `email`, `displayName`, `locale` and
`createdAt`, and an OAuth-only account is indistinguishable from a password account. The
alternative — submit blind, then reveal the field after a rejection — is a poor interaction for
a destructive, irreversible action.

The field is derived (`passwordHash !== null`), never the hash itself. It is an additive change,
so the serializer, both MSW mock databases (`apps/web/src/mocks`, `apps/mobile/src/mocks`) and
any user fixture must be updated in the same commit or their schema validation fails.

`household: false` matters — the route must work regardless of which household is selected, and
requiring `x-household-id` would make deletion fail for a user whose only household is gone.

**The typed confirmation word is not sent to the server.** It is localized (`DELETE` / `حذف`),
and comparing localized prose server-side is exactly the fragility the i18n rules exist to
prevent. It is accident prevention; the server's actual controls are the bearer token and the
password.

Handled in `AuthController` with `@UseGuards(AuthGuard)` and `@CurrentUser()`, body validated by
`@Body(new ZodPipe(deleteMeRequestSchema))`.

Adding a route to the registry obliges both mock layers: `apps/mobile/src/mocks/coverage.spec.ts`
iterates `routes` and fails if any route lacks a resolver, so `deleteMe` handlers land on mobile
and web in the same commit as the contract change.

## 8. Clients

A dedicated route on each, following the existing `settings/feedback` pattern rather than
growing the already-225-line `SettingsView`:

- `apps/mobile/src/app/settings/delete-account.tsx`, reached from a `ListRow` in
  `settings/index.tsx`
- `apps/web/src/app/(app)/settings/delete-account/page.tsx` plus
  `components/settings/DeleteAccount.tsx`

Both use the existing `danger` token and `danger` Button variant. No new design tokens, so
`palette.test.ts`, `palette.spec.ts` and `token-usage.test.ts` are untouched.

### 8.1 The screen

1. What is deleted, plainly.
2. **Per-household consequences, computed** from the membership data both clients already fetch
   for their household screens — one line each: *"Ramy's Kitchen will be handed over to Sara"*
   or *"Ramy's Kitchen and everything in it will be deleted."*
3. Localized typed confirmation. Submit stays disabled until it matches.
4. A password field, shown only when the account has a password.
5. `danger` submit.

A static warning would satisfy a store reviewer, but silently destroying a shared pantry is a
real harm, and we already hold the data needed to name the outcome.

### 8.2 After success

Both clients **clear local state, not just the token.**

Mobile especially: wiping `expo-secure-store` while leaving the offline event queue populated
would let it replay inventory writes on reconnect for a user who no longer exists. The auth
session store, the offline queue (`src/lib/event-queue.ts`, `src/stores/offline-queue.ts`) and
the TanStack Query cache are all reset. Web clears its localStorage token and query cache.

Locale and appearance preferences are deliberately **kept**. They are device preferences, not
account data, and resetting them would flip the app to English mid-flow — leaving an Arabic
user staring at a sign-in screen in a language they did not choose.

Both then redirect to sign-in.

### 8.3 i18n and RTL

New strings go to `web.{en,ar}.ts` and `mobile.{en,ar}.ts`. The backend contributes one shared
key, `auth.passwordRequired`, to `en.ts`/`ar.ts` next to the existing `auth.invalidCredentials`.
`ar.ts` is typed against `en.ts`, so a missing translation is a build error.

No physical-direction styles; chevrons go through `DirectionalIcon`.

The Arabic confirmation word is `حذف`. The comparison trims surrounding whitespace and is
case-insensitive for the Latin form.

## 9. Store paperwork

**`docs/store-listing/age-rating.md`** — new, same shape as `data-safety.md`: the Apple age
rating questionnaire answers and the Google Play IARC answers, each with the reasoning that
produced it, so the next submitter does not re-derive them.

**`docs/store-listing/data-safety.md`** — updated. Its claim that feedback cascade is the only
erasure path is superseded, and Google Play's declared account-deletion URL is recorded there:
the web `/settings/delete-account` route. Google permits that page to require sign-in; it may
not require installing the app.

## 10. Testing

**API integration tests** (`src/auth/*.spec.ts`, live Postgres, existing `createTestContext` /
`seedUser` / `seedHousehold` harness). This is where the weight goes: every failure mode is
destructive and irreversible.

- promotion selects the longest-standing member, deterministically on a `joined_at` tie
- `created_by` repoints when the deleted user was the sole owner
- `created_by` repoints when the deleted user was a **non-owner creator** — the case that trips
  `RESTRICT` unexpectedly
- last member deletes the household; all ten cascading tables go with it
- password required, wrong password rejected, OAuth-only account needs none
- Apple revoke is called with the decrypted token and the stored `revoke_client_id`
- **revoke failure still deletes**
- feedback rows cascade
- `inventory_events.actor_user_id` becomes null while `inventory_items.quantity` is unchanged
- refresh tokens are gone, so an issued token cannot be refreshed after deletion
- `getMe` reports `hasPassword` correctly for both a password account and an OAuth-only one

Cleanup ordering in the harness matters: households before users, per the existing FK
constraint.

**Unit**: `token-crypto.spec.ts` as described in §4.1.

**Web** (`jsdom`, MSW): submit disabled until the confirmation matches; password field appears
only for password accounts; error envelope renders; success clears the cache and redirects.

**Mobile** (node, logic only): confirmation matching in both locales; the post-deletion reset
empties the offline queue.

**Guard test**: `apps/mobile/src/lib/store-policy.spec.ts` gains an assertion that the
`deleteMe` route is registered in the contract and is auth-gated. The repo's habit is to make
store requirements self-enforcing rather than merely documented, and this one is a submission
blocker.

All test files use block-bodied `beforeEach`/`afterEach`. An arrow with an implicit return hands
Vitest a teardown callback, which has already cost this project two debugging sessions.

## 11. Risks

| Risk | Mitigation |
| --- | --- |
| Deletion is irreversible; a bug destroys real data | Integration tests against live Postgres cover every branch; the transaction is all-or-nothing. |
| Apple `.p8` key material in production config | Never committed; required only when `APPLE_REVOKE_MOCK` is false, and the boot guard fails closed. |
| Encryption key rotation | Out of scope. `refresh_token_encrypted` is nullable and a failed decrypt is treated as "no token" — a rotated key degrades to no-revoke, never to a crash. |
| An Apple account created before this ships has no stored token | Same degradation: no token, no revoke, deletion proceeds. Unavoidable retroactively. |
