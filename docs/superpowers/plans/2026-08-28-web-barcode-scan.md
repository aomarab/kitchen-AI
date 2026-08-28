# Web Barcode Scanner Implementation Plan

**Goal:** Make the web app's "Barcode" capture method a real live scanner — point the camera at a packaged product, decode the barcode from the video feed, and look it up — replacing the typed-only numeric field. The typed field stays as a progressive-enhancement fallback.

**Architecture:** This is the last mocked/manual web capture method. The `lookupBarcode` route, its MSW handler, and `useLookupBarcode` already exist; mobile already scans live through `expo-camera`'s `CameraView.onBarcodeScanned`. The web barcode method was intentionally left as a typed field because "real barcode scanning on web needs a detector library and is its own piece of work" (`2026-07-27-web-camera-capture-design.md`, out-of-scope §383). This plan adds a dedicated `BarcodeCapture` component that reuses the camera primitive (`useCamera`, from PR #28) and decodes frames with the browser [`BarcodeDetector`](https://developer.mozilla.org/docs/Web/API/BarcodeDetector) API, then swaps it into `CaptureFlow` in place of the inner `BarcodeStep`. The lookup → `RecognizedItem` → `onItems` path is unchanged from the current `BarcodeStep`.

**Scope decision — progressive enhancement, no new dependency.** `BarcodeDetector` is a native browser API (Chromium/Android Chrome, not Safari/Firefox today), so no detector library is added. The scanner is **feature-detected**: when `BarcodeDetector` is unavailable, or the camera is unavailable, the component collapses to the typed field, and a denied camera additionally shows a short "camera blocked" hint above it (mirroring `PhotoCapture`) — the typed field is always the working path. The detector factory is injected as a prop (defaulting to a real `BarcodeDetector`) so the scan loop is testable in jsdom, which has neither a camera nor `BarcodeDetector` (mirroring how `encode` is injected into `PhotoCapture`/`ReceiptCapture`).

**Scope decision — one-shot lookup, typed field for retry.** Like mobile (`if (result || lookup.isPending) return`), the camera keeps decoding frames but only submits once: a lookup in flight (`pendingRef`) or any settled result (`haltRef`) ends submission. A found match calls `onItems` (which navigates to the review list and unmounts the scanner); a not-found scan shows the existing warning badge and halts the scanner, and the always-present typed field is the retry/correction path.

**Tech Stack:** Next.js (App Router) + React + TanStack Query, Vitest (jsdom) + MSW, `@kitchen/api-client`, `@kitchen/contracts`, `@kitchen/i18n`.

**Spec:** `docs/superpowers/specs/2026-07-27-web-camera-capture-design.md` (approved), out-of-scope §383 — the barcode scanner it names as the follow-up.

## Global Constraints

- **No new dependency:** use the native `BarcodeDetector`. Barcode formats mirror mobile's `BarcodeCapture` (`ean13/ean8/upc_e/code128/qr`) using the WHATWG format ids (`['ean_13','ean_8','upc_a','upc_e','code_128','qr_code']`), plus `upc_a` for the common US product code; every decode is still filtered to a numeric EAN/UPC by the regex below, so a QR payload only proceeds when it is itself a numeric barcode.
- **Camera:** reuse `useCamera` (`apps/web/src/hooks/camera.ts`) — never call `getUserMedia` directly. `state === 'ready'` gates the `<video>`; `denied`/`unavailable` degrade to the typed field, exactly like `PhotoCapture`.
- **Validation (authoritative):** `barcodeLookupQuerySchema` is `z.string().min(6).max(20).regex(/^\d+$/)`. Both the scan path and the typed path validate the raw value against `/^\d{6,20}$/` before calling `useLookupBarcode` — like mobile, a non-numeric or too-short value is rejected outright, never stripped/rewritten into a numeric substring.
- **Bilingual mapping:** the row built from a found lookup carries `productNameAr` into `nameAr` and the response `category` into `category` (fallback `'other'`), matching mobile's `buildBarcodeInput`; `ReviewList` maps these to `rawNameAr`/`rawCategory` on unresolved rows and shows `nameAr` in the `ar` locale.
- **Injectable detector:** `createScanner?: () => BarcodeScanner | null`, defaulting to a factory that returns a real `BarcodeDetector` when `globalThis.BarcodeDetector` exists and `null` otherwise. `null` ⇒ scanner unsupported ⇒ typed field only.
- **i18n parity:** `ar.ts` is typed against `en.ts`; a missing Arabic key is a build error. New web strings go in `web.en.ts` **and** `web.ar.ts`. No `{count}` interpolation adjacent to an Arabic noun.
- **RTL:** logical properties only — `ms/me`, `ps/pe`, `text-start`. No `ml-*`, `left-*`, `text-left`, `border-l-*`, `rounded-l-*` in string literals.
- **Design tokens:** `text-primary-text` for aubergine text (never `text-primary`); solid `*-soft` tokens, no opacity tints; no hex literals outside token files.
- **Formatting:** format only changed files — `npx prettier --config packages/config/prettier.config.mjs --write <paths>`. Never `pnpm format`.
- **Fault-injection discipline:** every named check gets a case in `scripts/fault-inject-assistant.mjs`; each injection must redden **the check that names the behaviour**. Run the harness **after** Prettier.
- **Commit trailer:** end every commit message with `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>`.
- **Branch:** all work lands on `feat/web-barcode-scan`, stacked on `feat/web-receipt-upload` (PR #29 — which supplies the edited `CaptureFlow`).

## File Structure

**New:**

- `apps/web/src/components/kitchen/BarcodeCapture.tsx` — live scanner + typed fallback.
- `apps/web/src/components/kitchen/BarcodeCapture.test.tsx` — jsdom + mocked `api.call` + injected scanner + stubbed camera.

**Modified:**

- `apps/web/src/components/kitchen/CaptureFlow.tsx` — remove the inner `BarcodeStep`; render `<BarcodeCapture onItems={setItems} />`; drop now-unused imports if any become unused.
- `packages/i18n/src/web.en.ts` / `web.ar.ts` — add `capture.scanCta`, `capture.scanHint`.
- `scripts/fault-inject-assistant.mjs` — barcode-path cases.

## Tasks

### Task 1 — i18n

- [ ] Add `capture.scanCta` ("Scan with camera") and `capture.scanHint` ("Point the camera at the barcode") to `web.en.ts` and `web.ar.ts`.

### Task 2 — BarcodeCapture component

- [ ] Create `BarcodeCapture.tsx`: props `{ onItems, createScanner? }`. Reuse `useCamera` + `useLookupBarcode`. Define a minimal `BarcodeScanner` port (`detect(source): Promise<{ rawValue }[]>`) and a default factory over `globalThis.BarcodeDetector`. When supported, a "Scan with camera" button calls `camera.start()`; on `state === 'ready'` render the `<video>` + scan hint and run a `setInterval` that calls `scanner.detect(video)`, picks the first `/^\d{6,20}$/` result, and runs the lookup once (dedupe via `lastCodeRef`, in-flight guard via `pendingRef`; ignore transient `detect` rejections). The typed `Field` + "Look up" button are always rendered. On a found lookup build the `RecognizedItem` (unchanged from `BarcodeStep`) and call `onItems([row])`; not-found shows the `capture.barcodeNotFound` badge; `lookup.isError` shows `ErrorState`. Clear the interval on unmount/`stop`.

### Task 3 — Wire CaptureFlow

- [ ] Import `BarcodeCapture`; delete the inner `BarcodeStep`; render `<BarcodeCapture onItems={setItems} />` in the barcode branch. Remove `useLookupBarcode` (and any other now-unused) imports from `CaptureFlow` if the deletion orphans them.

### Task 4 — Tests

- [ ] `BarcodeCapture.test.tsx`: typed path — found lookup calls `onItems` with a row carrying the looked-up match; not-found shows the badge and calls nothing. Scan path — an injected scanner returning a code drives `useLookupBarcode` with **that exact barcode** and then `onItems` (stub `navigator.mediaDevices.getUserMedia` + `HTMLMediaElement.srcObject` to reach `state === 'ready'`). A non-numeric decode is never looked up. When `createScanner` returns `null` the scan button is absent and only the typed field renders. Assert payload CONTENTS, not just length.

### Task 5 — Fault injection

- [ ] Add barcode cases to `scripts/fault-inject-assistant.mjs`: weaken the `/^\d{6,20}$/` scan guard (a non-numeric scan gets sent); drop the `found && match` guard (a not-found scan adds an item). Run `node scripts/fault-inject-assistant.mjs` and confirm each reddens its named check.

### Task 6 — Gate

- [ ] Rebuild changed consumed packages first (`@kitchen/i18n`), then `pnpm build`, `pnpm typecheck`, `pnpm lint`, web tests. Prettier changed files. Open a PR stacked on `feat/web-receipt-upload` (#29).
