# Mobile live assistant — design

**Date:** 2026-08-28
**Status:** design approved, implementation in this slice
**Extends:** Feature 5 of `2026-08-26-kitchen-companion-design.md` (live camera + voice assistant),
which shipped **web-only**. This spec adds the **mobile** surface for the same feature.

## Why this exists, and why it is mock-first

Feature 5 was built entirely on web: the offline scripted assistant (Phase A), then the real OpenAI
Realtime WebRTC transport (Phase B), then per-user personas and camera frame sampling — all under
`apps/web`. Every one of those specs says the same sentence in its "out of scope": *"the assistant
has no mobile surface."* So on mobile the feature simply does not exist — there is no screen, no
port, no way to reach it.

This slice adds the mobile surface, and it ships the **scripted** assistant first, for the same
reason web did:

- **A real realtime transport on React Native needs a native WebRTC module.** The browser gives web
  `RTCPeerConnection`, `getUserMedia` and a `MediaStream` for free; React Native has none of them.
  A live session would require `react-native-webrtc` (or the vendor's native SDK), a config plugin,
  and an `expo prebuild` — none of which runs in Expo Go or in this repo's mobile test harness,
  which is **pure logic, no native render** (see `AGENTS`/copilot instructions, "Test topology").
- **Web proved the staging.** Web shipped the mock behind a `RealtimeAssistantClient` **port**, then
  dropped the real adapter in behind the same interface with no UI change. Mobile does exactly that:
  ship the mock now, behind a port, so the real RN adapter is a later, self-contained slice.

The honesty rule that made web's mock acceptable applies unchanged: because the client is scripted,
`isMock` is `true`, and the screen wears a **persistent demo badge**. A scripted answer over a real
camera must never read as real vision.

## Scope

**In:**

- A mobile realtime **port** (`RealtimeAssistantClient`) and a **Mock** adapter that replays the
  approved prototype session on timers — the mobile twins of the web files, minus the browser
  `MediaStream` the mock never used.
- A `LiveAssistantScreen`: consent-gated camera preview, a caption card, a labelled "Spotted
  (sample)" chip row, a speaking indicator, the demo badge, and mic / captions / add / end controls.
- A **confirm-before-write** step that reuses the existing capture ledger path — detections become a
  `RecognitionSession`, the proven `ReviewList` edits them, and `buildInventoryInputs(rows,
  'assistant')` → `bulkCreateInventory` writes them with permanent `assistant` provenance.
- Bilingual copy (`mobile.assistant.*` in `mobile.en.ts` / `mobile.ar.ts`) and a home entry point.

**Out:**

- **The real RN realtime transport.** Needs `react-native-webrtc` + prebuild; a follow-on slice
  behind the same port. Until then the mobile assistant is always a demo.
- **Camera frame sampling / vision.** The web adapter samples frames to a live model; the mock sends
  nothing, and there is no model on mobile yet. Lands with the real transport.
- **The persona picker.** A persona is applied when a **real** session is minted
  (`2026-08-28-voice-personalization-design.md`). Mobile mints no real session, so a mobile persona
  picker would configure something unreachable — deferred with the real transport, exactly as that
  spec argues.
- **Credits.** The mock contacts no provider and spends nothing.

## Design

### 1. The port drops `MediaStream`, nothing else

`apps/mobile/src/lib/assistant/realtime-port.ts` mirrors the web port —
`DetectedItem`, `TranscriptTurn`, `AssistantStatus`, `AssistantEvent`,
`RealtimeAssistantClient` — with one deliberate difference: `StartAssistantOptions` carries **no**
`stream`. The web type is `MediaStream | null`, a DOM type React Native does not have, and the mock
ignored it anyway. When the real RN adapter lands it will take whatever camera/track handle
`react-native-webrtc` exposes; putting a browser type in the shared port now would be a lie about
what mobile can produce.

Everything else is identical, including the reason `isMock` and the `speaking` event exist: the
speaking indicator is a transport fact, not a guess inferred from the transcript.

### 2. The mock is the web mock, behavior-for-behavior

`apps/mobile/src/lib/assistant/mock-realtime.ts` replays the same script — connect → live → user
line → detections → speaking-on → assistant line → speaking-off — on tracked timers. Two properties
are load-bearing and are the ones the tests pin:

- **`stop()` is the single stop point.** Cancelling the timers is the *only* thing that prevents a
  scripted beat firing after hang-up. There is deliberately no second guard inside the timer
  callback, so a regression in the clear is visible to a test that advances time past a cancelled
  beat.
- **The speaking beats bracket the assistant line** (on before the caption, off after), the shape of
  real speech — and `stop()` emits `speaking: false` if it interrupts mid-line, so a hang-up can
  never leave the indicator lit.

### 3. Confirm-before-write reuses the capture ledger path

Nothing the assistant "sees" is auto-written (spec §5.1). On confirm, detections are adapted into a
`RecognitionSession` and handed to the existing mobile `ReviewList`, whose confirm action is the sole
caller of `buildInventoryInputs`. The single change to shared capture code is **widening the
`source` parameter** of `buildInventoryInputs` and the `ReviewList` `source` prop from the
mobile-local `CaptureSource` (`'photo' | 'receipt'`) to the contract's `InventorySource`, which
already includes `'assistant'`. `CaptureSource` itself is untouched, so photo/receipt capture is
unaffected; the assistant simply passes a source those flows never pass.

The provenance matters: the ledger is append-only, so `source: 'assistant'` is permanent — an item
the assistant reported is not a photo nobody took. The detections→session adapter carries **both**
names and the category through, so an unresolved item is filed correctly in the globally shared
ingredient catalog rather than under "other" forever, the same invariant the photo and barcode paths
protect.

### 4. Honesty on screen

The demo badge is always shown (the mobile client is mock-only today). Detections are a labelled
"Spotted (sample)" chip row, **never** bounding boxes on the live feed, which would imply real
vision. The consent copy states the camera and microphone stay on the device — true, because the
mock sends nothing anywhere.

## Testing

The mobile harness is logic-only (no native render), so the screen is wired and covered by the
manual device gate, while the logic that decides what reaches the ledger is unit-tested.

| Claim                                                    | Named check                                                                                   |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| The scripted session plays connect → live → items → line | `mock-realtime.spec.ts` › "replays the scripted session in order"                             |
| The demo is honest about being a demo                    | `mock-realtime.spec.ts` › "is a demo, so the badge stays on"                                  |
| Speaking brackets the assistant line                     | `mock-realtime.spec.ts` › "brackets the assistant line with speaking on and off"             |
| A hang-up cancels pending scripted beats                 | `mock-realtime.spec.ts` › "fires no scripted beat after stop"                                 |
| A hang-up mid-line clears the speaking indicator         | `mock-realtime.spec.ts` › "turns speaking off when stopped mid-line"                          |
| A detection becomes an assistant-sourced input           | `detections.spec.ts` › "labels every added item as assistant-sourced"                        |
| An unresolved item keeps both names and its category     | `detections.spec.ts` › "carries both names and the category of every detection"              |
| An uncountable item falls back to a quantity of 1        | `detections.spec.ts` › "falls back to a quantity of one when the assistant cannot count"     |
| Nothing is written until the user confirms               | `detections.spec.ts` › "produces an empty session from no detections"                         |

`scripts/fault-inject-assistant.mjs` gains mobile cases: the mock's `stop()` clear removed (a stray
beat fires) and the detections adapter's `source` mislabelled — each must redden **the check that
names the behaviour**.

## Known limitations

1. **Mock only.** There is no live model on mobile until the `react-native-webrtc` transport slice.
   The badge says so.
2. **No vision.** The mock reports fixed sample items; it does not look at the camera. Real detection
   arrives with the real transport.
3. **No persona on mobile.** The persona applies at real-session mint, which mobile does not do yet.
4. **Camera rendering is unverified by this harness.** `CameraView` behaviour on iOS/Android is a
   manual device-gate check, like every other native surface in the mobile app.
