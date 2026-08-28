# Plan — Mobile live assistant (Feature 5, mobile surface)

Implements `docs/superpowers/specs/2026-08-28-mobile-live-assistant-design.md`. Adds the mobile
surface for the live camera + voice assistant, shipping the **scripted** adapter first behind a port
(exactly as web staged Phase A), because a real React Native realtime transport needs a native
WebRTC module that cannot run in the mobile pure-logic harness or Expo Go.

## Files

### New — logic (unit-tested)

- `apps/mobile/src/lib/assistant/realtime-port.ts` — the port: `DetectedItem`, `TranscriptTurn`,
  `AssistantStatus`, `AssistantEvent`, `StartAssistantOptions` (**no `stream`**),
  `RealtimeAssistantClient`. Mirrors web minus the DOM `MediaStream`.
- `apps/mobile/src/lib/assistant/mock-realtime.ts` — `MockRealtimeAssistantClient` + exported
  `SAMPLE_DETECTIONS`. Scripted beats on tracked timers; `isMock = true`; `stop()` is the single
  stop point; speaking brackets the line and is cleared on a mid-line stop.
- `apps/mobile/src/lib/assistant/detections.ts` — `detectionsToSession(detections)` →
  `RecognitionSession` (adapts each `DetectedItem` into a `RecognizedItem` with `match.strategy =
  'created'`, carrying `nameEn`/`nameAr`/`category`, quantity falling back to `1`). This is the sole
  new mapping into the confirm path.

### New — tests

- `apps/mobile/src/lib/assistant/mock-realtime.spec.ts` — fake timers; the five named checks.
- `apps/mobile/src/lib/assistant/detections.spec.ts` — the four mapping checks.

### New — UI (wired, manual gate)

- `apps/mobile/src/features/assistant/LiveAssistantScreen.tsx` — `CameraGate` + `CameraView`
  preview, LIVE + demo badges, speaking indicator, caption card, "Spotted (sample)" chips, and
  mic / captions / add / end controls. Drives the mock via the port; confirm sheet reuses
  `ReviewList` with `source="assistant"`.
- `apps/mobile/src/app/assistant.tsx` — the expo-router route.

### Edited

- `apps/mobile/src/features/capture/ReviewList.tsx` — widen the `source` prop type from
  `CaptureSource` to the contract `InventorySource` (import from `@kitchen/contracts`). No behaviour
  change; `'photo' | 'receipt'` remain valid.
- `apps/mobile/src/lib/capture.ts` — widen `buildInventoryInputs`'s `source` param the same way.
- `packages/i18n/src/mobile.en.ts` + `mobile.ar.ts` — a `mobile.assistant` namespace (append-only,
  mobile-owned). `ar.ts` typed against `en.ts`, so a missing Arabic key fails the build.
- `apps/mobile/src/app/(tabs)/home.tsx` (or the home feature) — an entry point to `/assistant`.
- `scripts/fault-inject-assistant.mjs` — `MOBILE_MOCK` / `MOBILE_DETECT` constants + two cases.

## Verification

- `pnpm --filter @kitchen/i18n build` (Arabic completeness is a compile error).
- `pnpm --filter @kitchen/mobile exec vitest run src/lib/assistant/mock-realtime.spec.ts src/lib/assistant/detections.spec.ts`
- `pnpm --filter @kitchen/mobile typecheck` + `lint` + full `pnpm --filter @kitchen/mobile test`.
- `node scripts/fault-inject-assistant.mjs` clean (each mobile injection reddens its named check).
- Prettier on changed files only. PR off `main`, independent of the open capture/vision stack.

## Out of scope (named so they are choices, not omissions)

- Real `react-native-webrtc` transport, frame sampling/vision, mobile persona picker, credits — all
  land with the real-transport slice, per the spec.
- No API, contract route, or DB change. `bulkCreateInventory`, `RecognitionSession`, and
  `InventorySource` already exist.
