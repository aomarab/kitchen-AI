# App Store Connect — App Privacy answer sheet

A click-by-click, copy-paste answer sheet for the **App Privacy** section in App
Store Connect (App Store Connect → your app → **App Privacy** → **Edit**). Every
answer here is grounded in `docs/store-listing/data-safety.md`, the privacy
manifest in `apps/mobile/app.json` (`expo.ios.privacyManifests`), and the code.

> **These answers must match the privacy manifest entry-for-entry.** Apple
> checks the manifest against these console answers, and a disagreement is a
> rejection. If you change what the app collects, update `data-safety.md`,
> `app.json`, and this file in the same change —
> `apps/mobile/src/lib/store-policy.spec.ts` fails the build if the declared set
> drifts.

---

## Step 0 — The first question

> **"Do you or your third-party partners collect data from this app?"**

Answer: **Yes, we collect data from this app.**

## Step 1 — Select these five data types

On the "Select the data types collected" grid, check exactly these — nothing
else:

| App Store data type     | Category     | Comes from                | Collected |
| ----------------------- | ------------ | ------------------------- | --------- |
| **Email Address**       | Contact Info | Account creation / OAuth  | Yes       |
| **Name**                | Contact Info | Account creation / OAuth  | Yes       |
| **Photos or Videos**    | User Content | Kitchen / receipt capture | Yes       |
| **Other User Content**  | User Content | Feedback message          | Yes       |
| **Product Interaction** | Usage Data   | Feedback rating           | Yes       |

Leave **everything else "Not Collected"** — in particular:

- **No** Identifiers → no Device ID, no User ID beyond the account, **no
  advertising identifier**.
- **No** Usage Data beyond Product Interaction (no analytics SDK is present).
- **No** Location, Contacts, Health, Financial Info, Browsing History, Search
  History, Sensitive Info, Diagnostics.

Because no data is used for tracking and no ad/analytics SDK ships, **no App
Tracking Transparency (ATT) prompt** is required, and you declare **no**
tracking below.

## Step 2 — For EACH of the five types, answer identically

App Store Connect asks the same three questions per data type. Give the **same
three answers every time**:

1. **"How is this data used?"** → check **App Functionality** only.
   (Do **not** check Analytics, Product Personalization, App Functionality's
   siblings, Advertising, or Developer's Advertising.)
2. **"Is this data linked to the user's identity?"** → **Yes, linked to the
   user.**
3. **"Do you use this data for tracking purposes?"** → **No.**

Per-type purpose notes (all map to **App Functionality**):

- **Email Address** — sign-in and account recovery.
- **Name** — display name shown in the app.
- **Photos or Videos** — recognising the items in your kitchen / on a receipt.
- **Other User Content** — the feedback message you type.
- **Product Interaction** — the feedback rating you give.

## Step 3 — Data collected but not sent to your servers?

Answer honestly for photos: they **are** collected. They upload directly from
the device to your object storage via a presigned URL and are referenced only by
an object key afterward, but they land on infrastructure you control and are
linked to the account — so **Photos or Videos = collected** (as above). Do not
mark them "not collected".

## Step 4 — Nutrition / privacy "nutrition label" review

After saving, the generated label should read:

- **Data Linked to You:** Email Address, Name, Photos or Videos, Other User
  Content, Product Interaction.
- **Data Used to Track You:** _(none)_.
- **Data Not Linked to You:** _(none)_.

If anything else appears, you over-declared — go back and uncheck it.

---

## Related metadata (same submission, different screens)

These live outside the App Privacy questionnaire but are checked at review:

- **Privacy Policy URL** (App Information → General): required, must be a public
  HTTPS page. **Published:**
  **https://aomarab.github.io/kitchen-AI/privacy-policy.html** (Terms:
  **https://aomarab.github.io/kitchen-AI/terms-of-service.html**). Contact on the
  policy: **aomarab@outlook.com**; provider **Abdulraheem Omar (Jordan)**.
- **Account deletion** (Guideline 5.1.1(v)): the app ships in-app deletion
  (`DELETE /me`, Settings on both clients). The policy documents the in-app path
  (**Settings → Delete account**); if a form requires a URL, point it at the
  Privacy Policy above, which describes deletion in Section 8.
- **Age rating** questionnaire: see `docs/store-listing/age-rating.md`.
- **Sign in with Apple**: required by Guideline 4.8 because the app offers Google
  sign-in — it is already implemented; make sure it is offered on the sign-in
  screen at review.

## Why these exact answers (source of truth)

The five types are exactly the manifest set in `apps/mobile/app.json`:
`NSPrivacyCollectedDataTypeEmailAddress`, `…Name`, `…PhotosorVideos`,
`…OtherUserContent`, `…ProductInteraction` — each declared
`Linked: true`, `Tracking: false`, purpose `…AppFunctionality`, and
`NSPrivacyTracking: false`. This sheet is the human-readable projection of that
manifest; keep the two in step.
