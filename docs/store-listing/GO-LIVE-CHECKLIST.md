# GO-LIVE checklist — Mama's Kitchen (iOS)

One ordered, checkbox sequence from "code is ready" to "submitted for review".
Each phase links to the detailed doc that owns it. Do the phases **in order** —
later phases assume earlier ones are done.

- App: **Mama's Kitchen** · bundle **`com.abedomar.kitchenai`** · Apple Team
  **`YVBW6U3Q43`** · provider **Abdulraheem Omar (Jordan)** · contact
  **aomarab@outlook.com**
- Status: **all code and paperwork are done.** Everything below is
  console/account work on your side — none of it can be done from the repo.

---

## Phase 0 — Security (do this FIRST, before any public build)

Keys were pasted into a chat transcript, so treat them as compromised.

- [ ] Rotate the **OpenAI** key (`OPENAI_REALTIME_API_KEY`, used for realtime).
- [ ] Rotate the **OpenRouter** key (`OPENAI_API_KEY` + `OPENAI_BASE_URL`, used
      for all normal AI via `AiGateway`).
- [ ] Rotate the **RevenueCat** keys (public SDK key + secret/webhook key).
- [ ] Set an **OpenAI hard monthly spend limit** so a runaway can't drain the
      account.
- [ ] Update the deployed API's environment with the new keys and redeploy;
      confirm a scan + a live-assistant session still work.

## Phase 1 — App Store Connect: create the app record

→ details: `docs/store-listing/iap-setup.md`

- [ ] In App Store Connect, create the app for **`com.abedomar.kitchenai`**.
- [ ] Note the numeric **App ID** (Apple ID) it generates — needed for
      `eas submit` / `ascAppId`.
- [ ] Fill **App Information**: name, subtitle, category, and the **Privacy
      Policy URL** (set in Phase 4).

## Phase 2 — In-app purchase

→ details: `docs/store-listing/iap-setup.md`

- [ ] Create the **consumable** IAP `credits_300` ("300 Credits", $4.99 tier).
- [ ] Fill its localizations + review screenshot; get it to at least "Ready to
      Submit". (The first IAP is reviewed **with** the app.)

## Phase 3 — RevenueCat + the one env swap

→ details: `docs/store-listing/iap-setup.md`

- [ ] In RevenueCat: create the App Store app, add the entitlement, map the
      `credits_300` product, set the App Store Connect shared secret + webhook.
- [ ] Copy the RevenueCat **public SDK key**.
- [ ] Replace `EXPO_PUBLIC_REVENUECAT_API_KEY`'s placeholder
      (`appl_REPLACE_WITH_REVENUECAT_PUBLIC_SDK_KEY`) in
      **`apps/mobile/eas.json`** (`build.production.env`) with that key, then
      commit. **This is the single code value left to fill.**

## Phase 4 — Legal hosting

→ source docs: `docs/legal/privacy-policy.md`, `docs/legal/terms-of-service.md`

- [ ] Have counsel review both documents (a few counsel/URL brackets are still
      flagged in them).
- [ ] Publish both at **public HTTPS URLs**.
- [ ] Paste the **Privacy Policy URL** into App Store Connect → App Information.

## Phase 5 — App Privacy questionnaire

→ answer sheet: `docs/store-listing/app-store-privacy-answers.md`

- [ ] Fill App Store Connect → **App Privacy** using the answer sheet (5 data
      types, all Linked / not Tracking / App Functionality; no ATT).
- [ ] Confirm the generated nutrition label matches the `app.json` privacy
      manifest exactly (the build test `store-policy.spec.ts` pins the same set).

## Phase 6 — Listing assets

- [ ] Screenshots for required device sizes (show the pantry, a meal plan, and
      the live assistant).
- [ ] Description, keywords, support URL, marketing URL (optional).
- [ ] **Age rating** questionnaire → `docs/store-listing/age-rating.md`.

## Phase 7 — Build & submit

→ full CLI runbook: `docs/store-listing/eas-release-runbook.md`

- [ ] `eas login` → `eas init` (writes the missing `projectId` to `app.json`;
      commit it).
- [ ] `eas build --platform ios --profile production` (store mocks off, real RC
      key, remote-managed build number). **This build is what makes the 5-minute
      session cap real on-device.**
- [ ] `eas submit --platform ios --profile production --latest` (pick the app
      record from Phase 1, or set `ascAppId` in `eas.json` first).

## Phase 8 — Finish in App Store Connect & submit for review

→ reviewer notes to paste: `docs/store-listing/app-review-notes.md`

- [ ] Attach the uploaded build to the version.
- [ ] Attach the `credits_300` IAP to the version.
- [ ] Paste **App Review Information**: create the email/password demo account
      and copy the Review Notes block from `app-review-notes.md`.
- [ ] Confirm **Sign in with Apple** is offered on the sign-in screen
      (Guideline 4.8).
- [ ] Run the pre-submit QA cheat-sheet in `app-review-notes.md` (assistant
      voice/live, Arabic RTL, sandbox purchase, delete account).
- [ ] **Submit for review.**

---

## Guardrails (don't skip)

- **Never type your Apple/RevenueCat/2FA credentials anywhere but the official
  console or the EAS CLI's own prompt.** I never need them.
- **Don't `eas submit` a production build while the RC key is still the
  placeholder** — a Buy tap would configure the SDK with a bad key and fail
  loudly. Phase 3 must be done first.
- **Don't hand-edit `ios.buildNumber`** in `app.json`; it's EAS-managed
  (`appVersionSource: "remote"`). Use `eas build:version:*`.
- If you change what data the app collects, update **all three** in the same
  change: `data-safety.md`, `app.json` privacy manifest, and
  `app-store-privacy-answers.md` — `store-policy.spec.ts` fails the build if they
  drift.

## Doc map

| Phase        | Doc                                              |
| ------------ | ------------------------------------------------ |
| 1–3          | `docs/store-listing/iap-setup.md`                |
| 4            | `docs/legal/privacy-policy.md`, `terms-of-service.md` |
| 5            | `docs/store-listing/app-store-privacy-answers.md` · `data-safety.md` |
| 6            | `docs/store-listing/age-rating.md`               |
| 7            | `docs/store-listing/eas-release-runbook.md`      |
| 8            | `docs/store-listing/app-review-notes.md`         |
