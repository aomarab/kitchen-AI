# Zero-cost online backend (Oracle Always Free + Cloudflare R2)

Stand up the Kitchen AI backend on the public internet for **$0/month**, sized
for a mobile launch. Everything the API needs runs on **one Always Free VM**
(API + PostgreSQL 17/pgvector + Redis), photos live in **Cloudflare R2** (free
S3), and **Caddy** provisions a free HTTPS certificate automatically.

| Piece                           | Provider                      | Cost |
| ------------------------------- | ----------------------------- | ---- |
| API + Postgres/pgvector + Redis | Oracle Cloud Always Free VM   | $0   |
| Photo storage (S3-compatible)   | Cloudflare R2 (10 GB free)    | $0   |
| HTTPS certificate               | Let's Encrypt via Caddy       | $0   |
| Public hostname                 | DuckDNS (or a domain you own) | $0   |

> Not free, but unavoidable to actually ship: Apple Developer Program ($99/yr),
> Google Play registration ($25 once), and **metered AI** once you turn
> `AI_MOCK=false` (capped by `AI_DAILY_BUDGET_USD`). The backend itself is $0.

The stack is the existing `docker-compose.prod.yml` (bundles Postgres+Redis+the
one-shot migration) plus the Caddy overlay in this folder. See
`docs/infra-provisioning.md` for the resource→env mapping and
`docs/production-launch.md` for the full launch runbook.

---

## 1. Create the free storage bucket (Cloudflare R2)

1. Cloudflare dashboard → **R2** → create a bucket, e.g. `kitchen-photos`.
2. **Manage R2 API Tokens** → create a token with **Object Read & Write**.
3. Note the **Account ID**, **Access Key ID**, **Secret Access Key**. These map to
   `S3_ENDPOINT` (`https://<ACCOUNT_ID>.r2.cloudflarestorage.com`), `S3_ACCESS_KEY`,
   `S3_SECRET_KEY`. `S3_REGION=auto`, `S3_FORCE_PATH_STYLE=true`.
4. If a **web** client will upload directly, add a CORS rule on the bucket
   allowing your web origin and `PUT`/`GET`. Native mobile does not need this.

## 2. Create the free VM (Oracle Cloud Always Free)

1. Create an **Always Free** compute instance — an **Ampere A1** (ARM) shape is
   the roomiest free option; a small **AMD (VM.Standard.E2.1.Micro)** also works.
   Image: **Ubuntu 22.04/24.04**. Add your SSH public key.
2. **Paste `deploy/cloud-init.yaml` into the instance "user data"** to prepare
   the box on first boot (installs Docker, opens the firewall, clones the repo).
   Or skip it and run the bootstrap manually in step 3.
3. In the instance's subnet **Security List** (or an NSG), add **ingress** rules
   for **TCP 80** and **TCP 443** from `0.0.0.0/0`. This is done in the console
   and cannot be scripted from inside the VM — without it the VM is unreachable
   on those ports even though the OS firewall is open.

> Oracle occasionally reports "out of capacity" for free A1 shapes. Retry in
> another availability domain, or use the AMD micro shape. Fly.io / Koyeb /
> Render are drop-in alternatives (same Docker image) if you prefer.

## 3. Prepare the VM (if you did not use cloud-init)

SSH in and run the idempotent bootstrap:

```bash
curl -fsSL https://raw.githubusercontent.com/aomarab/kitchen-AI/main/deploy/bootstrap.sh | sudo bash
```

It installs Docker + the compose plugin, opens the OS firewall for 80/443
(Oracle's stock iptables drops them), and clones the repo to `/opt/kitchen-ai`.

## 4. Point a hostname at the VM

Caddy needs a hostname to fetch a certificate for. Either:

- **Free:** create a subdomain at [duckdns.org](https://www.duckdns.org) (e.g.
  `mykitchen.duckdns.org`) and set its IP to the VM's **public IP**; or
- **Own domain:** add an `A` record for `api.yourdomain.com` → the VM's public IP.

Set that hostname as `API_DOMAIN` in the next step.

## 5. Configure and start

```bash
cd /opt/kitchen-ai
cp deploy/.env.prod.example .env
$EDITOR .env      # fill API_DOMAIN, JWT_SECRET, POSTGRES_PASSWORD, R2, OAuth ids
```

Minimum to boot in production (see `deploy/.env.prod.example` for the rest):

- `NODE_ENV=production`, `API_DOMAIN`, `API_BIND_HOST=127.0.0.1`, `CORS_ORIGINS`
- `JWT_SECRET` (≥32 chars — `openssl rand -base64 48`), `POSTGRES_PASSWORD`
- `S3_*` for R2
- `GOOGLE_CLIENT_ID` and `APPLE_CLIENT_ID` (required in production to pin the
  ID-token audience). Google client ids are free; Apple needs the paid program.

Then bring it up (Caddy in front, API bound to localhost):

```bash
docker compose -f docker-compose.prod.yml -f deploy/docker-compose.caddy.yml up -d --build
# one-time bilingual catalog seed:
docker compose -f docker-compose.prod.yml --profile seed run --rm seed
```

## 6. Verify

```bash
curl -fsS https://$API_DOMAIN/health      # {"status":"ok","database":true,...}
./deploy/smoke.sh https://$API_DOMAIN     # end-to-end: health + validation path
```

`deploy/smoke.sh` is non-invasive (creates no data) and exits non-zero on
failure, so it doubles as a deploy gate.

Point the mobile app at it by building with
`EXPO_PUBLIC_API_URL=https://$API_DOMAIN` and `EXPO_PUBLIC_USE_MOCKS=false`.

## Turning on the paid paths later

The system boots fully working with `AI_MOCK=true` and `PAYMENTS_MOCK=true`
(offline, free). When you are ready:

- **AI:** set `AI_MOCK=false` and add `OPENAI_API_KEY` (or an OpenAI-compatible
  key). `AI_DAILY_BUDGET_USD` caps daily spend.
- **Payments:** set `PAYMENTS_MOCK=false` and add `REVENUECAT_API_KEY` +
  `REVENUECAT_WEBHOOK_SECRET`. See `docs/store-listing/iap-setup.md`.
- **Apple deletion revoke:** set `APPLE_REVOKE_MOCK=false` and the four `APPLE_*`
  values.

## Operating

```bash
docker compose -f docker-compose.prod.yml -f deploy/docker-compose.caddy.yml ps
docker compose -f docker-compose.prod.yml -f deploy/docker-compose.caddy.yml logs -f api
# update to latest main:
git pull && docker compose -f docker-compose.prod.yml -f deploy/docker-compose.caddy.yml up -d --build
```

Postgres and Redis data persist in the `postgres-data` / `redis-data` named
volumes. Back up Postgres with `pg_dump` on a schedule (the free VM has a block
volume; snapshots are outside the Always Free storage cap if large).

## Backups

`deploy/backup.sh` dumps Postgres from the running stack to a timestamped,
compressed file in `./backups/`, prunes dumps older than `RETENTION_DAYS`
(default 7), and — if `BACKUP_S3_BUCKET` is set — also uploads an **off-box copy
to R2** so a lost VM does not lose data (still $0 on R2's free tier). `pg_dump`
snapshots consistently, so it is safe to run while the API serves.

```bash
./deploy/backup.sh                                   # dump now (+R2 if configured)
./deploy/restore.sh backups/kitchen-YYYYMMDD-HHMMSS.sql.gz   # restore (prompts)
```

Schedule it daily with the bundled systemd timer:

```bash
sudo cp deploy/systemd/kitchen-backup.* /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now kitchen-backup.timer
systemctl list-timers kitchen-backup.timer          # confirm next run
```

For the off-box copy, add to `.env`:

```
BACKUP_S3_BUCKET=kitchen-backups      # an R2 bucket (can be the photos bucket)
# S3_ENDPOINT / S3_ACCESS_KEY / S3_SECRET_KEY are reused from the R2 config
```

A cron alternative (equivalent to the timer):

```bash
0 3 * * *  cd /opt/kitchen-ai && ./deploy/backup.sh >> /var/log/kitchen-backup.log 2>&1
```
