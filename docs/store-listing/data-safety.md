# Store data declarations

The answers to give in App Store Connect and the Play Console, and why. Update
this file in the same change as any new data collection — the point is that the
console answers have a reviewable source, rather than being reconstructed from
memory at submission time.

## What this app collects

| Data                 | Where from               | Linked to identity | Used for tracking | Purpose                                     |
| -------------------- | ------------------------ | ------------------ | ----------------- | ------------------------------------------- |
| Email address        | Account creation, OAuth  | Yes                | No                | App functionality (sign-in, account recovery) |
| Name                 | Account creation, OAuth  | Yes                | No                | App functionality (display name)            |
| Photos               | Kitchen/receipt capture  | Yes                | No                | App functionality (recognising items)       |
| Other user content   | Feedback message         | Yes                | No                | App functionality (product support)         |
| Product interaction  | Feedback rating          | Yes                | No                | App functionality (product support)         |

Nothing is shared with data brokers. No advertising identifiers are collected.
No third-party analytics SDK is present, so no App Tracking Transparency prompt
is required.

Photos are uploaded straight to object storage from the device via a presigned
URL and are referenced afterwards only by object key. They still count as
collected — they land on infrastructure we control and are linked to the
account that uploaded them.

## App Store Connect — App Privacy

Declare, all *Linked to the User*, *Not Used for Tracking*, purpose **App
Functionality**:

- **Email Address** and **Name** (Contact Info)
- **Photos or Videos** (User Content)
- **Other User Content** (User Content) — the feedback message
- **Product Interaction** (Usage Data) — the feedback rating

These must match the privacy manifest entry for entry; the manifest and the
console answers are checked against each other, and a disagreement is a
rejection.

The manifest is declared in **`apps/mobile/app.json`** under
`expo.ios.privacyManifests` — not in `apps/mobile/ios/KitchenAI/PrivacyInfo.xcprivacy`.
That file is `expo prebuild` output and is gitignored, so an edit made there is
erased by the next prebuild. Expo merges the config into the generated file,
preserving the required-reason API entries the pods contribute.
`apps/mobile/src/lib/store-policy.spec.ts` asserts the declared set, so adding a
new kind of collected data fails the build until this document is updated too.

## Play Console — Data safety

- *Personal info* → **Name**, **Email address**
- *Photos and videos* → **Photos**
- *App activity* → **Other user-generated content**

For each: collected, **not** shared, processed off-device (the feedback row is
stored on our server), and **not** ephemeral.

Answer **Yes** to both *Can users request that their data be deleted?* and *Does
your app provide a way for users to request that their data be deleted?* — the
app ships in-app account deletion, described under **Account deletion** below.

Record the **account deletion URL** as the web route
**`/settings/delete-account`** (`apps/web/src/app/(app)/settings/delete-account`).
Google requires a web-reachable deletion path: it permits that page to require
sign-in, but it may **not** require installing the app to reach it. That is why
the deletion screen is implemented on web as well as mobile
(`apps/web/src/components/settings/DeleteAccount.tsx`), not on mobile alone —
the mobile screen satisfies the in-app requirement, the web page satisfies the
publicly reachable URL requirement.

## Privacy policy

The published policy must state, in plain language:

> When you send us feedback, we receive your rating, your message, the app
> version, and your language. Our staff can see this along with the email
> address and display name on your account, so we can understand and act on
> what you told us. We do not use your feedback to decide whether to show you
> an App Store or Google Play review prompt.

That last sentence is a commitment, not decoration: it is enforced in code by
`apps/mobile/src/lib/store-policy.spec.ts`, which fails the build if anything
under `apps/mobile/src` imports a store-review API.

## Account deletion

Apple Guideline 5.1.1(v) requires an app that supports account creation to also
support in-app account deletion, and the Play Console asks the same question
directly. Both are satisfied by **`DELETE /me`** (contract route `deleteMe`,
`auth: true`, `household: false`), reached from Settings on both clients. A
password account confirms with its password; an OAuth-only account confirms by
typing a localized word. The route is asserted, and kept auth-gated, by
`apps/mobile/src/lib/store-policy.spec.ts`.

**What deletion erases.** `apps/api/src/auth/account-deletion.ts` runs first, so
the `users` row can be removed, and the delete then cascades through every table
that references the user `ON DELETE CASCADE`:

- `refresh_tokens` — every session token is destroyed.
- `oauth_accounts` — the Google and Apple links, including the stored Apple
  refresh token.
- `profiles` — dietary preferences, allergies, halal flag.
- The user's own `feedback` rows (ratings and messages they submitted).
- `household_members`, plus every household that is left with no surviving
  member: that household and all of its household-scoped data (storage
  locations, inventory items and events, meal plans, shopping lists, jobs,
  receipts, usage records) cascade away with it.

Households the user created or belongs to that still have other members are
**handed over** to a surviving member rather than destroyed — succession is
deterministic (earliest `joinedAt`, ties broken by lowest `userId`), and it also
rewrites `households.created_by`, which is `ON DELETE RESTRICT`, off the
departing user.

**What survives, de-attributed.** Two references are `ON DELETE SET NULL` on
purpose, so shared history is not destroyed along with the individual:

- **`inventory_events.actor_user_id`** is set to NULL. The event ledger belongs
  to the household, not the person — quantities are materialized from it — so a
  departing member's writes stay in the kitchen's history but lose their
  attribution rather than being erased.
- **`feedback.reviewed_by`** is set to NULL. If the deleted user was staff who
  had reviewed *another* user's feedback, that feedback row survives with its
  reviewer de-attributed. (Feedback the deleted user *submitted* is erased by the
  cascade above; this covers only the reviewer link.)

**Local device data is cleared too.** On success the web client wipes the
persisted token pair from `localStorage` (`apps/web/src/lib/api.ts`,
`clearStoredTokens`); the mobile client clears the `expo-secure-store` tokens
**and** the persisted offline event queue
(`apps/mobile/src/stores/account-reset.ts`), so a queued write never replays for
an account that no longer exists.

**Sign in with Apple tokens are revoked** on deletion, as Guideline 5.1.1(v)
requires for apps that use Apple sign-in. The revoke is best-effort and runs
before the transaction (`apps/api/src/auth/apple-token-revoker.ts`): an Apple
outage must not block a user from deleting their account, so a failed revoke is
logged and the deletion proceeds.

## Guideline 1.2 (user-generated content)

Does **not** apply to this feature: no user can see another user's feedback, so
the filtering, reporting, blocking and published-contact obligations are not
triggered. This changes the moment grocery-item reviews ship (sub-project 4) —
revisit this section then rather than assuming it still holds.
