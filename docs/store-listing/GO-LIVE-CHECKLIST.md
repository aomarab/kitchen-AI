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

## Phase 0 — Security (do this FIRST, before any public build) — ✅ DONE (2026-08-30)

Keys were pasted into a chat transcript, so they were treated as compromised
and rotated. Each new key was verified against production before the old one was
revoked; new secrets never passed back through the chat (hidden-prompt helper
scripts on the VM did the swap).

- [x] Rotated the **OpenAI** key (`OPENAI_REALTIME_API_KEY`, realtime). Old
      `kitchenai` key **revoked**; new `kitchenai-realtime` live + verified.
- [x] Rotated the **OpenRouter** key (`OPENAI_API_KEY` + `OPENAI_BASE_URL`, all
      normal AI via `AiGateway`). Liveness-tested a `chat/completions` call
      before swapping; old `kitchen-ai` key **deleted**; new `kitchen-ai-2` live.
- [x] Rotated the **RevenueCat** secret verifier key (`REVENUECAT_API_KEY`, v1
      REST). Liveness-tested `GET /v1/subscribers/...` before swapping; old
      "Kitchen AI backend verifier" **revoked**; new v2 (v1 API) live.
- [x] Set an **OpenAI hard monthly spend limit** ($50, "Enforce a hard limit").
- [x] Redeployed the API (`--force-recreate --no-deps api`) after each swap;
      `/health` OK each time; `.env` backups kept on the VM.
- [ ] **Still open (only if it was ever shared):** rotate
      `REVENUECAT_WEBHOOK_SECRET` in RevenueCat → Integrations → Webhooks, then
      update `.env` + recreate `api`. The **public SDK key** for the real App
      Store app is created later in **Phase 3** (the test-store key isn't used in
      production).

## Phase 0.5 — Apple Developer Program enrollment (HARD PREREQUISITE)

Discovered 2026-08-30: the Apple ID `aomarab@outlook.com` is **not** in the paid
Apple Developer Program (the Developer portal only offers "Enroll today"), and
the repo's `appleTeamId` **`YVBW6U3Q43`** is a **free/personal team** — valid for
on-device testing, but it **cannot** use App Store Connect (ASC returns
`INVALIDITCUSER`). Nothing in Phases 1–8 works until this is done.

- [ ] Enroll in the **Apple Developer Program** ($99/yr) as **Individual / Sole
      Proprietor**, easiest via the **Apple Developer** iPhone app (Account tab →
      sign in → Enroll → identity verification → pay → accept the Developer
      Agreement). Approval takes a few hours to ~2 days.
- [ ] After approval, read the **real paid Team ID** at
      `developer.apple.com/account` → Membership. If it differs from
      `YVBW6U3Q43`, update `apps/mobile/app.json` (`ios.appleTeamId`) **and**
      `apps/mobile/eas.json` (`submit.production.ios.appleTeamId`), then commit.
- [ ] Sign in to App Store Connect once to accept the latest **Paid Applications
      Agreement** (required before any IAP goes live).

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

| Phase | Doc                                                                  |
| ----- | -------------------------------------------------------------------- |
| 1–3   | `docs/store-listing/iap-setup.md`                                    |
| 4     | `docs/legal/privacy-policy.md`, `terms-of-service.md`                |
| 5     | `docs/store-listing/app-store-privacy-answers.md` · `data-safety.md` |
| 6     | `docs/store-listing/age-rating.md`                                   |
| 7     | `docs/store-listing/eas-release-runbook.md`                          |
| 8     | `docs/store-listing/app-review-notes.md`                             |
