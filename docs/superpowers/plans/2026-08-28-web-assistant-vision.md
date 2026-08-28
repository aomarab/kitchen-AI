# Plan — Live assistant real vision (frame sampling), web

Derived from `docs/superpowers/specs/2026-08-26-kitchen-companion-design.md` **Feature 5** (live
camera + voice assistant) and the follow-ons named at the end of
`docs/superpowers/plans/2026-08-26-live-assistant-phaseA.md` ("frame sampling"). Phase A shipped the
offline scripted assistant; a later slice wired the real OpenAI Realtime transport
(`apps/web/src/lib/assistant/openai-realtime.ts`, spec Feature 5 Phase B). This slice closes the one
honest gap left in that transport: **the assistant is told it can see, but no camera frames ever
reach it.**

## The gap

The server grounds the session in the household pantry and defines a `report_items` vision tool, and
the instructions say *"You are a kitchen assistant who can see through the camera"*
(`apps/api/src/ai/assistant/openai-realtime.provider.ts`). But the web WebRTC adapter publishes
**audio only** — `openai-realtime.ts` deliberately does not add the camera track — so the model
receives nothing to see. `report_items` can only ever fire on an empty view.

## Decision — periodic stills over the data channel, not an RTP video track

The camera track stays **unpublished**. Instead the adapter samples the live `<video>` on a timer,
downscales each frame to a small JPEG, and sends it as a realtime `conversation.item.create` message
with `input_image` content over the existing `oai-events` data channel. This is the mechanism the
OpenAI Realtime API documents for image input.

Why stills, not a video track:

- **Cost is controllable.** A continuous RTP video feed bills every frame; a still every
  `FRAME_INTERVAL_MS` bills a bounded, tunable number of images. Vision cost is a first-class concern
  in this repo (`model-routing` spec).
- **"Never publishes the camera track" stays true.** The user's kitchen is not streamed live to the
  provider; only periodic downscaled snapshots go, over the same channel that already carries text.
- **No new RTP negotiation.** The SDP exchange is unchanged.

Frames are sent as **silent context** — no `response.create` follows them. The model accumulates what
it sees and uses it on the **next user-initiated turn** (server VAD drives responses). This is the
cost-aware, honest choice: the assistant answers "what do I have?" from the frames it has, rather
than narrating every frame and running up the meter. Nothing is auto-written to inventory — the
`report_items` → confirm → append-only ledger path is unchanged.

## Architecture

`apps/web/src/lib/assistant/openai-realtime.ts` — edited (only file with logic):

- New constants: `FRAME_INTERVAL_MS = 2500`, `FRAME_MAX_EDGE_PX = 512`, `FRAME_JPEG_QUALITY = 0.5`.
- `OpenAiRealtimeOptions` gains `captureFrame?: (stream: MediaStream) => Promise<string | null>` —
  returns a JPEG data URL, or `null` when a frame cannot be produced. Injected so jsdom tests need no
  canvas (identical rationale to `createPeerConnection`). The default is a stateful closure that
  reuses one hidden `<video>` + `<canvas>`, draws the stream downscaled to `FRAME_MAX_EDGE_PX`, and
  returns `canvas.toDataURL('image/jpeg', FRAME_JPEG_QUALITY)`; any failure (no dimensions yet, no
  2D context) returns `null`. It touches canvas/`play()`, so — like the capture pipeline's
  `encodeResized` — it is exercised by the manual hardware gate, not a unit test.
- Sampling **starts on the channel `open` event** (the earliest the channel can carry a message) and
  only when the stream has a video track. A `setInterval` calls `sendFrame()`.
- `sendFrame()` keeps its guards minimal and single-purpose so each is falsifiable: it bails if a
  capture is already in flight (`capturing`, the only thing serialising captures) or there is no
  stream, then `captureFrame(stream)`, and if that returned a data URL it does `channel?.send(...)`
  with `{ type: 'conversation.item.create', item: { type: 'message', role: 'user', content: [{ type:
  'input_image', image_url: url }] } }`. The send is optional-chained, so a `stop()` that closed the
  channel mid-capture drops the in-flight frame with no throw — that is what keeps the kitchen from
  reaching the provider after hang-up, not a duplicate `stopped` check that would make either
  redundant.
- `stop()` clears the frame timer — the one thing that ends sampling — and deliberately leaves
  `this.stream` in place (it is replaced on the next `start()`), so nothing else silently stops the
  loop and the cleared interval stays the single, testable stop point.

Nothing else changes: `realtime-port.ts` is unchanged (the mock ignores frames as before, and the
transport already receives the `stream`); `LiveAssistantView.tsx`'s `defaultClient()` uses the
default capturer with no edit; no API, contract, DB, or i18n change.

## Verification (every check falsifiable)

`apps/web/src/lib/assistant/openai-realtime.test.ts` — new cases (inject `captureFrame`, add `send`
capture + `readyState` to the fake data channel, use fake timers):

- **sends a downscaled frame as `conversation.item.create` / `input_image` once the channel is open
  and the interval elapses** — assert the parsed payload shape and that `image_url` is the injected
  data URL. Fault-inject by not starting the loop → nothing sent → reddens.
- **sends no frame before the channel opens** — advancing timers before `open` sends nothing.
- **stops sampling the camera after `stop()`** — highest-value: without the `clearInterval` the
  camera keeps being drawn after the user ended the session. Asserted via the `captureFrame` call
  count staying flat after `stop()` (the send guard alone can't catch this — a nulled channel
  swallows the send, so only the capture count moves). Fault-inject by dropping the `clearInterval`
  → the count climbs → reddens.
- **sends nothing to the provider after `stop()`** — the security guarantee: even if a tick fired,
  the closed channel means no `input_image` reaches the provider once the user hung up.
- **sends no frames on the mocked-deployment path** — `isMock` session hands off to the scripted
  adapter and never opens a real channel, so no `input_image` is ever sent.
- **sends nothing when the capturer yields `null`** — a `null` from `captureFrame` sends nothing
  (no empty/garbage image item).
- **never runs two captures at once when one is slow** — a deferred `captureFrame` promise proves
  the `capturing` in-flight guard holds later ticks back until the first settles.
- Existing 20 cases stay green (audio-only publish, transcripts, speaking, detections, teardown).

`scripts/fault-inject-assistant.mjs` — four new cases against `WEB`/`WEB_SPEC`: the sampling loop
never started on `open`; the `clearInterval` dropped from `stop()`; the `capturing` in-flight guard
removed; and the `if (!imageUrl)` null-skip removed. Each names the exact test that must redden.

Gate: `pnpm --filter @kitchen/web typecheck` + `lint` + full web suite; full
`node scripts/fault-inject-assistant.mjs` clean; prettier on changed files only. PR off `main`
(independent of the capture stack #28–#30).

## Out of scope

- **Proactive per-frame reporting.** Frames are context; the user's voice drives responses. Forcing
  a `response.create` per frame is a cost/UX decision for later.
- **Mobile.** No render harness; its own slice.
- **Frame cadence tuning / adaptive sampling** against measured provider cost.
