# Backend + Google/Apple sign-in runbook

**Goal:** make "Continue with Google" (and "Continue with Apple") real for _every_
user of the published app, instead of the mock it is today.

## Where we are now (mock on the phone, real over EAS)

There are two build paths, and they read **different** env sources:

- **`expo run:ios` (the build currently on the phone)** reads the repo-root
  `.env`, where `EXPO_PUBLIC_USE_MOCKS=true`. So `requestIdentityToken()`
  short-circuits to a fake `mock-google-token` and never opens Google's sheet
  (`apps/mobile/src/lib/oauth.ts`); every request is answered by the in-app MSW
  mocks. That build is a self-contained demo — deliberately.
- **EAS builds** read `apps/mobile/eas.json`, whose `production` (and `preview`)
  profile is already wired for the real world: `EXPO_PUBLIC_USE_MOCKS=false`,
  `EXPO_PUBLIC_API_URL=https://20-216-43-148.nip.io` (a **deployed, live** API),
  and a **real** `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`.

So the backend is already deployed (Azure VM; codified in `docker-compose.prod.yml`

- `deploy/`, operated per `docs/production-launch.md`) and
  `GET https://20-216-43-148.nip.io/health` returns 200. The **real** auth path is
  already written and correct — native PKCE on the device, and the API re-verifies
  every ID token against Google's `tokeninfo` endpoint with the `aud` claim pinned
  (`apps/api/src/auth/oauth.service.ts`). Server-side auth is **never** mocked. So
  what remains for "all users can sign in with Google" is **not code or deployment**
  — it is the Google Cloud project configuration in Part C plus App Store
  distribution.

> Server-side login works even if AI and payments stay mock (`AI_MOCK=true`,
> `PAYMENTS_MOCK=true`). You can ship "real accounts, mock everything-else" first,
> then turn the paid subsystems on later.

## The four things that must all be true

1. ✅ **The API is deployed** at a public HTTPS URL and boots in `production`
   — done: `https://20-216-43-148.nip.io` (`/health` → 200).
2. ⚠️ **Google OAuth client IDs exist** and are wired into the app _and_ the API.
   The app side is set (`eas.json`); the consent screen is now **published to "In
   production"** (2026-08-30). The one open item is confirming the API's
   `GOOGLE_CLIENT_ID` on the live host includes the iOS id — Part C / Part B.
3. ✅ **The app is built with `EXPO_PUBLIC_USE_MOCKS=false`** and the deployed API
   URL — already the `eas.json` `production`/`preview` profile.
4. ⚠️ **The app is distributed through TestFlight / the App Store** — needs Apple
   Developer enrollment (GO-LIVE Phase 0.5). A free personal-team build like the
   one on the phone can't reach other users.

---

## Part A — Infrastructure (already provisioned)

The infra + deploy is codified and live, so this is a pointer, not a to-do. The
full operator runbook is **`docs/production-launch.md` §A, §D** plus
`deploy/README.md`; the shape is PostgreSQL 17 + pgvector, Redis, and an
S3-compatible bucket, with the API image from `apps/api/Dockerfile` and the
one-shot migrate/seed jobs in `docker-compose.prod.yml`.
`apps/api/src/config/env.ts` is the boot contract — the API refuses to start on
an invalid environment. Only revisit this to provision a **second** (e.g.
staging) environment.

## Part B — The two OAuth env vars on the API

The full production env table lives in **`docs/production-launch.md` §B** (and
`deploy/.env.example`) — don't restate it here, so the two can't drift. The only
rows that matter for sign-in specifically:

| Var                | Value                                 | Notes                                                                                                                                                                       |
| ------------------ | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GOOGLE_CLIENT_ID` | `<ios-id>.apps.googleusercontent.com` | **Comma-separated list** of every client id whose tokens you accept (iOS + Android + Web). Pins the token `aud` (`oauth.service.ts:179`). Must include the id in `eas.json` |
| `APPLE_CLIENT_ID`  | `com.abedomar.kitchenai`              | Required in prod even if only Google is used — see note. Your Apple Services ID / bundle id                                                                                 |

These must be set on the **live** API (the Azure VM's `.env`); their values can't
be read back over HTTP, so confirm on the host. A token minted for a client id
_not_ in `GOOGLE_CLIENT_ID` is rejected `401 auth.invalidCredentials` — that is
the pin working (verified against the live API).

> **Why `APPLE_CLIENT_ID` is mandatory even for Google:** the production guard
> requires _both_ client ids, and Apple's Guideline 4.8 requires Sign in with
> Apple whenever you offer any third-party login. `APPLE_REVOKE_MOCK=false` and
> its `APPLE_*` keys are additionally required before real **Apple** sign-in ships
> (account-deletion token revocation, Guideline 5.1.1(v)) — but they do not block
> Google.

## Part C — Create the Google OAuth client IDs

In the [Google Cloud Console](https://console.cloud.google.com/):

1. **Create / pick a project** (e.g. "Mama's Kitchen").
2. **APIs & Services → OAuth consent screen:**
   - User type **External**.
   - App name **Mama's Kitchen**, support email, developer contact.
   - Scopes: only `openid`, `email`, `profile` (all **non-sensitive** → no
     Google app verification needed).
   - **Publishing status → "In production".** While it is "Testing", only the
     ≤100 test users you list can sign in — that is the difference between "some"
     and "all users". **✅ Done 2026-08-30** (project `mamas-kitchen-507006`, now
     "In production"). Gotcha: the **Publish app** button stays disabled with an
     "OAuth configuration is incomplete — visit Branding" banner until the Branding
     page has an **Authorized domain** plus **home page / privacy / terms** links
     (the required App name / support email / developer contact alone are not
     enough to publish). The app **logo was removed** so publishing did not trigger
     brand verification — non-sensitive scopes + no logo + one domain publish
     instantly with no review. (2026 UI: these settings live under **APIs &
     Services → Google Auth Platform → Branding / Audience / Clients / Data
     Access**, not the old single "OAuth consent screen" page.)
3. **APIs & Services → Credentials → Create credentials → OAuth client ID:**
   - **iOS** — Bundle ID `com.abedomar.kitchenai`. Produces
     `<abc>.apps.googleusercontent.com`. No client secret. **This is the id the
     app uses.**
   - (Later, for Android) an **Android** client (package name + SHA-1).
   - (If the web app also offers Google) a **Web** client.
4. Add the iOS client id to **both** sides:
   - App: `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` (Part D).
   - API: include it in `GOOGLE_CLIENT_ID` (Part B). The token's `aud` will be
     this iOS id, and `assertAudience` only accepts ids in that list
     (`oauth.service.ts:179`).

No redirect URI to configure by hand: the app derives Google's required
reversed-client-id scheme (`com.googleusercontent.apps.<id>`) automatically, and
`app.config.js` registers it in `Info.plist` when the env var is set.

## Part D — Build a real (non-mock) app — already configured

`apps/mobile/eas.json`'s `production` profile is **already** set for real sign-in:

```jsonc
"production": {
  "env": {
    "EXPO_PUBLIC_USE_MOCKS": "false",
    "EXPO_PUBLIC_API_URL": "https://20-216-43-148.nip.io",
    "EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID": "395259860403-….apps.googleusercontent.com",
    "EXPO_PUBLIC_REVENUECAT_API_KEY": "appl_REPLACE_…" // placeholder — only blocks purchases
  }
}
```

So the build just needs to run (GO-LIVE Phase 7 / `eas-release-runbook.md`):

```bash
eas build --platform ios --profile production
eas submit --platform ios --profile production --latest
```

Because `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` is set, the EAS prebuild adds the
Google reversed-client-id URL scheme to `Info.plist` automatically
(`apps/mobile/app.config.js`). Add `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID` /
`…WEB_CLIENT_ID` only when those platforms ship. The RevenueCat key stays a
placeholder until IAP is wired (`iap-setup.md`) — it does not affect sign-in.

## Part E — Verify end to end

1. API boots with **no** "Invalid environment" error (proves every required var
   is present).
2. `GET /health` → 200.
3. On a TestFlight build: tap **Continue with Google** → the real Google account
   sheet appears → after consent you land signed-in. (`usingMocks` is now false,
   so `requestGoogleToken()` runs the PKCE flow.)
4. Repeat **Continue with Apple**.
5. Negative check (optional): a token minted for a different OAuth client is
   rejected with `401 auth.invalidCredentials` — that is the `aud` pinning
   working, not a bug.

## Quick reference — the real gaps today

The **app-side** config is already done in `eas.json` (mock off, live API URL,
real iOS client id). What actually remains:

| Thing                 | Where                              | Status now                          | Needs to be                                    |
| --------------------- | ---------------------------------- | ----------------------------------- | ---------------------------------------------- |
| Google consent screen | Google Cloud Console               | **✅ "In production" (2026-08-30)** | done — any Google account can sign in (Part C) |
| Google aud pin (API)  | live API `.env` `GOOGLE_CLIENT_ID` | can't read remotely — confirm host  | list incl. the `395259860403-…` iOS id         |
| Apple aud pin (API)   | live API `.env` `APPLE_CLIENT_ID`  | can't read remotely — confirm host  | `com.abedomar.kitchenai`                       |
| Distribution          | App Store Connect                  | free personal-team build            | Apple enrollment → TestFlight / App Store      |
| RevenueCat key        | `eas.json` production              | placeholder                         | real key — blocks **purchases**, not sign-in   |

App-side settings for reference (already correct):

| App var                            | Value in `eas.json` production    |
| ---------------------------------- | --------------------------------- |
| `EXPO_PUBLIC_USE_MOCKS`            | `false` ✅                        |
| `EXPO_PUBLIC_API_URL`              | `https://20-216-43-148.nip.io` ✅ |
| `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` | `395259860403-…` ✅               |
