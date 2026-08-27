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

**As built.** Both surfaces exist: `apps/web/src/components/screen/SmartScreenView.tsx` and
`apps/mobile/src/app/screen.tsx`, each a thin arrangement over a pure `lib/screen.ts`. They share no
code and duplicate no decisions — which nudges are schedulable, which one is outstanding, and how
many cups count all come from `@kitchen/contracts`, because that is the part which, if duplicated,
would let the kiosk and the phone disagree.

Three things turned out to distinguish a kiosk from another list, and each is asserted by a check
that was proven to fail (`apps/mobile/src/lib/screen-surfaces.spec.ts`):

- **It holds the display awake** (`useKeepAwake`). A view that sleeps after thirty seconds is not
  something you glance at with wet hands.
- **Its one-second tick is gated on a timer actually running.** The kiosk is left open for the
  length of a roast; an ungated tick would re-render it tens of thousands of times over an evening
  while nothing counts down.
- **It is the only screen allowed to rotate.** This is the part that nearly shipped broken. The app
  was pinned with `"orientation": "portrait"` in `app.json`, and on iOS
  `UISupportedInterfaceOrientations` is a _ceiling_, not a default — a runtime `unlockAsync` under it
  compiles, ships, and rotates nothing. The manifest now permits landscape and `useOrientationLock`
  in the root layout takes it back at runtime, so the kiosk is the one screen that opts out and
  restores the lock on the way out. `store-policy.spec.ts` pins both halves together.

Still unbuilt from the sketch above: the wifi indicator, the "يتحدث الآن" speaking state (Feature 5),
and the persisted screen config — the mobile kiosk is a route you open, not a device you provision.

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

### As built — Phase A (client, offline)

The port (`apps/web/src/lib/assistant/realtime-port.ts`), the scripted
`MockRealtimeAssistantClient`, real camera+mic consent, and the confirm-before-write step reusing
`ReviewList` → `bulkCreateInventory`. `isMock` drives a persistent "Demo" badge.

### As built — Phase B (the real transport)

The real adapter now ships: `POST /assistant/sessions` mints an ephemeral OpenAI Realtime client
secret, and `OpenAiRealtimeAssistantClient` opens the WebRTC peer connection with it. Several things
were decided differently from the sketch above, and the reasons matter more than the code:

- **No `assistant_sessions` table, no `endAssistantSession`, no tool-call callbacks to the API.**
  The sketch assumed the API stays in the loop for the life of a session. It cannot: the transport
  is browser↔provider by design, so a server-side session row would record only that a credential
  was minted, not whether it was used or for how long. A table that looks like session accounting
  but is not would be worse than no table.
- **The mint is the only server-side moment, so it is where the charge happens.** Order is
  spend → mint → refund-on-throw. Charging after minting would make the credit check advisory: we
  would already have been billed by the provider before discovering we must refuse.
- **`REALTIME_SECRET_TTL_SEC` is pinned to the provider floor of 10s as a cost control**, not a UX
  knob. One client secret may start _any number of sessions_ until it expires, so the TTL — not the
  session length — is what bounds a single paid mint.
- **Session duration is not bounded and cannot be.** Once connected, the session is between client
  and provider and there is no server-set hard limit to rely on. `'assistant.session'` is therefore
  priced at **25 credits as an estimate of a typical short session**, not a measured cost. Long
  sessions are under-charged. This is a stated limitation, not an oversight; metering it would
  require relaying the audio, which is the round trip the design exists to avoid.
- **This is a deliberate exception to "every model call goes through `AiGateway`."** The gateway's
  contract is budget-check → schema-guarded call → usage recorded, around a call whose token counts
  we can see. Here we see none of the traffic, so routing through it would produce a usage row that
  is a fiction.
- **No frame sampling, because no video is sent at all.** The published track is audio only. The
  model is speech-to-speech; a video track would ship the user's kitchen to the provider for a
  benefit they were never promised. "Vision" in this feature is the still-image scan path, which is
  unchanged.
- **Detections come from a `report_items` tool, not from parsing the transcript**, and the tool's
  `unit`/`category` enums are generated from the contract schemas so they cannot drift. The client
  re-validates every item and **drops** what fails rather than coercing it — a silently corrected
  item is indistinguishable from one the model actually saw. There is deliberately no
  `add_to_inventory` tool: a detection is a suggestion, and the write goes through the normal
  append-only inventory event path after a human confirms it.
- **The demo badge fails safe.** `isMock` starts `true` and drops only once the API returns a
  session it states is real; a deployment with `AI_MOCK=true` mints an unusable secret and the
  client hands over to the scripted adapter with the badge still lit.

- **Grounding reuses the planner's Stage-A snapshot**, rendered to text by
  `apps/api/src/ai/assistant/pantry-brief.ts` and sent as session context — not a second inventory
  reader, because two readers would eventually disagree and an assistant that contradicts the meal
  plan about what is in the fridge is worse than one that knows nothing. The read happens _before_
  the debit, so a failed query never charges anyone. The brief is capped at `MAX_PANTRY_LINES = 60`
  (instructions are charged for on every mint), ordered expiry-first so the cut falls where it
  matters least, and carries two disclaimers that are load-bearing rather than decorative: it lists
  only what is **tracked**, not everything the user owns; and when it was truncated it says so, and
  by how much. A partial list presented as complete makes the model tell the user they are out of
  something they can see on the counter. Every part of a line is localised — name, unit and expiry
  label — via an exhaustive `Record<Locale, Record<Unit, string>>`, so adding a unit to the contract
  fails the build rather than leaking `piece` into an Arabic prompt. That leak was live once: the
  brief localised the name and nothing else, and the test that should have caught it only asserted
  on the name, which was the one part that was already correct. Arabic spells units out in full
  rather than reusing the `@kitchen/i18n` display abbreviations, which are sized for tight layouts
  and which a speech model would read aloud as letters.

Fault injection for all of the above lives in `scripts/fault-inject-assistant.mjs` (24 defects, each
caught by the check that names it). Run it **after** Prettier: anchors are string-exact, and one of
them silently went stale when Prettier rewrapped a ternary, leaving that rule unproven until the
harness was re-run and reported `anchor not found`.

Verified against a real OpenAI account on 2026-08-27: `gpt-realtime` is a valid model id, and
`POST /v1/realtime/client_secrets` returns a secret our provider parses — an `ek_`-prefixed value,
`expires_at` honouring the pinned 10-second floor, and the model echoed back. Still unverified: the
browser SDP exchange against `/v1/realtime/calls`, which needs a real `RTCPeerConnection` that jsdom
does not provide, and the credit cost of a real session.

---

## New contract surface (summary)

New schema files in `packages/contracts/src/` — `reminders.ts`, `timers.ts`, `assistant.ts`,
`voice.ts` — and routes registered in `routes.ts`:

- Reminders: `getReminderSettings`, `updateReminderSettings`, `listReminderOccurrences`,
  `acknowledgeReminder`
- Timers: `listTimers`, `createTimer`, `updateTimer`, `deleteTimer`
- Voice: `getVoicePrefs`, `updateVoicePrefs`, `previewVoice`
- Assistant: `startAssistantSession`, `endAssistantSession`, `assistantAddDetectedItems`
  — **as built this reduced to a single `createRealtimeSession` (`POST /assistant/sessions`)**; see
  Phase B above for why there is no session row to end and no server-side add path.
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
