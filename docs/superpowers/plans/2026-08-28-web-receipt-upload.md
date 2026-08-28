# Web Receipt Upload Implementation Plan

**Goal:** Make the web app's "Receipt" capture method upload a real photograph of a receipt — pick or photograph one (or several) receipt pages, resize them, upload them to object storage, and enqueue the real parse job — replacing the single hardcoded `mock/receipt-1.jpg` key.

**Architecture:** This is the receipt-shaped sibling of the web photo upload (PR #28). The presign engine, the `parseReceipt` route, its BullMQ job, and both MSW handlers already exist; mobile already does this end-to-end through one unified `PhotoCapture`. The web receipt method was intentionally left mocked as "a small follow-up rather than a rewrite" (`2026-07-27-web-camera-capture-design.md`, out-of-scope §). This plan adds a dedicated `ReceiptCapture` component that reuses the photo-upload primitives (`encodeResized`, `uploadPhotos`, `webPhotoUploader`) with `purpose: 'receipt'`, then swaps it into `CaptureFlow` in place of the inner mocked `ReceiptStep`. `CaptureFlow`'s existing job-polling machinery (`useJob` → recognition session → items) is unchanged.

**Scope decision — file picker, not live video.** Unlike `PhotoCapture`, `ReceiptCapture` uses only the `<input type="file" accept="image/*" capture="environment" multiple>` path (which opens the camera on mobile browsers). A receipt is a single flat document, not a multi-angle scene, so the live `<video>` preview and the location prompt add no value and would duplicate the camera hook. This keeps the change a small follow-up.

**Tech Stack:** Next.js (App Router) + React + TanStack Query, Vitest (jsdom) + MSW, `@kitchen/api-client`, `@kitchen/contracts`, `@kitchen/i18n`.

**Spec:** `docs/superpowers/specs/2026-07-27-web-camera-capture-design.md` (approved), reconciled against `2026-08-11-model-routing-design.md` (vision cost is per image) and `2026-08-11-recipe-media-resolution-design.md` is unrelated.

## Global Constraints

- **Resize target:** reuse `encodeResized` from `apps/web/src/lib/image-encode.ts` (`MAX_IMAGE_EDGE_PX = 1024`, `IMAGE_JPEG_QUALITY = 0.7`). Injected as an `encode` prop for testability, defaulting to `encodeResized`.
- **Receipt cap (authoritative):** `parseReceiptRequestSchema.photoKeys` is `min(1).max(5)`. The thumbnail strip caps at **5** (`MAX_RECEIPT_PHOTOS = 5`), mirroring mobile's `limits.ts`.
- **Purpose:** every presign for a receipt page is signed with `purpose: 'receipt'`, never `'inventory_photo'`. Output type is always `image/jpeg` (re-encoded through canvas).
- **Upload-phase error handling:** mirror `PhotoCapture` — any upload-phase failure (unreadable blob, non-2xx PUT, or a rejected presign) shows the upload error and adds nothing; a post-upload failure is surfaced by the job's `failed` status via `CaptureFlow`.
- **i18n parity:** `ar.ts` is typed against `en.ts`; a missing Arabic key is a build error. New web strings go in `web.en.ts` **and** `web.ar.ts`. No `{count}` interpolation adjacent to an Arabic noun (numeral guard).
- **RTL:** logical properties only — `ms/me`, `ps/pe`, `text-start`. No `ml-*`, `left-*`, `text-left`, `border-l-*`, `rounded-l-*` in string literals.
- **Design tokens:** `text-primary-text` for aubergine text (never `text-primary`); solid `*-soft` tokens, no opacity tints; no hex literals outside token files.
- **Formatting:** format only changed files — `npx prettier --config packages/config/prettier.config.mjs --write <paths>`. Never `pnpm format`.
- **Fault-injection discipline:** every named check gets a case in `scripts/fault-inject-assistant.mjs`; each injection must redden **the check that names the behaviour**. Run the harness **after** Prettier.
- **Commit trailer:** end every commit message with `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>`.
- **Branch:** all work lands on `feat/web-receipt-upload`, stacked on `feat/web-photo-upload` (PR #28).

## File Structure

**New:**

- `apps/web/src/components/kitchen/ReceiptCapture.tsx` — file-picker receipt capture with real upload + parse.
- `apps/web/src/components/kitchen/ReceiptCapture.test.tsx` — jsdom + mocked `api.call`.

**Modified:**

- `apps/web/src/components/kitchen/CaptureFlow.tsx` — remove the inner mocked `ReceiptStep`; render `<ReceiptCapture>`.
- `packages/i18n/src/web.en.ts` / `web.ar.ts` — add `capture.receiptPick`, `capture.readReceipt`.
- `scripts/fault-inject-assistant.mjs` — receipt-path cases.

## Tasks

### Task 1 — i18n

- [ ] Add `capture.receiptPick` ("Photograph or upload the receipt") and `capture.readReceipt` ("Read receipt") to `web.en.ts` and `web.ar.ts`.

### Task 2 — ReceiptCapture component

- [ ] Create `ReceiptCapture.tsx`: props `{ job, onStart, pending, encode? }`. File input → `encode` per file → cap at `MAX_RECEIPT_PHOTOS = 5` thumbnail strip with remove. Submit → `uploadPhotos(blobs, contentLength => presign.mutateAsync({ contentType: 'image/jpeg', contentLength, purpose: 'receipt' }), webPhotoUploader)` → `parse.mutateAsync(keys)` → `onStart(job.id)`. `submittingRef` double-submit guard; `failed` upload-error state; unmount URL cleanup via ref. LoadingState (`capture.parsingReceipt`) while `pending || parse.isPending || uploading`; ErrorState on `job.status === 'failed'`.

### Task 3 — Wire CaptureFlow

- [ ] Import `ReceiptCapture`; delete the inner `ReceiptStep`; render `<ReceiptCapture job={jobQuery.data} onStart={setReceiptJobId} pending={…} />` in the receipt branch. Drop the now-unused `useParseReceipt` import from CaptureFlow.

### Task 4 — Tests

- [ ] `ReceiptCapture.test.tsx`: parse is sent the REAL presigned keys (not `mock/receipt-1.jpg`); presign uses `purpose: 'receipt'`; strip caps at 5; upload-failure shows the alert and never calls `onStart`; pipeline runs once on double-click; `onStart` receives the job id; encode called per file. Assert payload CONTENTS, not just length.

### Task 5 — Fault injection

- [ ] Add receipt cases to `scripts/fault-inject-assistant.mjs` (cap raised; sample key regression; wrong presign purpose). Run `node scripts/fault-inject-assistant.mjs` and confirm each reddens its named check.

### Task 6 — Gate

- [ ] `pnpm build`, `pnpm typecheck`, `pnpm lint`, web tests. Prettier changed files. Open a PR stacked on `feat/web-photo-upload` (#28).
