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

These must match `apps/mobile/ios/KitchenAI/PrivacyInfo.xcprivacy` entry for
entry; the manifest and the console answers are checked against each other, and
a disagreement is a rejection. The manifest declares the same five types with
`NSPrivacyCollectedDataTypeLinked = true` and
`NSPrivacyCollectedDataTypeTracking = false`.

## Play Console — Data safety

- *Personal info* → **Name**, **Email address**
- *Photos and videos* → **Photos**
- *App activity* → **Other user-generated content**

For each: collected, **not** shared, processed off-device (the feedback row is
stored on our server), and **not** ephemeral.

Answer "Yes" to *Can users request that their data be deleted?* only once
sub-project 2 ships an in-app account-deletion path. Until then this feature is
publishable but the app as a whole is not — see the blocker below.

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
