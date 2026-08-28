# Infrastructure provisioning checklist

A concrete, ordered checklist for standing up production infrastructure for the
Kitchen AI API, mapping every managed resource to the exact `.env` variable it
produces. The env contract in `apps/api/src/config/env.ts` **fails closed** in
production, so this list is effectively "what you must provision before the API
will boot". Pair it with `docs/production-launch.md` §A–§D (this file is the
detailed provisioning companion to §A) and `.env.example`.

## Pick a topology first

| Topology                 | Use when                                | How                                                        |
| ------------------------ | --------------------------------------- | ---------------------------------------------------------- |
| **Single VM** (simplest) | one box, low ops, small scale           | `docker-compose.prod.yml` (bundles Postgres+Redis+migrate) |
| **Managed services**     | production scale, HA, backups, less ops | provision each resource below, run the API image on a host |

Either way **object storage (S3) is external** — the API mints presigned URLs
that the browser/mobile client uploads to directly, so the storage endpoint must
be publicly reachable by clients, never an internal `minio:9000`.

> **Want the cheapest possible path?** `deploy/README.md` is a complete,
> copy-paste **$0/month** walkthrough of the Single-VM topology on an Oracle
> Cloud Always Free instance + Cloudflare R2 (free S3) + automatic HTTPS via
> Caddy. It uses the resource→env mapping below; start there if you just want it
> online for a mobile launch.

## Provision in dependency order

Provision top-to-bottom; each row yields the env value(s) in the last column.
The API will not boot until the **always-required** rows are set (and, in
production, the conditionally-required rows for any mock you turn off).

### 1. PostgreSQL 17 + pgvector — always required

- [ ] A managed Postgres **17** (RDS / Cloud SQL / Neon / Supabase) with the
      `vector` (pgvector) extension available. Embeddings depend on it; the
      migration creates the extension, so the DB user needs permission to
      `CREATE EXTENSION`.
- [ ] Private networking / SG so only the API host can reach it; enable
      automated backups.
- [ ] → `DATABASE_URL` (must be a valid URL — `z.string().url()`).

### 2. Redis — always required

- [ ] A managed Redis (ElastiCache / Memorystore / Upstash). Used by BullMQ for
      the receipt-parse and plan-generation jobs; the AI module registers queues
      at boot, so the API needs Redis reachable even in mock mode.
- [ ] → `REDIS_URL` (valid URL).

### 3. S3-compatible object storage — always required

- [ ] A **private** bucket for photos (AWS S3, or any S3-compatible store with a
      public endpoint).
- [ ] **CORS**: allow `PUT` and `GET` from the web origin (presigned direct
      upload/download from the browser). Without this, uploads fail in the
      browser only.
- [ ] A scoped access key/secret (put/get/list on this bucket only).
- [ ] → `S3_ENDPOINT` (URL), `S3_REGION` (default `us-east-1`), `S3_BUCKET`,
      `S3_ACCESS_KEY`, `S3_SECRET_KEY`. Set `S3_FORCE_PATH_STYLE=false` for real
      AWS S3 (it is `true` only for path-style stores like MinIO).

### 4. Container registry + API host — always required

- [ ] A registry (GHCR / ECR / Docker Hub). Build and push:
      `docker build -f apps/api/Dockerfile -t <registry>/kitchen-api:<tag> .`
      (context = repo root — the API imports the `@kitchen/*` workspace packages).
- [ ] A host to run it (Fly / Render / ECS / a VM), Node ≥ 20, with the
      production `.env` injected. Publish container port **3333** (`API_PORT`).
- [ ] Run migrations once per deploy before the API starts:
      `node dist/db/migrate.js`; seed once after the first deploy:
      `node dist/db/seed.js`. (The single-VM compose does the migrate step for
      you.)

### 5. Web host — always required

- [ ] A host for `apps/web` (Vercel or a Node host) with
      `NEXT_PUBLIC_API_URL` pointing at the API and mocks **off** (production
      fails closed on `NEXT_PUBLIC_API_MOCK`, `src/lib/config.ts`).
- [ ] Register the web origin in `CORS_ORIGINS` on the API.

### 6. Secrets — always required

- [ ] `JWT_SECRET` — `openssl rand -base64 48` (production rejects the shipped
      placeholder and anything `< 32` chars).
- [ ] `CORS_ORIGINS` — comma-separated web origins (must be non-empty in prod).

### 7. OAuth — required in production (audience pinning)

- [ ] Google + Apple sign-in client ids. → `GOOGLE_CLIENT_ID`,
      `APPLE_CLIENT_ID` (comma-separated, one per platform) — they pin the ID
      token `aud`.

### 8. AI providers — required when `AI_MOCK=false`

- [ ] `OPENAI_API_KEY` with access to the configured models (`gpt-5`,
      `gpt-5-mini`) and Realtime (`gpt-realtime`) for the live assistant.
- [ ] Optional: `AI_VISION_VENDOR=gemini` + `GEMINI_API_KEY` to route only the
      vision tier to Gemini.
- [ ] `YOUTUBE_API_KEY` for recipe video ids (ids always come from the Data API,
      never the model).
- [ ] Review `AI_DAILY_BUDGET_USD` (default 2) before real spend.

### 9. Payments — required when `PAYMENTS_MOCK=false`

- [ ] `REVENUECAT_API_KEY` + `REVENUECAT_WEBHOOK_SECRET`. Full flow:
      `docs/store-listing/iap-setup.md`.

### 10. Apple token revocation — required when `APPLE_REVOKE_MOCK=false`

- [ ] `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY`, and
      `APPLE_TOKEN_ENC_KEY` (base64 that decodes to **exactly 32 bytes**:
      `openssl rand -base64 32`). Required so account deletion can revoke Sign in
      with Apple tokens (Guideline 5.1.1(v)).

## Post-provision smoke sequence

1. [ ] **Boot** the API against production `.env`; a missing/weak value prints
       `Invalid environment:` and exits — fix until it starts.
2. [ ] **DB**: migrate + seed succeed; `SELECT * FROM pg_extension` shows
       `vector`.
3. [ ] **Redis**: a plan-generation request returns a job id and the worker
       drains it (jobs, not requests).
4. [ ] **S3**: sign-in → capture a photo → confirm the object lands in the bucket
       via presigned upload, and is readable back.
5. [ ] **Auth**: real Google/Apple sign-in works (aud pinned).
6. [ ] Only after the above, flip `AI_MOCK=false` (and `PAYMENTS_MOCK=false` once
       IAP is configured) and re-run §J of the runbook.

## Env quick-reference

Always: `NODE_ENV=production`, `API_PORT` (3333), `DATABASE_URL`, `REDIS_URL`,
`S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`,
`S3_FORCE_PATH_STYLE`, `JWT_SECRET`, `CORS_ORIGINS`, `GOOGLE_CLIENT_ID`,
`APPLE_CLIENT_ID`.

Conditionally: `OPENAI_API_KEY` / `GEMINI_API_KEY` / `YOUTUBE_API_KEY`
(`AI_MOCK=false`); `REVENUECAT_API_KEY` / `REVENUECAT_WEBHOOK_SECRET`
(`PAYMENTS_MOCK=false`); `APPLE_*` (`APPLE_REVOKE_MOCK=false`).

The authoritative list and its validation is `apps/api/src/config/env.ts` — if
this file and the schema ever disagree, the schema wins.
