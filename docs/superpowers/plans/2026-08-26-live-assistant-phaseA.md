# Plan — Live camera + voice assistant, Phase A (web, offline)

Derived from `docs/superpowers/specs/2026-08-26-kitchen-companion-design.md` **Feature 5** (live
camera + voice assistant) and the approved prototype `06-live-assistant.html`. Camera conventions
follow `docs/superpowers/specs/2026-07-27-web-camera-capture-design.md` (camera states, error
mapping, secure-context, explicit stream cleanup). This is the first slice of Feature 5.

## Scope (this slice only)

A full-bleed **`/assistant`** route in the web app that delivers the *client* half of the live
assistant, **entirely offline**: real camera+mic **consent**, a real live preview with a persistent
**LIVE** indicator, a realtime **port** (`RealtimeAssistantClient`) driven by a **Mock** adapter
that plays the prototype-06 scripted session (transcript + sample detections), and a
**confirm-before-write** step that adds confirmed items to inventory through the **existing**
`bulkCreateInventory` ledger route.

The realtime transport is a client↔provider channel (spec §5); **offline there is no provider to
reach**, so this slice needs **no API work, no ephemeral token, no `assistant_sessions` table, and
no contract change**. Those land in Phase B when a real provider is wired.

## Honesty constraints (what this slice does NOT fabricate)

- The real realtime provider (OpenAI Realtime / Gemini Live — open question #1) is **not** built.
  The only assistant here is the **Mock**, and the UI wears a persistent **"DEMO · نموذج"** badge
  whenever the provider `isMock`, with copy stating it is a sample assistant, not live AI yet. This
  keeps scripted detections over a **real** camera feed from masquerading as real vision.
- Camera + mic are **real** (`getUserMedia`), gated behind an explicit consent action (never on
  load). In demo mode audio/video **stay on the device and are sent nowhere** — the consent copy
  says exactly that. The mute control toggles the real audio track's `enabled`, so it is truthful.
- Detections carry no invented inventory state. "Add to inventory" writes only what the user
  explicitly confirms, via the **existing** `bulkCreateInventory` route with `source: 'photo'`
  (the enum has no `assistant` value and this slice does **not** add one — camera vision is photo
  vision). Nothing is written without the confirm step (spec §5 "nothing written without explicit
  confirmation").
- No new contract surface, no new DB tables, no edits to `packages/contracts`, no mobile changes.

## Build steps

1. **i18n** — append a `web.assistant` namespace to `web.en.ts` + `web.ar.ts` (Arabic authored
   natively). Rebuild i18n (`pnpm --filter @kitchen/i18n build`) so `t()` keys typecheck.
2. **`lib/assistant/realtime-port.ts`** — the `RealtimeAssistantClient` port: `isMock`,
   `start({ locale, stream, onEvent })`, `stop()`, and the event/domain types (`AssistantEvent`,
   `TranscriptTurn`, `DetectedItem`). Shaped so a real WebRTC/Realtime adapter drops in unchanged.
3. **`lib/assistant/mock-realtime.ts`** — `MockRealtimeAssistantClient`: emits the prototype-06
   scripted session on timers (status→user turn→assistant caption→sample detections), locale-aware,
   fully torn down by `stop()`.
4. **`lib/useLiveMedia.ts`** — camera+mic stream hook per the camera spec: states
   `idle | requesting | ready | denied | unavailable`; `getUserMedia({ video: { facingMode:
   'environment' }, audio: true })`; DOMException→state mapping; **explicit `track.stop()` on stop
   and unmount** (webcam light must go out); audio-track mute toggle.
5. **`components/assistant/LiveAssistantView.tsx`** — consent gate → live preview (`<video autoPlay
   muted playsInline>`, not mirrored) with LIVE + DEMO badges, detections overlay, caption card and
   control bar (mic mute / add-to-inventory / captions / end). Confirm sheet → `useBulkCreateInventory`.
   Tokens only (no hex, no `text-primary` on text, no opacity tints) so guards stay green.
6. **Route** — `app/(screen)/assistant/page.tsx` reusing the existing `(screen)` layout (AuthGate,
   full-bleed, no AppShell).
7. **Entry** — a "Live assistant" card/link on the Settings view → `/assistant` (mirrors `/screen`).

## Verification (every check falsifiable, proven by fault injection)

- `lib/assistant/mock-realtime.test.ts` — the scripted session emits a user turn, an assistant
  caption and a detections event in order; `stop()` halts further events. Fault-inject by dropping
  the clear-timers guard → a late event fires after stop → assertion reddens.
- `lib/useLiveMedia.test.tsx` — success→`ready` with tracks; `NotAllowedError`→`denied`;
  **stop/unmount calls `track.stop()` on every track** (highest-value test — a leaked stream is
  invisible manually). Fault-inject by removing the cleanup loop → tracks not stopped → reddens.
- `components/assistant/LiveAssistantView.test.tsx` — consent gate shows first and no stream is
  requested until the user consents; "add to inventory" → confirm sheet → confirm →
  `bulkCreateInventory` called with the confirmed items; Arabic renders without throwing.
- `lib/token-usage.test.ts` + `app/palette.test.ts` — stay green unchanged.
- `pnpm --filter @kitchen/web lint` + `typecheck`; full web suite.
- Playwright MCP at `localhost:3100` `/assistant`: grant camera+mic → consent→live, LIVE + DEMO
  badges, caption + detections, add→confirm→inventory toast; Arabic → `dir=rtl` mirrored; 0 console
  errors. (If the MCP browser has no fake camera, verify the `denied`/`unavailable` fallback path
  honestly instead.)

## Follow-ons (explicitly out of scope here — Phase B+)

Real realtime provider behind `REALTIME_ASSISTANT_PORT` (OpenAI Realtime vs Gemini Live — decide on
latency/vision/cost/Arabic ASR), the `startAssistantSession`/`endAssistantSession` contract +
ephemeral-token minting (the standing key never reaches the client), the `assistant_sessions` table,
per-session/per-household **budget-guard** enforcement, Stage-A pantry-snapshot grounding, frame
sampling, and the mobile surface. Each is its own specced slice.
