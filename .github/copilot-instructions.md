# Kitchen AI — Copilot instructions

Photograph your kitchen, get meal plans grounded in what you actually have. pnpm + Turborepo
monorepo: NestJS API, Next.js web, Expo mobile, four shared packages. Fully bilingual en/ar with
real RTL mirroring.

Authoritative docs: `README.md` and the design specs in `docs/superpowers/specs/`. Code comments cite
them as "spec §N" — the section number belongs to the spec that owns that subsystem, so match the
file to the feature: `2026-07-26-kitchen-ai-design.md` (system baseline),
`2026-07-27-slack-inspired-ui-design.md` (UI), `2026-07-27-web-camera-capture-design.md` (capture),
`2026-08-09-product-feedback-admin-console-design.md`, `2026-08-10-device-compatibility-design.md`,
`2026-08-10-publishing-compliance-design.md`, `2026-08-11-ai-credits-design.md`,
`2026-08-11-recipe-media-resolution-design.md`. Adding a subsystem means adding a spec, not just
code.

## Commands

Run everything from the repo root. The repository pins pnpm 10.34.5 and requires Node >= 20; CI
uses Node 22 and installs with `pnpm install --frozen-lockfile`.

| Command                                       | Does                                                                                      |
| --------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `pnpm dev` / `pnpm build`                     | All apps (turbo). Web dev serves on **3100** (`WEB_PORT`), API on 3333                    |
| `pnpm typecheck` / `pnpm lint` / `pnpm test`  | Whole workspace                                                                           |
| `pnpm infra:up` / `infra:down`                | Docker: PostgreSQL 17 + pgvector, Redis, MinIO                                            |
| `pnpm db:generate` / `db:migrate` / `db:seed` | Drizzle migrations + bilingual ingredient catalog (`db:seed -- --dry-run` validates only) |
| `pnpm format`                                 | Prettier over the repo                                                                    |

CI runs `pnpm build`, `pnpm typecheck`, `pnpm lint`, then `pnpm test`.

Drizzle Studio is API-only: `pnpm --filter @kitchen/api db:studio`.

Single package: `pnpm --filter @kitchen/api <script>` (also `@kitchen/web`, `@kitchen/mobile`,
`@kitchen/contracts`, `@kitchen/api-client`, `@kitchen/i18n`).

Single test file or name filter — all three apps run Vitest:

```bash
pnpm --filter @kitchen/web exec vitest run src/lib/token-usage.test.ts
pnpm --filter @kitchen/api exec vitest run src/inventory/units.spec.ts -t 'converts'
pnpm --filter @kitchen/mobile exec vitest run src/lib/event-queue.spec.ts
```

`turbo run build` must have produced `packages/*/dist` before typecheck, lint or test — every task
declares `dependsOn: ["^build"]`.

## Test topology

- **API** (`src/**/*.spec.ts`, node env): many specs are _integration_ tests that hit the live
  Postgres at `DATABASE_URL`. They need `pnpm infra:up && pnpm db:migrate && pnpm db:seed` first.
  `vitest.setup.ts` loads the repo-root `.env`; `src/testing/harness.ts` gives you
  `createTestContext` / `seedUser` / `seedHousehold` / `cleanup` (delete households before users —
  FK ordering matters).
- **Web** (`src/**/*.{test,spec}.{ts,tsx}`, jsdom): every request is served by the MSW handlers in
  `src/mocks`; `vitest.setup.ts` re-seeds the mock DB and resets the locale to `en` between tests.
- **Mobile** (`src/**/*.spec.ts`, node only): pure logic only — offline queue, formatting, expiry,
  error mapping, theme guards. No native render harness.
- API provider adapters use mocks by default because `AI_MOCK` defaults to `true`, so the whole
  system runs offline and free with no OpenAI/YouTube key.

## Architecture

`packages/contracts` is the frozen interface. `src/routes.ts` is a single registry of every HTTP
endpoint (method, path, auth, household, zod body/query/params/response). From it:
`@kitchen/api-client` derives a fully typed `call(routeName, …)`, the API validates requests with
the same schemas, and the mobile MSW handlers iterate `routes` directly (`mocks/coverage.spec.ts`
fails if a route has no resolver). **Never edit `packages/contracts` from an app** — a contract
change is coordinated centrally because both sides of every request come from it.

Non-obvious system rules:

- **Households own data, not users.** Household-scoped routes require the `x-household-id` header;
  controllers combine `@UseGuards(AuthGuard, HouseholdGuard)` with `@CurrentHousehold()` /
  `@CurrentUser()`.
- **Inventory is an append-only event ledger.** `inventory_items.quantity` is materialized state
  derived from `inventory_events`; writes must add an event and adjust quantity in the same
  transaction, or offline replay stops summing. Mobile queues writes as events
  (`src/lib/event-queue.ts`, `src/stores/offline-queue.ts`) and replays on reconnect; quantity
  conflicts merge by summing deltas, other fields are last-write-wins.
- **Long work is a job, not a request.** Receipt parsing and plan generation return a job id and are
  processed by BullMQ (`src/ai/jobs`); clients poll. Job-creating routes take an `idempotency-key`
  header.
- **Photos never traverse the API.** Client gets a presigned S3/MinIO URL, uploads directly, then
  sends only the object key.
- **Meal planning is three stages** (spec §5): A deterministic SQL pantry snapshot → B LLM candidate
  recipes as structured output → C deterministic re-validation against the pantry. Daily plans that
  fail C regenerate (max 2 retries); weekly/monthly convert shortfalls into shopping-list items.
  Stage C is the correctness core — it gets the heaviest test coverage.
- **AI providers swap on `env.AI_MOCK`** in `src/ai/ai.module.ts` (OpenAI, YouTube, Open Food Facts,
  embeddings each have a Mock* and an Http*/OpenAi* implementation behind a DI token in
  `ai.constants.ts`). New external calls follow the same port/adapter shape.
- **YouTube video ids always come from the YouTube Data API**, never from the model, and are cached
  per recipe.
- **Every model call goes through `AiGateway`** (`src/ai/ai-gateway.service.ts`). It is the single
  choke-point: budget check before the call, schema-guarded provider call with one repair retry,
  usage recorded after. A service that calls a provider directly bypasses cost control and output
  validation — always route through the gateway.
- **AI is paid for in credits, not requests.** `CREDIT_COSTS` / `FREE_MONTHLY_GRANT` live in
  `packages/contracts/src/credits.ts` because prices are contract, not server detail. A household
  has two buckets — a free grant that resets each calendar month and a purchased balance that never
  expires (Apple Guideline 3.1.1) — and free is always spent first. `CreditsService.spend` locks the
  balance row `FOR UPDATE`; that lock is required for split correctness, not an optimisation. Spends
  return a spend-group id so `refundSpendGroup` can reverse them idempotently when the job fails.
- **Staff surfaces are guarded server-side.** `@UseGuards(AuthGuard, StaffGuard)` is the security
  boundary for `/admin/*`; the web `AdminGate` only hides UI. Guard order matters — `AuthGuard` must
  populate `request.authUser` before `StaffGuard` reads the role. In Nest controllers, declare
  literal routes (`@Get('stats')`) before `:id` routes.

## API conventions (`apps/api`)

- ESM-style relative imports carry the `.js` extension (`./common/errors.js`) even though the
  compiler emits CommonJS.
- Validation is `@Body(new ZodPipe(schema))` / `@Query(...)` / `@Param('id', new ZodPipe(uuidSchema))`
  using the contract schema — no `class-validator` DTOs.
- **The server never sends user-facing prose.** Throw `AppError` (`common/errors.ts`) with an error
  code plus an i18n `messageKey`; `AppExceptionFilter` renders the `{ code, messageKey, details }`
  envelope and clients translate.
- Drizzle `numeric` columns come back as strings and timestamps as `Date`. Convert through
  `common/serialization.ts` (`toNumber`, `toIso`, `numeric`, `round3`) rather than inline casts.
- `config/env.ts` is a zod contract; the API refuses to boot on an invalid environment and has
  production-only guards (CORS origins, OAuth client ids for `aud` pinning, OpenAI key).
- Schema changes: edit `src/db/schema.ts`, then `pnpm db:generate` and commit the generated SQL in
  `apps/api/drizzle/`. Never hand-write a migration.

## i18n and RTL

- `packages/i18n/src/en.ts` is the source of truth for the key set; `ar.ts` is typed against it, so a
  missing Arabic translation is a **build error**.
- The catalogs are **append-only per namespace**: `en.ts`/`ar.ts` are coordinator-owned shared
  strings, web adds to `web.en.ts`/`web.ar.ts`, mobile to `mobile.en.ts`/`mobile.ar.ts`. Backend
  code contributes `errors.*` keys only.
- **No physical-direction styles.** `packages/config/eslint.base.mjs` rejects `ml-*`, `pl-*`,
  `left-*`, `text-left`, `border-l-*`, `rounded-l-*` in web string literals (`baseConfig({ rtl: true })`)
  and `marginLeft`, `left`, `borderRightColor`… style keys on mobile (`baseConfig({ styleKeys: true })`).
  Use `ms/me`, `ps/pe`, `start/end`, `text-start`, `marginStart`. Direction-implying icons go through
  `DirectionalIcon`.
- AI prompts carry the active locale so recipes are written natively in Arabic, not translated.

## Design tokens (self-enforcing)

Colour, radius and tracking resolve from exactly two files: `apps/web/src/app/globals.css`
(`@theme inline` Tailwind v4 tokens) and `apps/mobile/src/theme/index.ts`. Components reference
tokens by name. Three guard tests keep it honest and must not be relaxed to make a change pass:

- `apps/web/src/app/palette.test.ts` + `apps/mobile/src/theme/palette.spec.ts` parse the token files
  and assert WCAG contrast ratios.
- `apps/web/src/lib/token-usage.test.ts` sweeps the source for hex literals outside the token files,
  for `text-primary` used on text (aubergine text uses `text-primary-text`; `text-primary` is
  reserved for fills and focus rings), and for opacity tints (`bg-primary/8`) where a solid `*-soft`
  token is required — Tailwind v4 compiles `/8` to `color-mix`, which breaks the contrast maths.
- `apps/mobile/src/theme/typography.spec.ts` asserts Latin tracking exists and Arabic gets none.

Letter-spacing is delivered through `--track-*` variables that `:root:lang(ar)` zeroes — never
hard-code `letter-spacing`, because Arabic is cursive and tracking breaks the joins. Arabic keeps
1.85 line-height, Latin 1.55. `DESIGN.md` is the upstream brand analysis, not the implemented
palette; the Slack-inspired UI spec supersedes it where they disagree.

## Client conventions

- Web and mobile each construct one typed client (`src/lib/api.ts`) from `@kitchen/api-client`, with
  the household id read from the session/auth store and token persistence injected (localStorage on
  web, `expo-secure-store` on mobile).
- Both apps ship an MSW mock layer, so they run with no API at all — but the two defaults are
  **opposite**, and the difference matters:
  - Web development forces `NEXT_PUBLIC_API_MOCK=true` (the `pnpm dev` script sets it); production
    fails closed and does not enable mocks from that flag (`src/lib/config.ts`).
  - Mobile uses MSW unless `EXPO_PUBLIC_USE_MOCKS=false`.
- Server state is TanStack Query, client/session state is Zustand. Web uses the `@/*` alias to
  `src/`; mobile and web relative imports have no file extension (unlike the API).

## MCP servers

The Playwright MCP server is available. Use it to verify web changes against the running dev server
at `http://localhost:3100` (start it with `pnpm dev`, which runs in MSW mock mode so no API or
database is needed). It is the practical way to check RTL mirroring: switch the locale to Arabic and
confirm the sidebar moves right and the pantry rail moves left.
