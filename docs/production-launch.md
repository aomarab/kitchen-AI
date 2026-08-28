# Production launch runbook

The single operational checklist to take Kitchen AI from "code-complete" to "on sale". The code is
sale-ready — a green local baseline, correct credit/cost math, and a clean security review — so
**everything below is operational** (accounts, infra, secrets, store paperwork), not code you still
need to write. Work top to bottom; each box is a real gate.

Grounding: env contract is `apps/api/src/config/env.ts` (it **refuses to boot** on an invalid
environment — see `loadEnv`), commands come from the root `package.json`, and store paperwork lives
in `docs/store-listing/` and the `2026-08-10-publishing-compliance-design.md` spec.

---

## A. Provision infrastructure (P0 — L0-infra)

> Detailed, ordered provisioning checklist with per-resource env mapping and a
> post-provision smoke sequence: **`docs/infra-provisioning.md`**. Summary below.

`docker-compose.yml` only stands up **local** Postgres/Redis/MinIO. The API ships a production
image at `apps/api/Dockerfile` (built as `node dist/main.js`, `apps/api/src/main.ts`, listening on
`0.0.0.0:$API_PORT`). Provision managed equivalents of the stateful services:

- [ ] **PostgreSQL 17 with the `vector` (pgvector) extension** — embeddings depend on it. A managed
      Postgres (RDS/Cloud SQL/Neon/Supabase) with pgvector enabled. Capture the connection string as
      `DATABASE_URL` (must be a valid URL — the schema enforces `z.string().url()`).
- [ ] **Redis** — BullMQ job queue (receipt parsing, plan generation). Capture as `REDIS_URL`.
- [ ] **S3-compatible object storage** — a private bucket for photos. Photos never traverse the API
      (presigned direct upload), so the bucket must allow presigned PUT/GET from clients and CORS for
      the web origin. Capture `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY`,
      `S3_SECRET_KEY`. Set `S3_FORCE_PATH_STYLE=false` for real AWS S3 (it is `true` for MinIO).
- [ ] **A host/orchestrator for the API** — build the image from `apps/api/Dockerfile`
      (context = repo root, since the API imports the `@kitchen/*` workspace packages):
      `docker build -f apps/api/Dockerfile -t <registry>/kitchen-api:<tag> .`, push it, and run it on
      any container host (Fly/Render/ECS/a VM) with the production `.env` injected. Node ≥ 20.
- [ ] **A host for the web app** — Next.js production (`apps/web`); Vercel or a Node host.

> **Single-VM shortcut.** For a small deployment, `docker-compose.prod.yml` (repo root) bundles
> Postgres 17 + pgvector and Redis alongside the API image and runs migrations as a one-shot before
> the API starts: `docker compose -f docker-compose.prod.yml up -d --build`. **S3 stays external**
> (presigned URLs must be client-reachable), so `S3_*` still points at managed S3 in `.env`. Seed
> once with `docker compose -f docker-compose.prod.yml --profile seed run --rm seed`. This is an
> alternative to steps D below, not an addition.

## B. Production secrets & environment (P0 — L0-env)

Fill a production `.env` from `.env.example`. The contract **fails closed** in production — these
guards will refuse to boot, which is the point (`apps/api/src/config/env.ts`, `env.spec.ts`):

| Variable                                                                    | Required when                                          | How to produce                                                                                                                    |
| --------------------------------------------------------------------------- | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV=production`                                                       | always                                                 | enables every guard below                                                                                                         |
| `JWT_SECRET`                                                                | always; **≥ 32 chars, not the placeholder** in prod    | `openssl rand -base64 48`                                                                                                         |
| `CORS_ORIGINS`                                                              | prod (non-empty)                                       | comma-separated web origins, e.g. `https://kitchen.app`                                                                           |
| `DATABASE_URL`, `REDIS_URL`, `S3_*`                                         | always                                                 | from section A                                                                                                                    |
| `GOOGLE_CLIENT_ID`, `APPLE_CLIENT_ID`                                       | prod                                                   | comma-separated OAuth client ids to pin the ID-token `aud` — one per platform                                                     |
| `OPENAI_API_KEY`                                                            | when `AI_MOCK=false`                                   | OpenAI key with Realtime + the configured models                                                                                  |
| `GEMINI_API_KEY`                                                            | when `AI_MOCK=false` **and** `AI_VISION_VENDOR=gemini` | optional; only if routing vision to Gemini                                                                                        |
| `REVENUECAT_API_KEY`, `REVENUECAT_WEBHOOK_SECRET`                           | when `PAYMENTS_MOCK=false`                             | RevenueCat REST key + a webhook shared secret (constant-time checked)                                                             |
| `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY`, `APPLE_TOKEN_ENC_KEY` | when `APPLE_REVOKE_MOCK=false`                         | Apple Sign-In key material; `APPLE_TOKEN_ENC_KEY` must be **base64 that decodes to exactly 32 bytes** (`openssl rand -base64 32`) |

- [ ] Generate and set a strong `JWT_SECRET` (the shipped `change-me-in-production` is now rejected
      in production — do not reuse it).
- [ ] Boot the API once against the production env and confirm it starts. Any missing/weak value
      prints an `Invalid environment:` list and exits — fix until it boots.

## C. Flip the mock switches (P0)

The whole system defaults to offline/free mocks. For a paid launch, turn on the real paths:

- [ ] `AI_MOCK=false` — real OpenAI/Gemini calls (needs `OPENAI_API_KEY`).
- [ ] `PAYMENTS_MOCK=false` — real RevenueCat receipt verification (the mock **approves every
      purchase for free**; leaving it on gives credits away).
- [ ] `APPLE_REVOKE_MOCK=false` — real Apple token revocation on account deletion (App Store
      Guideline 5.1.1(v); the publishing-compliance spec exists for exactly this).
- [ ] Web: production does **not** enable mocks from `NEXT_PUBLIC_API_MOCK` (it fails closed in
      `src/lib/config.ts`) — confirm the web build points `NEXT_PUBLIC_API_URL` at the real API.
- [ ] Mobile: set `EXPO_PUBLIC_USE_MOCKS=false` and `EXPO_PUBLIC_API_URL` to the real API.

## D. Migrate, seed, build, run the API (P0)

> The **single-VM shortcut** in §A (`docker-compose.prod.yml`) performs migrate → seed → run for
> you; the steps below are the manual/managed-infra equivalent.

Build the image once (`docker build -f apps/api/Dockerfile -t kitchen-api .`), then, against the
production `DATABASE_URL`:

- [ ] Apply migrations from the image (compiles to plain JS, no tsx needed):
      `docker run --rm --env-file .env kitchen-api node dist/db/migrate.js` — creates the pgvector
      extension and applies `apps/api/drizzle/`.
- [ ] Seed the bilingual ingredient catalog:
      `docker run --rm --env-file .env kitchen-api node dist/db/seed.js` (validate first by running
      `pnpm db:seed -- --dry-run` locally).
- [ ] Run the API: `docker run -d --env-file .env -p 3333:3333 kitchen-api` (default `CMD` is
      `node dist/main.js`). A non-container host instead needs `pnpm build` then
      `node apps/api/dist/main.js`.
- [ ] Confirm the BullMQ worker path is live (receipt parse / plan generation are jobs, not
      requests — clients poll).

## E. Release the web app (P0)

- [ ] Build `apps/web` for production with `NEXT_PUBLIC_API_URL` set and mocks off; deploy.
- [ ] Verify OAuth redirect URIs for the web client id are registered with Google/Apple.
- [ ] Smoke: sign in, capture a photo (presigned upload to the real bucket), generate a plan, open
      the **live assistant** (web has the real WebRTC transport — the demo badge should be **gone**).

## F. Release the mobile app (P1 — L1-devices)

- [ ] Set the three `EXPO_PUBLIC_GOOGLE_*_CLIENT_ID` ids (per platform) — and ensure the **same** ids
      are in the API's `GOOGLE_CLIENT_ID` (they must not drift; `aud` pinning depends on it).
- [ ] Build signed release binaries (EAS Build). Personal Apple teams can't sign Push Notifications —
      not relevant unless you add remote push.
- [ ] Test on the device matrix in `2026-08-10-device-compatibility-design.md`.
- [ ] **Mobile live assistant ships as a free, clearly-badged demo** — this is the deliberate,
      spec-sanctioned posture (`2026-08-28-mobile-live-assistant-design.md`: "ship the mock now…
      until then the mobile assistant is always a demo"). It calls no API and spends no credits, so
      it is honest and safe to ship. The real `react-native-webrtc` adapter is a later slice
      (L0-assistant remainder) — not a launch blocker.

## G. Payments / RevenueCat (P1 — L1-iap)

> Full step-by-step operator guide: **`docs/store-listing/iap-setup.md`** (product
> ids, RevenueCat config, env, sandbox testing, and the two integration points the
> code leaves to "once the account exists"). Checklist summary:

- [ ] Create the IAP products (credit packs) in App Store Connect / Play Console.
- [ ] Map them to RevenueCat entitlements; set `REVENUECAT_API_KEY`.
- [ ] Configure the RevenueCat webhook to POST to the API with the `REVENUECAT_WEBHOOK_SECRET` in the
      Authorization header (this secret is the only barrier between the internet and free credits).
- [ ] Verify credit prices: `CREDIT_COSTS` / `FREE_MONTHLY_GRANT` in
      `packages/contracts/src/credits.ts` are contract — confirm they match the store product values.
- [ ] Re-verify AI vendor rates before charging real money: `MODEL_RATES_USD_PER_MTOK`
      (`apps/api/src/ai/ai.constants.ts`, dated 2026-08-11) and `REALTIME_AUDIO_USD_PER_MTOK`
      (`apps/api/src/ai/realtime-cost.ts`, dated 2026-08-28) carry "verify before launch" notes.

## H. Store submission paperwork (P2 — L2-legal / compliance)

- [ ] Age rating — `docs/store-listing/age-rating.md`.
- [ ] Data safety / privacy nutrition labels — `docs/store-listing/data-safety.md`.
- [ ] Account deletion is implemented (publishing-compliance spec §6); confirm the store listing
      links to it and the in-app deletion flow works end to end against the real Apple revoker.
- [ ] Legal docs: Terms of Service + Privacy Policy hosted and linked (L2-legal). **Drafts exist**
      at `docs/legal/privacy-policy.md` and `docs/legal/terms-of-service.md`, grounded in the app's
      actual data practices — they must be reviewed by counsel and have every `[BRACKETED]`
      placeholder filled before they are published and their URLs entered in the consoles.

## I. Unblock CI (P0 — L0-ci)

The workflow itself is complete and correct (`.github/workflows/ci.yml`): it
provisions Postgres 17 + pgvector and Redis as services, sets a fully-mocked env
(`AI_MOCK`/`PAYMENTS_MOCK`/`APPLE_REVOKE_MOCK` all true), then runs
`install → build → typecheck → lint → migrate → seed → test` on Node 22. The
failures are **not** a code fault — every run dies in 3–5s **before any step
runs**, with this annotation:

> _The job was not started because recent account payments have failed or your
> spending limit needs to be increased. Please check the 'Billing & plans'
> section in your settings._

This is a **billing block on GitHub Actions minutes** (the repo is private, so
minutes are metered). Actions is otherwise enabled
(`repos/aomarab/kitchen-AI/actions/permissions` → `enabled: true`).

- [ ] Clear it in **GitHub → Settings → Billing and plans** (personal or org that
      owns the repo): add/repair a payment method and/or raise the Actions
      spending limit. Only an account owner can do this.
- [ ] **Alternative (free):** make the repo **public** — Actions minutes are free
      for public repos — if that is acceptable for launch.
- [ ] After clearing, re-run the latest: `gh run list` then
      `gh run rerun <id>` (or push any commit). Expect the job to start and go
      green — the same gate passes locally today.
- [ ] Until then, the **local gate is the source of truth**: `pnpm build`,
      `pnpm typecheck`, `pnpm lint`, `pnpm test` (with `pnpm infra:up && pnpm
    db:migrate && pnpm db:seed` first, since API specs are integration tests).
      PRs currently merge without a green check **by design**, not by accident.

## J. Pre-launch verification (P2 — L2-e2e)

- [ ] End-to-end against **real** providers in a staging project: OAuth sign-in, presigned upload,
      receipt parse job, plan generation (Stage C re-validation), a real live-assistant session, and
      a real IAP purchase crediting the household.
- [ ] Confirm the `ai_usage` ledger records non-zero cost for a real model call and that a failed job
      **refunds** its credit spend group.
- [ ] Load-check the presign → upload → object-key path and the BullMQ workers.

---

## Accepted-for-launch (documented, not blockers)

- **Mobile live assistant = free demo.** Spec-sanctioned (section F). Real RN transport is deferred.

## Recommended follow-up hardening (nice-to-have, not blockers)

- Add a guard test pinning the `env.ts` default model ids to `MODEL_RATES_USD_PER_MTOK` membership,
  so a future default swap can't ship an unpriced model that only warns at runtime (from the cost
  audit).
