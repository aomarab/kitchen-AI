# Backend + Google/Apple sign-in runbook

**Goal:** make "Continue with Google" (and "Continue with Apple") real for _every_
user of the published app, instead of the mock it is today.

## Where we are now (and why Google login is a mock)

The build currently on the phone has `EXPO_PUBLIC_USE_MOCKS=true` baked in, so:

- `requestIdentityToken()` short-circuits and returns a fake `mock-google-token`
  — it never opens Google's sheet (`apps/mobile/src/lib/oauth.ts`).
- Every network call is answered by the in-app MSW mocks, not a server
  (`EXPO_PUBLIC_API_URL=http://localhost:3333`, unreachable from a real phone).

The **real** path is already written and correct — native PKCE on the device, and
the API re-verifies every ID token against Google's `tokeninfo` endpoint with the
`aud` claim pinned (`apps/api/src/auth/oauth.service.ts`). Server-side auth is
**never** mocked; it always calls the real provider. So enabling real sign-in is
_configuration + deployment_, not new code.

> Important: server-side login works even if AI and payments stay mock
> (`AI_MOCK=true`, `PAYMENTS_MOCK=true`). You can ship "real accounts, mock
> everything-else" cheaply first, then turn the paid subsystems on later.

## The four things that must all be true

1. **The API is deployed** at a public HTTPS URL and boots in `production`.
2. **Google OAuth client IDs exist** and are wired into the app _and_ the API.
3. **The app is built with `EXPO_PUBLIC_USE_MOCKS=false`** and the deployed API URL.
4. **The app is distributed through TestFlight / the App Store** (a free
   personal-team build like the one on the phone can't reach other users; needs
   Apple Developer enrollment — GO-LIVE Phase 0.5).

---

## Part A — Provision infrastructure

The API's env contract (`apps/api/src/config/env.ts`) refuses to boot without a
database, Redis, and S3-compatible object storage. Use any managed equivalents
of the local `docker-compose` stack (PostgreSQL 17 **with pgvector**, Redis, and
an S3 bucket — MinIO, Cloudflare R2, AWS S3, Backblaze B2, …).

| Local (compose)        | Production equivalent (examples)                  |
| ---------------------- | ------------------------------------------------- |
| Postgres 17 + pgvector | Neon / Supabase / RDS + `CREATE EXTENSION vector` |
| Redis                  | Upstash / Elasticache / Redis Cloud               |
| MinIO                  | Cloudflare R2 / AWS S3 / Backblaze B2             |

After the database exists, run the migrations and the bilingual seed against it:

```bash
DATABASE_URL=<prod-url> pnpm --filter @kitchen/api db:migrate
DATABASE_URL=<prod-url> pnpm --filter @kitchen/api db:seed
```

## Part B — Deploy the API

Deploy `apps/api` (any Node 20+ host: Fly.io, Render, Railway, a container on
ECS/Cloud Run, …). Build with `pnpm build`; start the compiled server.

### Production environment variables

The API validates all of this on boot and **fails closed** with a precise error
if anything required is missing. Minimum for real sign-in with everything else
still mock:

| Var                                                             | Value                                 | Notes                                                                                                           |
| --------------------------------------------------------------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`                                                      | `production`                          | Turns on every guard below                                                                                      |
| `DATABASE_URL`                                                  | `postgres://…`                        | Postgres + pgvector                                                                                             |
| `REDIS_URL`                                                     | `redis://…`                           | BullMQ jobs                                                                                                     |
| `S3_ENDPOINT` / `S3_BUCKET` / `S3_ACCESS_KEY` / `S3_SECRET_KEY` | your bucket                           | `S3_REGION` defaults `us-east-1`; set `S3_FORCE_PATH_STYLE=false` for AWS/R2 virtual-host style                 |
| `JWT_SECRET`                                                    | 32+ random chars                      | Prod rejects `<32` and the placeholder. `openssl rand -base64 48`                                               |
| `CORS_ORIGINS`                                                  | `https://app.yourdomain`              | Comma-separated; required in prod. The **web** origin(s) — native apps aren't subject to CORS                   |
| `GOOGLE_CLIENT_ID`                                              | `<ios-id>.apps.googleusercontent.com` | **Comma-separated list** of every client id whose tokens you accept (iOS + Android + Web). Pins the token `aud` |
| `APPLE_CLIENT_ID`                                               | `com.abedomar.kitchenai`              | Required in prod too (see note). Your Apple Services ID / bundle id                                             |

Left at their safe defaults (all `true`): `AI_MOCK`, `PAYMENTS_MOCK`,
`APPLE_REVOKE_MOCK`. Flip each to `false` only when you wire its keys:

- `AI_MOCK=false` → needs `OPENAI_API_KEY` (real recipe/vision/plan generation).
- `PAYMENTS_MOCK=false` → needs `REVENUECAT_API_KEY` + `REVENUECAT_WEBHOOK_SECRET`
  (real credit purchases — see `iap-setup.md`).
- `APPLE_REVOKE_MOCK=false` → needs `APPLE_TEAM_ID`, `APPLE_KEY_ID`,
  `APPLE_PRIVATE_KEY`, `APPLE_TOKEN_ENC_KEY` (base64, 32 bytes). Required for
  App Store Guideline 5.1.1(v): account deletion must revoke the Apple token.
  Do this before real Apple sign-in ships, but it does not block Google.

> **Why `APPLE_CLIENT_ID` is mandatory even for Google:** the production guard
> requires _both_ client ids, and Apple's Guideline 4.8 requires you to offer
> Sign in with Apple whenever you offer any third-party login. So configure both.

Health check after deploy: `GET https://api.yourdomain/health` should return 200.

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
     and "all users".
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

## Part D — Build a real (non-mock) app

Set these for the production build (EAS secrets or an `.env.production`):

```
EXPO_PUBLIC_USE_MOCKS=false
EXPO_PUBLIC_API_URL=https://api.yourdomain
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=<abc>.apps.googleusercontent.com
# EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=…   # when Android ships
# EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=…
```

Then build through EAS (GO-LIVE Phase 7 / `eas-release-runbook.md`):

```bash
eas build --platform ios --profile production
eas submit --platform ios --profile production --latest
```

Because `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` is now set, the EAS prebuild adds the
Google URL scheme to the Info.plist automatically.

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

## Quick reference — the exact gaps today

| Thing                | File / var                         | Now                      | Needs to be              |
| -------------------- | ---------------------------------- | ------------------------ | ------------------------ |
| Client mock switch   | `EXPO_PUBLIC_USE_MOCKS`            | `true`                   | `false`                  |
| API URL              | `EXPO_PUBLIC_API_URL`              | `http://localhost:3333`  | deployed HTTPS URL       |
| iOS Google id (app)  | `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` | unset                    | real iOS client id       |
| Google aud pin (API) | `GOOGLE_CLIENT_ID`                 | empty                    | list incl. iOS client id |
| Apple aud pin (API)  | `APPLE_CLIENT_ID`                  | empty                    | `com.abedomar.kitchenai` |
| Distribution         | —                                  | free personal-team build | TestFlight / App Store   |
