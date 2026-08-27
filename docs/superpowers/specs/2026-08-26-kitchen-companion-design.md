# Kitchen Companion — Smart Screen, Voice & Live Assistant Design

**Date:** 2026-08-26
**Status:** Draft for review

## Goal

Extend Kitchen AI from an inventory-and-meal-planning app into a **kitchen companion**: an
always-on smart-screen surface, a friendly spoken assistant, wellness nudges that care about the
cook (not just the food), cooking timers, and a live camera + voice conversation mode. Every piece
stays grounded in the household's real inventory and is fully bilingual (en/ar, RTL).

The direction and UX were validated with five interactive prototypes, saved under
`.superpowers/brainstorm/86190-1787762114/content/` (`01`–`06`). This spec is the program-level
design; each phase below gets its own focused implementation plan.

## Scope

Five features, built in this order:

1. **Smart-screen kitchen view** — an always-on, responsive kitchen display (clock, current voice
   alert, active timers, hydration, nav: تايمر / وصفات / ملاحظات / تنبيهات).
2. **Wellness reminders engine** — scheduled, spoken/notified nudges: breaks, stretching, morning
   exercise, hydration. Configured from the app, synced to the screen.
3. **Cooking timers + voice alerts** — multiple named timers running together; a friendly spoken
   alert replaces a bare beep ("باقي ٥ دقائق على الأرز").
4. **Voice & personalization** — choose the assistant's voice, dialect, tone, recipe language, and
   which alerts run.
5. **Live camera + voice assistant** — open the camera and keep talking; the assistant sees
   ingredients in real time and (A) scans the pantry hands-free and writes inventory, (B) coaches
   through a recipe, and (C) answers open kitchen questions.

**A later phase** ("الرؤية المستقبلية") — family tasks, whole-home organization, life/habit
tracking — is explicitly out of scope here and gets its own spec cycle when we reach it.

### Non-goals / assumptions

- **No custom hardware.** The "smart screen" is a **responsive surface of the existing clients**,
  not a device we manufacture. It is a full-screen kiosk route in the Next.js web app (and a
  screen in the Expo app) that runs on a wall-mounted or countertop tablet/phone. Confirmed by the
  requirement that the layout **auto-switches on device rotation** — one responsive/adaptive
  layout, both orientations, no separate app.
- We reuse Kitchen AI's design tokens (aubergine `--primary #814be3`, hero `--inverse #2e1065`) and
  never introduce physical-direction styles (RTL rules in `packages/config/eslint.base.mjs`).

## How this maps onto the existing architecture

Everything below follows patterns already in the repo — no new paradigms except the realtime
channel (feature 5), which is called out explicitly.

- **Contracts first.** Every new endpoint is added to the single registry
  `packages/contracts/src/routes.ts` with zod body/query/params/response, plus new schema files
  (`reminders.ts`, `timers.ts`, `assistant.ts`). `@kitchen/api-client` and the MSW mocks derive
  from it automatically; `mocks/coverage.spec.ts` forces a resolver for each route.
- **Households own the data.** Reminder settings, timers, voice preferences, and assistant sessions
  are household-scoped (`x-household-id`, `@UseGuards(AuthGuard, HouseholdGuard)`), except
  per-user voice/tone which is user-scoped on the profile.
- **AI stays behind ports.** Two new DI tokens in `apps/api/src/ai/ai.constants.ts`, each with a
  `Mock*` and a real adapter selected by `env.AI_MOCK` in `ai.module.ts` (exactly like
  `AI_PROVIDER`, `EMBEDDINGS_PORT`):
  - `TTS_PORT` → `MockTts` (returns a silent/stub audio fixture) / `OpenAiTts`.
  - `REALTIME_ASSISTANT_PORT` → `MockRealtimeAssistant` (scripted transcript + fixture detections) /
    `OpenAiRealtimeAssistant`.
    New `AiOperation` values (`voice.synthesize`, `assistant.realtime`) join `OPERATION_TIER` and the
    cost table so budget accounting and fixtures keep working. `AI_MOCK` stays the default, so the
    whole system still runs offline and free.
- **Scheduling is BullMQ.** The reminders engine adds a repeatable-job queue (`QUEUE_REMINDER`)
  next to `QUEUE_PLAN`/`QUEUE_RECEIPT`, registered in `ai.module.ts` with a `ReminderProcessor`.
- **Inventory writes stay append-only.** Live-mode "add to inventory" emits `inventory_events` and
  adjusts `inventory_items.quantity` in the same transaction — the ledger invariant is not bypassed
  by voice.
- **i18n is append-only per namespace.** Shared `errors.*` keys go in `packages/i18n/src/{en,ar}.ts`;
  screen/app strings go in `web.{en,ar}.ts` / `mobile.{en,ar}.ts`. A missing `ar` key is a build
  error. AI prompts and TTS carry the active locale so the assistant speaks native Arabic.
- **Both clients keep their MSW layer**, so the new screens are demoable with no API/DB.

---

## Feature 1 — Smart-screen kitchen view

**Surface:** a new full-screen route in the web app (e.g. `/[locale]/screen`) with a kiosk layout,
plus a mobile screen. One responsive layout that reflows between **landscape** (primary — two-column:
voice alert + timers/hydration) and **portrait** (stacked) using CSS container/media queries and
the `orientationchange`/resize signal. Prototype: `01-smart-screen.html`, `02-orientation.html`.

**Composition:** status bar (clock, wifi, household name, "يتحدث الآن" state) · the current
voice-alert hero (deep-violet `--inverse`) · active-timer and hydration mini-cards · bottom nav
(تايمر / وصفات / ملاحظات / تنبيهات). It is a **read/compose view over existing data** (recipes,
inventory) plus the new timers/reminders — little new server state of its own beyond a "screen
config" (which household, which panels, wake hours).

## Feature 2 — Wellness reminders engine

**Data model (new tables):**

- `reminder_settings` — household-scoped: per-type enabled flag (`break`, `stretch`, `morning`,
  `hydration`), break cadence (30/60/90/120 min), **stretch cadence (the same four intervals, on an
  independent clock, default 90)**, quiet hours, hydration goal (cups/day).

  The stretch cadence was not in the original spec, and its absence had a cost worth recording. The
  `stretch` toggle shipped and defaulted to on, but the engine could not schedule the type — nothing
  said how often — so every household was told stretch reminders were running while none could ever
  fire. The toggle was withdrawn rather than given an invented interval, and returned only once this
  setting existed. Break and stretch are separate settings because they ask for different things:
  stop working, versus move your body. When both fall due in the same sweep, **both fire**;
  suppressing one would silently cancel a cadence the household chose.

- `reminder_occurrences` — a log of fired reminders (type, firedAt, channel, acknowledged) so the
  screen can show "5 of 8 cups" and we can avoid double-firing.

**Scheduling:** a BullMQ **repeatable job** per household computes the next due reminder from
`reminder_settings` and quiet hours; the `ReminderProcessor` picks a message (localized), renders
it to speech via `TTS_PORT`, and dispatches to the screen (WebSocket/SSE push) and/or a mobile push
notification. Message copy lives in i18n (e.g. `reminders.break.body`), never as server prose —
the API sends `{ code, messageKey, params }` and the client/TTS renders it (consistent with
`AppError`/`AppExceptionFilter`).

**Routes (indicative):** `getReminderSettings`, `updateReminderSettings`, `listReminderOccurrences`,
`acknowledgeReminder`. Prototype: `03-wellness-settings.html`.

## Feature 3 — Cooking timers + voice alerts

**Data model:** `cooking_timers` — household-scoped: label, durationSec, startedAt, status
(running/paused/done), plus derived `remainingSec`. Multiple run concurrently.

**Behavior:** timers count down client-side for smoothness but are **persisted server-side** so any
surface (screen, phone) shows the same state and survives reload. On threshold (e.g. T-5 min) and
at zero, the server emits a spoken alert through `TTS_PORT` + push, using the chosen voice. Controls:
+1 min, pause, stop, new timer. **Routes:** `listTimers`, `createTimer`, `updateTimer` (extend/
pause/stop), `deleteTimer`. Prototype: `04-cooking-timers.html`.

## Feature 4 — Voice & personalization

**Data model:** extend the user/household profile with `assistantVoice` (voice id), `voiceDialect`,
`tone` (warm/neutral/energetic), `recipeLanguage` (en/ar — already partly present), and per-type
alert opt-ins. Voice/tone are **per-user**; alert opt-ins are household-scoped.

**Provider:** `TTS_PORT` (OpenAI TTS in prod, Mock offline). Voice catalog is a small static list
mapped to provider voice ids (prototype names ليلى/نور/سلمى/عمر are placeholders → map to real
provider voices during build). A "preview" route synthesizes a sample line in the chosen voice/tone/
dialect. Recipe language already flows into AI prompts so recipes are authored natively, not
translated. Prototype: `05-voice-personalization.html`.

## Feature 5 — Live camera + voice assistant (the new architectural piece)

This is the **only feature that breaks Kitchen AI's current I/O rules** and deserves the most
scrutiny. Today: "photos never traverse the API" (presigned S3 upload → object key) and "long work
is a job." Live mode is the opposite — a **persistent, low-latency, bidirectional audio+video
session**.

**Channel:** a realtime transport (WebRTC preferred; WebSocket fallback) between the client and a
realtime multimodal model. **Recommended provider: OpenAI Realtime API**, because the repo already
standardizes on OpenAI (`OpenAiProvider`, `OPENAI_API_KEY`) — behind `REALTIME_ASSISTANT_PORT` so a
`Mock` implementation keeps `AI_MOCK` dev offline (scripted transcript + fixture detections, exactly
what prototype `06` shows). _(Open question: OpenAI Realtime vs Gemini Live — decide at build time
on latency/vision quality/cost.)_

**Session lifecycle:** client calls `startAssistantSession` → API mints a short-lived, scoped
realtime credential (ephemeral token; the standing `OPENAI_API_KEY` never reaches the client) and
records an `assistant_sessions` row → client streams audio+video directly to the provider → API
receives tool-call/event callbacks. `endAssistantSession` closes it and logs usage/cost via the
existing usage repository + budget guard.

**Grounding:** at session start the API injects the deterministic **Stage-A pantry snapshot**
(`PANTRY_PORT`) as context, so answers reflect real inventory ("عندك كل المكوّنات ✅").

**Inventory writes (mode A):** when the user confirms detected items, the model issues a tool call
that the API turns into `inventory_events` + a `quantity` adjustment **in one transaction** — the
append-only ledger and offline-replay summing are preserved. Vision item names resolve through the
existing `CATALOG_PORT`/bilingual catalog, not free text.

**Coach (mode B) / Q&A (mode C):** read-only; the model uses the pantry snapshot and the current
recipe steps as context. No new write path.

**Cost, privacy, safety (must-haves, not polish):**

- Explicit camera + mic consent per session; a persistent on-screen "مباشر/LIVE" indicator.
- **Frame sampling**, not full-motion video, to bound cost and bandwidth; enforce a per-session and
  per-household budget cap through the existing spend guard before/again during a session.
- Nothing is written to inventory without an explicit user confirmation step.
- Video/audio are streamed for inference, not persisted, unless the user saves a still.

Prototype: `06-live-assistant.html`.

---

## New contract surface (summary)

New schema files in `packages/contracts/src/` — `reminders.ts`, `timers.ts`, `assistant.ts`,
`voice.ts` — and routes registered in `routes.ts`:

- Reminders: `getReminderSettings`, `updateReminderSettings`, `listReminderOccurrences`,
  `acknowledgeReminder`
- Timers: `listTimers`, `createTimer`, `updateTimer`, `deleteTimer`
- Voice: `getVoicePrefs`, `updateVoicePrefs`, `previewVoice`
- Assistant: `startAssistantSession`, `endAssistantSession`, `assistantAddDetectedItems`
- Screen: `getScreenConfig`, `updateScreenConfig`

All household-scoped except voice/tone (user-scoped). New DB tables:
`reminder_settings`, `reminder_occurrences`, `cooking_timers`, `assistant_sessions`, and profile
columns for voice prefs. Schema changes go through `src/db/schema.ts` → `pnpm db:generate` (never a
hand-written migration).

## Testing strategy

- **API:** integration specs (live Postgres) for reminder scheduling due-time math, quiet-hours
  suppression, timer state transitions, and the live-mode **inventory-write transaction** (ledger
  event + quantity must move together). Realtime and TTS are exercised through their `Mock`
  adapters. Follow the deliberate fault-injection practice: break the rule (e.g. write quantity
  without an event) and prove the named test reddens.
- **Web:** MSW-backed component/interaction tests for the screen (both orientations), settings
  toggles, timer controls, and live-mode consent gating.
- **Mobile:** pure-logic specs — reminder formatting, timer countdown/rollover, offline queueing of
  inventory writes emitted by live mode.
- **Design tokens:** new surfaces must pass the existing guard tests (palette contrast, token-usage
  sweep, Arabic-tracking). No relaxing those to make a screen pass.

## Open questions

1. Realtime provider: OpenAI Realtime API vs Gemini Live (latency, vision quality, cost, Arabic ASR).
2. Screen ↔ server push transport for alerts: WebSocket vs SSE (does anything else need duplex?).
3. Reminder delivery when no screen is awake — mobile push only? Which push service?
4. Voice catalog: which real provider voices map to the Arabic dialects shown in the prototype?
5. Frame-sampling rate / budget ceiling defaults for live mode (needs a cost model, not a guess).

## Phasing

Phase 1: Feature 1 + 2 (screen + reminders) — highest value, establishes the push channel and TTS
port. Phase 2: Feature 3 (timers). Phase 3: Feature 4 (voice/personalization catalog + preview).
Phase 4: Feature 5 (live assistant) — largest, depends on TTS + realtime port + consent/budget work.
Each phase is specced/planned on its own before implementation.
