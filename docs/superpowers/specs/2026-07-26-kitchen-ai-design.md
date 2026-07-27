# Kitchen AI — Design Specification

**Date:** 2026-07-26
**Status:** Approved for implementation planning
**Author:** Brainstormed with @aomar_microsoft

---

## 1. Product Summary

Kitchen AI turns what is physically in a household's kitchen into concrete meal plans.

Users capture their ingredients — by photographing the fridge, pantry or spice rack, scanning
a barcode, photographing a receipt, or typing them in — and the app maintains a live inventory.
From that inventory it generates daily, weekly and monthly meal plans in which every meal is
grounded in ingredients the household actually has. Each meal comes with full cooking steps, the
ingredients it consumes, an image, and real YouTube videos. Cooking a meal deducts its ingredients
from the inventory automatically.

The product is fully bilingual: English and Arabic, with complete right-to-left support and
AI-generated recipe content written natively in the user's language.

### Target Platforms

Three applications sharing one backend:

- **Mobile** — React Native (Expo), iOS and Android. Best-in-class camera capture.
- **Web** — Next.js. Full feature parity with mobile, including webcam capture and drag-and-drop upload.
- **API** — NestJS. All AI calls, all business logic, single source of truth.

### Non-Goals for v1

- Grocery-delivery or e-commerce integration
- Social features (sharing plans publicly, following users)
- Nutrition coaching beyond basic macro display
- Offline write support on web

---

## 2. Key Product Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Primary platform | Mobile (Expo) **and** Web (Next.js), both fully featured | Capture is best on mobile; planning is best on desktop |
| Backend | Cloud, with accounts and households | Multi-device sync and household sharing are core |
| AI provider | OpenAI (GPT-5 vision + text) | Strong Arabic, one provider for vision and planning |
| Inventory strictness | Strict for daily plans, flexible for weekly/monthly | A month cannot be covered by today's fridge |
| Personalization | Dietary prefs, allergies, halal, cuisine, household size | Meaningfully changes suggestions |
| Video sourcing | YouTube Data API, cached server-side | LLMs hallucinate video IDs |
| Arabic content | Full RTL mirroring; AI generates in the active locale | Native Arabic beats machine translation |
| Inventory features | Photo, manual, barcode, receipt scan, expiry, auto-deduct | Full scope requested |
| Repo structure | Monorepo (pnpm + Turborepo), shared Zod contract package | Enables parallel agent workstreams |
| UI code sharing | Separate UI per platform, shared logic | Native feel on both; avoids cross-platform UI abstraction tax |

---

## 3. Architecture

### 3.1 Repository Layout

```
kitchen-AI/
├── apps/
│   ├── api/                NestJS + Drizzle + PostgreSQL
│   ├── web/                Next.js (App Router) + Tailwind + shadcn/ui
│   └── mobile/             Expo (React Native) + expo-router
├── packages/
│   ├── contracts/          Zod schemas → shared request/response types
│   ├── i18n/               en/ar message catalogs (typed keys)
│   ├── api-client/         Typed fetch client generated from contracts
│   └── config/             eslint, tsconfig, prettier presets
├── docker-compose.yml      postgres (pgvector) + redis + minio (S3) + api + web
├── turbo.json
└── docs/superpowers/specs/
```

### 3.2 Runtime Flow

```
Mobile (Expo) ─┐
               ├─ HTTPS/JSON ─→ NestJS API ─┬─→ PostgreSQL   (inventory, recipes, plans)
Web (Next.js) ─┘                            ├─→ Redis        (BullMQ job queue, cache)
                                            ├─→ S3 / MinIO   (photos)
                                            ├─→ OpenAI       (vision, planning)
                                            ├─→ YouTube API  (videos, cached)
                                            └─→ Open Food Facts (barcodes)
```

### 3.3 Architectural Rules

1. **All AI calls are server-side.** No provider API key ever ships in a client bundle.
2. **`packages/contracts` is the frozen interface.** Mobile and web code against it; the API
   validates with it. Changes require explicit agreement across workstreams.
3. **Photos upload directly to object storage** via presigned URL. The client then sends only the
   object key to the API. Large payloads never traverse the API process.
4. **Households are the unit of ownership**, not users. Inventory, plans and shopping lists belong
   to a household; users are members.
5. **Long-running work is a job**, not a request. Receipt parsing and monthly plan generation return
   a job ID; clients poll a status endpoint. No request-timeout failures.
6. **The server never sends user-facing prose.** Errors carry an i18n message key.

### 3.4 Authentication

JWT access token (15 min) + refresh token (30 days, rotating, stored hashed). Email/password plus
Apple Sign-In and Google Sign-In. Households are created by a user or joined via a 6-character
invite code. Roles: `owner`, `member`.

---

## 4. Data Model

PostgreSQL via Drizzle ORM. All tables carry `id` (uuid), `created_at`, `updated_at` unless noted.

### 4.1 Identity

```
users               id, email, password_hash (nullable for OAuth),
                    locale ('en' | 'ar'), display_name
oauth_accounts      user_id, provider ('apple' | 'google'), provider_account_id
households          id, name, created_by, invite_code
household_members   household_id, user_id, role ('owner' | 'member')
profiles            user_id, dietary_prefs[], allergies[], halal (bool),
                    cuisine_prefs[], household_size (int), health_goals[]
```

### 4.2 Inventory

```
storage_locations   id, household_id, name,
                    type ('fridge' | 'freezer' | 'pantry' | 'spice_rack' | 'other')

ingredients         id, canonical_name_en, canonical_name_ar, category,
                    default_unit, aliases[] (text[]), embedding (pgvector, nullable),
                    is_staple (bool)
                    -- global shared catalog, seeded; new entries created on demand
                    -- is_staple: water, salt, pepper, cooking oil, sugar, flour and similar.
                    --   Assumed always available for plan validation unless the household
                    --   explicitly marks a staple as out of stock.

inventory_items     id, household_id, ingredient_id, location_id,
                    quantity (numeric), unit, expires_at (nullable),
                    source ('photo' | 'manual' | 'barcode' | 'receipt'),
                    confidence (numeric, nullable), photo_key (nullable)

inventory_events    id, item_id, household_id, delta (numeric),
                    reason ('added' | 'consumed' | 'expired' | 'corrected' | 'purchased'),
                    meal_plan_entry_id (nullable), actor_user_id, created_at
                    -- append-only ledger
```

`inventory_items.quantity` is the materialized current state derived from `inventory_events`.
The ledger provides history, undo, offline write replay, and safe concurrent edits by multiple
household members.

The `ingredients` catalog is normalized and bilingual with aliases, so vision output
("طماطم", "roma tomatoes", "tomato") resolves to a single canonical row. This makes
"does the pantry cover this recipe?" a deterministic SQL query rather than fuzzy string matching.

### 4.3 Recipes

```
recipes             id, household_id (nullable = global), title_en, title_ar,
                    description_en, description_ar,
                    steps_en (jsonb[]), steps_ar (jsonb[]),
                    prep_minutes, cook_minutes, servings, difficulty,
                    cuisine, nutrition (jsonb), hero_image_key,
                    generated_by ('ai' | 'user'), source_model
recipe_ingredients  recipe_id, ingredient_id, quantity, unit, optional (bool), note
recipe_videos       recipe_id, youtube_id, title, channel, thumbnail_url,
                    duration_seconds, locale, fetched_at
```

Recipes store both languages in columns, but only the user's active locale is generated at
creation time. The other language is filled lazily when first requested.

### 4.4 Planning

```
meal_plans          id, household_id, scope ('daily' | 'weekly' | 'monthly'),
                    starts_on, ends_on, status ('generating' | 'ready' | 'failed'),
                    generation_params (jsonb), locale
meal_plan_entries   id, plan_id, date, slot ('breakfast' | 'lunch' | 'dinner' | 'snack'),
                    recipe_id, servings, state ('planned' | 'cooked' | 'skipped'),
                    position
shopping_list_items id, plan_id, household_id, ingredient_id, quantity, unit,
                    purchased (bool), purchased_at
```

### 4.5 Infrastructure

```
jobs                id, household_id, type, status ('queued'|'running'|'done'|'failed'),
                    idempotency_key, payload (jsonb), result (jsonb), error (jsonb),
                    attempts, created_at, finished_at
ai_usage            id, household_id, model, operation, input_tokens, output_tokens,
                    cost_usd, created_at
```

---

## 5. AI Pipelines

### 5.1 Photo → Ingredients (`POST /inventory/recognize`)

1. Client requests a presigned upload URL, uploads the photo directly to object storage.
2. Client posts the object key(s). Multiple photos per session (fridge, pantry, spice rack) are
   merged into one recognition session.
3. API calls GPT-5 vision with a structured-output schema returning:
   `[{ name_en, name_ar, category, estimated_quantity, unit, confidence }]`
4. Each name is resolved against the `ingredients` catalog: exact match → alias match →
   embedding similarity → create new catalog entry.
5. API returns a **review list**. It never auto-commits.
6. User confirms/edits quantities, locations and expiry dates, then `POST /inventory/items:bulk`.

The review step is mandatory. Vision estimates of quantity are unreliable, and silently wrong
inventory poisons every downstream meal plan.

### 5.2 Barcode → Product (`GET /inventory/lookup?barcode=`)

Open Food Facts API first — free, no key, good international and Arabic product coverage. On miss,
return a manual-entry prefill. Successful lookups are cached by writing the product name into
`ingredients.aliases`.

### 5.3 Receipt → Items (async job `receipt.parse`)

Vision extraction of line items from a receipt photo, then a second LLM pass mapping each raw line
(e.g. `TOMATO RM 2.50`) to catalog ingredients, with candidate catalog entries supplied in-prompt to
constrain the output. Returns a review list on job completion. Asynchronous because receipts
routinely exceed 40 lines.

### 5.4 Inventory → Meal Plan (async job `plan.generate`)

Deliberately three stages rather than one large prompt:

**Stage A — Candidate pantry (deterministic, SQL).**
Build the available-ingredient set: current inventory with quantities and units, sorted by expiry
urgency; plus profile constraints (allergies, halal, dietary preferences, cuisine preferences,
household size). No AI involved.

**Stage B — Generation (LLM).**
Given the pantry, constraints, scope and locale, generate plan entries with complete recipes as
structured output. The prompt requires prioritizing soon-to-expire ingredients and limits a single
recipe to at most two appearances per seven-day window.

Which meal slots are filled is a generation parameter. Defaults: daily and weekly plans fill
breakfast, lunch and dinner; monthly plans fill lunch and dinner only, to keep entry counts and
token costs manageable. Snacks are opt-in at any scope.

**Stage C — Validation (deterministic).**
Re-check every generated recipe's ingredient list against the inventory. Ingredients flagged
`is_staple` are treated as available unless the household explicitly marked them out of stock.

- **Daily plans:** any recipe requiring an unavailable ingredient is rejected and regenerated
  (maximum two retries). Daily plans are guaranteed cookable from stock.
- **Weekly and monthly plans:** shortfalls are recorded as `shopping_list_items` rather than
  causing rejection.

Monthly plans generate week by week to stay within context and token limits, simulating forward the
consumption of earlier weeks so later weeks do not double-spend the same ingredients.

### 5.5 Recipe → Videos (`GET /recipes/:id/videos`)

YouTube Data API `search.list` using the recipe title in the user's locale plus a locale-appropriate
keyword ("recipe" / "وصفة"). Top three results are cached in `recipe_videos` for 30 days.
Video IDs are never produced by the LLM.

### 5.6 Cost and Latency Controls

- Structured outputs everywhere; no ad-hoc JSON parsing.
- Per-household daily AI budget, enforced before the call, surfaced as `QUOTA_EXCEEDED`.
- Response caching keyed by a hash of (inventory state + generation params + locale).
- A cheaper model for name resolution and translation; the strong model only for planning and vision.
- All usage recorded in `ai_usage` for per-household cost visibility.

---

## 6. User Interface

### 6.1 Mobile — Dashboard-First

Bottom tab bar: **Home · Kitchen · Plans · More**, with a camera FAB.

Home opens on "what should I cook tonight": tonight's suggested meal with watch/cook actions,
an expiring-soon warning strip, weekly plan progress, and quick-add shortcuts
(photo / barcode / receipt). Shopping list, household management and settings live under **More**;
on web they are top-level sidebar entries.

### 6.2 Web — Sidebar + Live Pantry Rail

Persistent left sidebar (Dashboard, My Kitchen, Meal Plans, Recipes, Shopping, Household, Settings)
and, on every planning screen, a right-hand rail showing pantry coverage and what is missing.
The rail is the point of the product: the user always sees *why* a meal was suggested and what a
plan will cost them at the store. In Arabic the sidebar moves right and the rail moves left.

### 6.3 Screen Map (shared information architecture)

| Area | Screens |
|---|---|
| Auth | Sign in / sign up, Apple & Google, create or join household by invite code |
| Home | Tonight's meal, expiring soon, week progress, quick add |
| Kitchen | Locations → item list (search, filter, sort by expiry), item detail/edit; capture flow: photo / barcode / receipt / manual → AI review → confirm |
| Plans | Generate (scope + params), day view, week grid, month calendar, entry detail → swap / regenerate |
| Recipe | Hero image, title, ingredients with in-stock badges, numbered steps, cook mode, embedded YouTube, "Cooked it" → auto-deduct |
| Shopping | Built from plan shortfalls, check off, move purchased items into inventory |
| Profile | Locale toggle, dietary prefs, allergies, halal, cuisines, household size, members |

---

## 7. Internationalization

- `packages/i18n` holds `en.json` and `ar.json` as the single source for all three apps.
  Keys are typed; a missing translation is a build error, not a runtime `undefined`.
- **Web RTL:** `dir="rtl"` on `<html>` plus Tailwind logical properties (`ms-`, `me-`, `ps-`, `pe-`,
  `start-`, `end-`). Physical `left`/`right` utilities are banned and enforced by an ESLint rule.
- **Mobile RTL:** React Native `I18nManager` with logical row direction. Direction-implying icons
  (chevrons, back arrows) flip through a shared `<DirectionalIcon>` component.
- **Typography:** Tajawal on both platforms, with increased line-height relative to Latin. Tajawal ships no semibold (400, 500, 700 are the cuts used), so the 600 tier resolves to Bold.
  Numerals are Western Arabic by default, with an optional Eastern Arabic setting.
- **Dates, numbers and units** are formatted with `Intl`. In the Arabic locale a Hijri date is shown
  alongside the Gregorian date.
- **AI prompts carry the active locale**, so recipe titles, step text and shopping items are written
  natively in Arabic rather than translated from English.
- **Ingredient names** come from the bilingual catalog, so an item captured in English displays
  correctly in Arabic after a locale switch.

---

## 8. Error Handling

- **Single typed error envelope:** `{ code, messageKey, details }`. Clients render `messageKey`
  through `packages/i18n`.
- **AI failures degrade, never dead-end:**
  - Vision returns nothing → open manual entry, prefilled, with the photo attached.
  - Planning fails → retain the previous plan and show a retry banner.
  - YouTube quota exhausted → render the recipe without video; retry the fetch later.
- **Schema validation on every AI response.** On failure: one repair retry, then a typed
  `AI_INVALID_OUTPUT` error. Raw model JSON is never trusted.
- **Idempotent jobs** keyed by a client-supplied idempotency key, so a double tap or a reconnect
  cannot create duplicate plans. Failed jobs persist their error and are user-retryable.
- **Rate limits and per-household AI budgets** return `QUOTA_EXCEEDED` with a localized message.

---

## 9. Offline and Sync

- **Mobile:** TanStack Query with a persisted cache. Inventory and today's plan are readable offline.
  Writes are queued as inventory *events* and replayed on reconnect — the append-only ledger makes
  this safe by construction.
- **Conflict resolution:** last-write-wins per item field, except `quantity`, which merges by summing
  deltas so two household members deducting the same item both count.
- **Web:** online-first. No offline write queue in v1.

---

## 10. Testing Strategy

- **`packages/contracts` schemas are the shared test fixtures**, generating valid and invalid samples
  for both client and server tests.
- **API:** Vitest unit tests for pantry-coverage and plan-validation logic (pure functions, no AI);
  integration tests against a disposable PostgreSQL via Testcontainers. AI providers are mocked by
  default using recorded fixtures, with a small `--live` suite run manually.
- **Heaviest coverage goes to the Stage-C validator** — whether a generated plan actually fits the
  inventory is the correctness core of the product.
- **Web:** Vitest + Testing Library; Playwright for capture → review → confirm and for plan
  generation, including an Arabic RTL run.
- **Mobile:** Jest + React Native Testing Library; Maestro for the same two critical flows.
- **CI:** lint, typecheck, unit and integration tests on every pull request. Every workstream must be
  green before merge.

---

## 11. Delivery Plan and Parallel Workstreams

### Phase 0 — Foundation (sequential, no parallelism)

Nothing can be parallelized until the shared contract exists.

- Monorepo with pnpm workspaces and Turborepo
- `packages/contracts` — every Zod schema for every endpoint
- `packages/i18n` skeleton with typed keys
- `packages/api-client` generated from contracts
- Drizzle schema and initial migrations
- `docker-compose.yml` — PostgreSQL + MinIO
- CI pipeline

### Phase 1 — Four parallel workstreams

Each agent owns a disjoint set of folders. No two agents write the same file.

| Agent | Owns | Deliverable |
|---|---|---|
| **A — API Core** | `apps/api` (auth, households, inventory, catalog) | Auth, CRUD, presigned uploads, event ledger, coverage queries |
| **B — AI Services** | `apps/api/src/ai/**` only | Vision recognition, receipt job, barcode lookup, three-stage planner, YouTube client — against mocked LLM fixtures first |
| **C — Web** | `apps/web` | Next.js shell, sidebar + pantry rail, all screens, against a contract-generated mock server |
| **D — Mobile** | `apps/mobile` | Expo app, tab navigation, camera and barcode capture, review flow, offline cache |

Agents C and D do not block on A and B; they develop against MSW mocks generated from
`packages/contracts`. `packages/i18n` is append-only per agent to avoid merge conflicts.

### Phase 2 — Integration

Replace mocks with the real API, wire the AI services into the core API, seed the ingredient
catalog, run end-to-end suites including Arabic RTL, and resolve the seams between workstreams.

### Phase 3 — Polish

Live AI prompt tuning and cost controls, expiry push notifications, app store configuration and
web deployment.

### Coordination

The coordinating agent owns `packages/contracts`, reviews each workstream's output, resolves
conflicts, and keeps the build green. Checkpoint after each phase.

---

## 12. Resolved Implementation Choices

These were open during design and are now decided, so implementation planning has no ambiguity:

- **Job queue:** BullMQ backed by Redis, integrated via `@nestjs/bullmq`. Redis is added to
  `docker-compose.yml`. Jobs: `receipt.parse`, `plan.generate`, `recipe.translate`, `video.fetch`.
- **Hosting:** everything ships as Docker images and runs from a single `docker-compose.yml`
  (API, web, PostgreSQL with `pgvector`, Redis, MinIO), matching the deployment style already used
  in the AI-OS project. Mobile builds and distributes through Expo EAS.
- **Ingredient catalog seed:** a curated JSON seed of approximately 500 common ingredients covering
  Middle Eastern and international cooking, each with English and Arabic canonical names, category,
  default unit, aliases and an `is_staple` flag. Committed to the repo and loaded by a Drizzle seed
  script. The catalog grows at runtime as vision and receipts surface unknown ingredients.
- **Ingredient similarity:** `pgvector` extension on PostgreSQL, with an embedding column on
  `ingredients` populated at catalog-write time. No separate vector service.

## 13. Success Criteria

The build is complete when:

1. A user can capture their fridge, pantry and spice rack by photo on both web and mobile, review
   the recognized items, and commit them to inventory.
2. Barcode scan, receipt scan and manual entry all produce inventory items.
3. A daily plan generates in which every meal is fully cookable from current stock (staples aside).
4. Weekly and monthly plans generate with an accurate shopping list of shortfalls.
5. Each meal shows steps, ingredients with in-stock badges, an image, and working YouTube videos.
6. Marking a meal cooked deducts its ingredients and the change syncs across devices.
7. Switching to Arabic mirrors the entire interface and shows recipe content in Arabic.
8. CI is green: lint, typecheck, unit, integration, and the two end-to-end flows on each platform.
