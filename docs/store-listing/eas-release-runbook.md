# EAS build & submit runbook — iOS

Copy-paste CLI steps to build **Mama's Kitchen** and submit it to the App Store.
Run everything from **`apps/mobile/`**. Grounded in `apps/mobile/app.json` and
`apps/mobile/eas.json` as they stand today.

## Identity (from app.json / eas.json)

| Thing                | Value                     |
| -------------------- | ------------------------- |
| App name             | `Mama's Kitchen`          |
| Slug                 | `kitchen-ai`              |
| iOS bundle id        | `com.abedomar.kitchenai`  |
| Apple Team ID        | `YVBW6U3Q43`              |
| Build profile        | `production`              |
| Version source       | **remote** (EAS-managed)  |
| Auto-increment build | **on** for `production`   |

> **Two things are not wired yet and EAS will ask for them the first time:**
>
> 1. **No `extra.eas.projectId`** in `app.json` — the project isn't linked to an
>    EAS account. `eas init` (Step 2) creates/links it and writes the id back.
> 2. **No `ascAppId`** in `eas.json` `submit.production.ios` — the App Store
>    Connect app record must exist first (Step 0), then `eas submit` will prompt
>    to pick it (or add its numeric App ID to eas.json to make submit
>    non-interactive).

---

## Step 0 — Prerequisites (do these in the consoles first)

Nothing below will pass review until these are true. See
`docs/store-listing/iap-setup.md` and `app-store-privacy-answers.md`.

- [ ] **Rotate the keys pasted in chat** (OpenAI, OpenRouter, RevenueCat) and set
      an OpenAI hard spend limit. Do this before any public build.
- [ ] App Store Connect: **app record created** for `com.abedomar.kitchenai`
      (this yields the numeric **App ID** used by submit).
- [ ] App Store Connect: `credits_300` **IAP created** and at least "Ready to
      Submit".
- [ ] RevenueCat: App Store app + entitlement configured; copy the **public SDK
      key**.
- [ ] `apps/mobile/eas.json` → `build.production.env.EXPO_PUBLIC_REVENUECAT_API_KEY`:
      replace `appl_REPLACE_WITH_REVENUECAT_PUBLIC_SDK_KEY` with that public key,
      commit it.
- [ ] App Privacy questionnaire filled (use `app-store-privacy-answers.md`) and a
      public HTTPS **Privacy Policy URL** set.

## Step 1 — Install & authenticate the CLI

```bash
npm install -g eas-cli          # or: npx eas-cli@latest <cmd>
eas login                       # your Expo account; NEVER share the password with me
eas whoami                      # confirm the logged-in account
```

## Step 2 — Link the EAS project (first time only)

```bash
cd apps/mobile
eas init                        # creates/links the project, writes extra.eas.projectId
git add app.json && git commit -m "chore(mobile): link EAS project id"
```

If it asks to create iOS credentials, let EAS manage them (recommended) — it will
create the distribution certificate and provisioning profile under Team
`YVBW6U3Q43`.

## Step 3 — Build the production binary

```bash
cd apps/mobile
eas build --platform ios --profile production
```

- Uses the `production` profile: real API, **store mocks off**, RC public key
  from env, `autoIncrement` bumps the build number remotely (that's why
  `app.json` has no `ios.buildNumber` — it's EAS-managed via
  `appVersionSource: "remote"`).
- Runs on EAS servers; watch the printed build URL. Output is a `.ipa`.
- To bump the **marketing** version (currently `0.1.0`) for a release, do it
  before building:
  ```bash
  eas build:version:set --platform ios       # interactive, sets the remote version
  ```

## Step 4 — Submit to App Store Connect

```bash
cd apps/mobile
eas submit --platform ios --profile production --latest
```

- `--latest` submits the most recent successful production build. To pick a
  specific one, use `--id <build-id>` instead.
- The first time, it prompts for the App Store Connect app (because `ascAppId`
  isn't set) and for an **App Store Connect API key** (recommended) or your
  Apple ID. **Type your own credentials only into the CLI's own prompt — never
  paste them to me.**
- To make future submits non-interactive, add the numeric App ID to
  `eas.json`:
  ```jsonc
  // submit.production.ios
  { "appleTeamId": "YVBW6U3Q43", "ascAppId": "0000000000" }
  ```

## Step 5 — Finish in App Store Connect (web)

`eas submit` only uploads the binary. In the console you still:

- [ ] Attach the build to a **version**, add screenshots, description, keywords,
      support URL, and the **Privacy Policy URL**.
- [ ] Confirm the **App Privacy** answers match the manifest
      (`app-store-privacy-answers.md`).
- [ ] Attach the `credits_300` IAP to the version (first IAP is reviewed **with**
      the app).
- [ ] Ensure **Sign in with Apple** is offered on the sign-in screen (Guideline
      4.8, because Google sign-in is offered).
- [ ] Submit for review.

---

## Handy variants

```bash
# Internal test build on a real device (still store-mocked, uses preview profile):
eas build --platform ios --profile preview

# Simulator build for local QA:
eas build --platform ios --profile development
# → download the .app, then: xcrun simctl install booted <path>.app

# Check build/submit status:
eas build:list --platform ios --limit 5
eas submit:list --platform ios
```

## Notes

- The `production` build carries the new **5-minute live-assistant session cap**
  (contract `MAX_ASSISTANT_SESSION_MS`); a device only sees it after a fresh
  build, so this is the build that makes the cap real on-device.
- Guard against a wrong RC key: a production build with the placeholder still in
  place configures the SDK with a bad key and **fails loudly** on a Buy tap — it
  never silently "succeeds". Verify Step 0's key swap before Step 3.
- `appVersionSource: "remote"` means **don't** hand-edit `ios.buildNumber` in
  `app.json`; EAS owns it. Use `eas build:version:*` commands instead.
