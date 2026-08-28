# Web camera capture

**Date:** 2026-07-27
**Status:** Approved; reconciled 2026-08-28 against the model-routing spec, ready for implementation
planning
**Scope:** `apps/web`, `packages/api-client`, `packages/i18n`

> **Reconciliation note (2026-08-28).** This spec was written before
> `2026-08-11-model-routing-design.md`, which is now authoritative on capture dimensions and added a
> server-side size backstop. The section **"Reconciliation (2026-08-28)"** below supersedes the
> specific resize and `contentType` details in the body — chiefly the `toBlob('image/jpeg', 0.6)` at
> 1920 px in "Camera states" and the "`contentType` comes from the blob" paragraph in "User flow".
> Both are annotated inline. Everything else in the body stands.

## Summary

Adding an item on the web app cannot use a camera. The "Photo" method looks
finished — it has an icon, a heading and an "Analyze" button — but
`CaptureFlow.tsx:161` sends two hardcoded strings:

```ts
recognize.mutate({ photoKeys: ['mock/fridge-1.jpg', 'mock/fridge-2.jpg'], locationHint: 'fridge' })
```

Its own translation key is `web.capture.simulateHint`, whose English value is
*"This demo uses sample photos."* — the app openly tells users the feature is
not real. Every user gets the same two imaginary photos of someone else's
fridge.

This spec makes that path real: open the camera, take a photo, upload it, and
recognise ingredients from it.

## Reconciliation (2026-08-28)

Three points below are superseded by `2026-08-11-model-routing-design.md`, which was written after
this spec and is authoritative on capture dimensions. They are consolidated here so the body can be
read with the corrections in hand.

### 1. Resize is mandatory, not a 1920 px / quality-0.6 nicety

Every photo — live-camera **and** file-picked — is re-encoded to a **1024 px longest edge at JPEG
quality 0.7** (`MAX_IMAGE_EDGE_PX = 1024`, `IMAGE_JPEG_QUALITY = 0.7`, the model-routing constants),
not the 1920 px / `toBlob(…, 0.6)` this spec's "Camera states" section describes.

This is now a correctness requirement, not a bandwidth optimisation. `presignUpload` enforces
`MAX_CAPTURE_UPLOAD_BYTES = 2 MB` for the `inventory_photo` purpose
(`apps/api/src/storage/storage.service.ts`) and rejects an oversized request with
`VALIDATION_FAILED`; vision is billed on **dimensions**, not bytes. An un-resized frame is therefore
both a hard upload failure and, if it slipped through, wasted spend. A 1024 px JPEG at 0.7 lands
well under 2 MB.

The fit maths lives in a new pure module `apps/web/src/lib/image.ts`, mirroring mobile's
`fitWithin` and the two constants. It is **duplicated, not imported from mobile** — mobile's
`lib/image.ts` states that capture is a per-app concern and "neither app should reach into the
other," and the resize itself is platform-native anyway (`expo-image-manipulator` on mobile, canvas
on web). A guard test asserts the web constants equal the mandated `1024` / `0.7`, so a future edit
that drifts from the authority reddens.

### 2. Orientation is baked into the pixels on the file path

A live-camera frame drawn from `<video>` to `<canvas>` is already upright. A photo **picked from
disk** — a phone JPEG or HEIC — carries its rotation in EXIF, and a naive canvas draw discards that
metadata and emits sideways pixels. A sideways shelf recognises worse than an upright one, so
orientation must be baked in: the encode reads the source with
`createImageBitmap(blob, { imageOrientation: 'from-image' })` before drawing to the 1024 px canvas.

### 3. One `image/jpeg` output; no `contentType`-from-blob branch

Because every photo is re-encoded through the canvas, the uploaded blob is **always `image/jpeg`**,
whatever the input was. This supersedes the "`contentType` comes from the blob, not a constant"
paragraph in "User flow": presign is always signed for `image/jpeg`, and the HEIC/PNG/WebP handling
that paragraph anticipates is dissolved rather than solved — a HEIC file becomes a JPEG the moment
it is drawn to the canvas.

Both paths converge on a single injectable `encodeResized(source) => Promise<Blob>` (the seam this
spec's "Testing" section already introduces for jsdom). jsdom cannot run canvas or
`createImageBitmap`, so component tests stub it and the pure `fitWithin` maths carries the unit
coverage; the real encode — and the "is a sideways file-pick upright?" question — is a required
**manual hardware gate** alongside the webcam gate this spec already names.

## What already exists

Most of this feature is built. The gap is narrower than it looks.

- **The API is complete.** A `vision/v1` prompt ("You identify food ingredients
  visible in kitchen photos"), a recognition service, and a `presignUpload`
  endpoint accepting JPEG/PNG/WebP/HEIC up to 15 MB.
- **Mobile is complete.** `PhotoCapture.tsx` runs a real `expo-camera` preview,
  uploads through presign → object storage, calls recognition and routes to a
  review screen.
- **Web's downstream is complete.** `ReviewList`, `bulkCreateInventory` and the
  success card all work; they are simply never reached with real data.
- **Web's entry points exist.** The dashboard quick-add tiles and the Kitchen
  header button already link to `/kitchen/capture?method=photo`.

So this spec adds no routes, no navigation and no API work. It replaces one
mocked component and shares one existing module.

## Decisions

**Web only.** Mobile already does this end to end.

**A live `getUserMedia` preview, with a file-picker fallback.** The web app is
used mainly on desktops and laptops, where `<input capture="environment">` is
ignored by the browser and degrades to a plain file picker — no camera at all.
A real preview is the only option that delivers the request on the target
device. The file input remains as a fallback for machines with no webcam, a
refused permission, or a photo already on disk.

**The user picks a location before shooting.** The vision prompt consumes it:
"The photos were taken in the {fridge}. Use that to inform categories." Today
web hardcodes `'fridge'` and mobile sends nothing. Four chips — fridge,
freezer, pantry, spice rack — with none preselected.

**`uploadPhotos` moves to `@kitchen/api-client` rather than being duplicated.**
It is already platform-agnostic behind a `PhotoUploader` interface; only
`size()` and `put()` are native. Its comment anticipates exactly this split.
Both apps already depend on `@kitchen/api-client`, so no new package wiring.

## Architecture

Five units, each with one responsibility.

> **Reconciliation (2026-08-28) adds a sixth:** the pure resize module
> `apps/web/src/lib/image.ts` (`fitWithin` + the `1024` / `0.7` constants). See "Reconciliation
> (2026-08-28)" §1. It has one responsibility — the fit maths — and no browser dependency, so it is
> unit-tested directly; the canvas encode that consumes it stays behind the injectable seam.

### `packages/api-client/src/upload.ts` — moved

`PhotoUploader`, `uploadPhotos()` and `PhotoUploadError`, relocated from
`apps/mobile/src/lib/upload.ts`. Depends only on `@kitchen/contracts`. Its
`upload.spec.ts` moves with it. Mobile re-exports from the old path so no
mobile call site changes — there are only three importers
(`PhotoCapture.tsx`, `photo-uploader.ts`, and the spec itself).

**`@kitchen/api-client` is a built package.** Its `exports` map exposes only
the root (`"."` → `./dist/index.js`), so the new module must be re-exported
from `src/index.ts`; a deep import like `@kitchen/api-client/upload` will not
resolve. It also must be **built before either app typechecks against it**, the
same trap `@kitchen/i18n` already has:

```bash
pnpm --filter @kitchen/api-client build
```

Its `package.json` already declares `"test": "vitest run --passWithNoTests"`,
so the moved spec is picked up with no new tooling — and that flag means a
silently-lost test file would still report green. The moved spec must be
confirmed to actually run, not merely to not fail.

**The move forces one signature change.** Mobile passes file URIs; web holds
`Blob`s. Round-tripping a blob through an object URL only to fetch it back
would be absurd, so the function becomes generic in its photo type:

```ts
export interface PhotoUploader<T> {
  size(photo: T): Promise<number | null>;
  put(photo: T, url: string, headers: Record<string, string>): Promise<number>;
}

export function uploadPhotos<T>(
  photos: T[],
  presign: (contentLength: number) => Promise<PresignUploadResponse>,
  uploader: PhotoUploader<T>,
): Promise<string[]>;
```

Mobile's call sites are unchanged — `T` infers as `string`.

### `apps/web/src/lib/photo-uploader.ts` — new

Web's `PhotoUploader<Blob>`: `size()` reads `blob.size`; `put()` issues
`fetch(url, { method: 'PUT', body, headers })` and returns the status. Roughly
fifteen lines, and the only new browser I/O in the feature. Mirrors
`expoPhotoUploader`, including its mock short-circuit.

### `apps/web/src/hooks/camera.ts` — new

`useCamera()` owns the `MediaStream` lifecycle: request, attach, capture a
frame, stop tracks on unmount. Returns a discriminated status:

```ts
type CameraState = 'idle' | 'requesting' | 'ready' | 'denied' | 'unavailable';
```

All permission reasoning lives here and nowhere else. This is the only module
that touches `navigator.mediaDevices`.

### `apps/web/src/components/kitchen/PhotoCapture.tsx` — new

The UI: location picker, live preview or fallback, thumbnail strip, submit.
Consumes `useCamera()` and `uploadPhotos()`; knows nothing about
`getUserMedia` or `fetch`.

### `apps/web/src/components/kitchen/CaptureFlow.tsx` — edited

The mocked `PhotoStep` is deleted and replaced with
`<PhotoCapture onItems={setItems} />`. Nothing downstream changes.

Two supporting additions: a `usePresignUpload` hook in `hooks/capture.ts`, and
a `presignUpload` MSW handler in `mocks/handlers.ts` — web has neither today.

## User flow

```
pick location → camera starts → take N photos
     ↓ submit
  for each blob, sequentially:
     presignUpload{ blob.type, blob.size, 'inventory_photo' } → { uploadUrl, key, headers }
     PUT bytes → uploadUrl
     collect key
     ↓
  recognizePhotos{ photoKeys, locationHint } → session
     ↓
  setItems(session.items) → existing ReviewList → bulkCreateInventory
```

**`contentType` comes from the blob, not a constant.** Camera captures are
always `image/jpeg`, but a file picked from disk may be PNG, WebP or HEIC — all
four are valid per `presignUploadRequestSchema`, and signing the wrong type
breaks the upload. The value is read from `blob.type` and validated against the
enum before presigning.

> **Superseded — see "Reconciliation (2026-08-28)" §3.** Because every photo is re-encoded through
> the canvas, the uploaded blob is **always `image/jpeg`**; presign is always signed for
> `image/jpeg` and there is no PNG/WebP/HEIC branch to sign.

**The file fallback needs no separate path.** `File extends Blob`, so a
`PhotoUploader<Blob>` serves both the canvas capture and the file input with
one implementation.

### Camera states

| State | UI |
|---|---|
| `idle` | Location picker only; camera not started |
| `requesting` | Spinner, "allow camera access" |
| `ready` | Live preview, shutter, "use a file instead" |
| `denied` | Explanation plus file input |
| `unavailable` | File input, no camera messaging |

**The camera is gated behind the location choice.** This is not only
sequencing: a permission prompt that fires on page load is distrusted by users
and penalised by browsers. Gating it means the prompt follows a deliberate
action.

The preview is `<video autoPlay muted playsInline>` — all three attributes are
required or iOS Safari refuses to play inline. The stream is requested as
`{ video: { facingMode: 'environment', width: { ideal: 1920 } } }`;
`facingMode` is a hint, so a laptop with only a front camera still resolves
rather than throwing. The shutter draws the current frame to a `<canvas>` and
encodes `toBlob('image/jpeg', 0.6)`, matching mobile's quality and keeping a
1920-wide frame near 200–400 KB against a 15 MB cap.

> **Superseded — see "Reconciliation (2026-08-28)" §1.** The canvas is sized to a **1024 px**
> longest edge and encoded at **quality 0.7**, not 1920 px / 0.6: the API now rejects an
> `inventory_photo` presign above 2 MB, and vision is billed on dimensions.

**The preview is not mirrored.** Selfie mirroring suits faces; here people hold
up packaging, and mirrored text is unreadable.

Shots accumulate in a thumbnail strip capped at **10**, because
`recognizeRequestSchema` rejects more. Each thumbnail is removable — mobile
lacks this, and it is a cheap win for a blurry shot.

## Error handling

Camera acquisition failures are branches, not errors:

| Cause | State |
|---|---|
| `NotAllowedError` (refused) | `denied` |
| `NotFoundError` / `OverconstrainedError` (no camera) | `unavailable` |
| `NotReadableError` (device busy) | `unavailable` |
| `navigator.mediaDevices` absent (insecure origin) | `unavailable` |

All four land on a working file input, so none dead-ends.

**`getUserMedia` requires a secure context.** `navigator.mediaDevices` is
`undefined` on plain HTTP, which is why the last row exists. `localhost` is
explicitly exempt from that rule, so development on
`http://localhost:3100` is unaffected — but any non-local deployment must be
served over HTTPS or the camera silently degrades to the file input for every
user.

**Recognition may legitimately return zero items.** The vision prompt instructs
the model to "never invent items you cannot see — return an empty array
instead", so an empty result is a correct outcome for a dark photo or a closed
cupboard, not a failure. It gets its own state — "nothing recognised", with
retake and add-manually actions — because falling through to an empty
`ReviewList` would be baffling. Neither app handles this today.

**Upload failures** reuse the existing typed `PhotoUploadError`: `unreadable`
(blob missing or zero bytes) and `rejected` (storage returned non-2xx).
Distinguishing them matters — one means retake, the other means retry.

**File-input validation happens before presigning.** The contract accepts
JPEG/PNG/WebP/HEIC up to 15 MB. Canvas output at quality 0.6 never approaches
that, but an iPhone HEIC or a camera raw picked from disk can. Checking
client-side turns a 400 into a sentence the user can act on.

**Recognition failure** surfaces through the existing `ErrorState` component.

### Two lifecycle details

**Object URLs are revoked** on thumbnail removal and on unmount, or every
retake leaks a blob.

**Double submit is guarded by an explicit `uploading` flag.** The PUT happens
*between* two mutations, so no mutation's `isPending` covers it. Mobile
documents the consequence: a second tap starts a second presign, upload and
recognition — duplicate AI spend and two racing navigations.

**Stream cleanup is explicit.** Tracks stop on unmount, which fires when
switching method tabs or advancing to review. Without it the webcam light stays
on after the user has moved on, which reads as spyware.

## Mock mode

Web dev runs `NEXT_PUBLIC_API_MOCK=true` (`lib/config.ts`, fails closed outside
production). Two gaps to close:

1. Web has no `presignUpload` MSW handler.
2. A PUT to a fake presigned URL has nothing listening, so the web uploader
   short-circuits to `200` under mocks — exactly as `expoPhotoUploader` does.

## Testing

Web's Vitest is jsdom, which shapes what is provable and forces one design
decision.

**jsdom cannot encode a canvas.** `HTMLCanvasElement.getContext()` returns
`null` without the native `canvas` package, so `toBlob` is unusable in tests.
Rather than add a native dependency or leave the encode untested, frame→blob
encoding sits behind a small injectable function. Component tests stub it; the
real one runs in the browser.

| Test | Proves |
|---|---|
| `useCamera` state mapping | Each `DOMException` maps to the right state |
| Stream cleanup | `track.stop()` runs on unmount |
| `upload.spec.ts` in its new home, unchanged | The move was faithful, not merely compiling |
| One non-string photo type | The generic actually generalises |
| Web `PhotoUploader` | PUT method, headers, body and status passthrough |
| `fitWithin` maths (`image.ts`) | 1024 px cap, aspect ratio preserved, never upscales |
| Constants-drift guard | Web `MAX_IMAGE_EDGE_PX` / `IMAGE_JPEG_QUALITY` equal the mandated `1024` / `0.7` |
| `PhotoCapture`: denied | File input appears |
| `PhotoCapture`: cap | The 10-photo limit holds |
| `PhotoCapture`: double submit | Exactly one presign |
| `PhotoCapture`: empty result | "Nothing recognised", not an empty review list |
| Web `coverage.spec.ts` (ported) | Every called route has an MSW handler |

Each named check gets a falsifiable case in `scripts/fault-inject-assistant.mjs`, per the standing
discipline — a claim is only as strong as the injection that reddens the check naming it.

The cleanup test is the highest-value one: a leaked stream is nearly invisible
manually — the webcam light stays on and nothing else looks wrong.

The ported mock-coverage test is the second: web has no such guard today, which
is exactly why adding `presignUpload` would otherwise 404 silently in dev.

**Only hardware can prove** that a real webcam opens, the preview is not
mirrored, and a captured JPEG recognises correctly against the live model. That
is a manual pass at the end.

## Internationalisation

Every new string needs `en` and `ar` keys in `packages/i18n`.
`web.capture.simulateHint` is deleted — it exists only to describe the mock.

Build order matters: after editing `packages/i18n/src/*.ts`, run
`pnpm --filter @kitchen/i18n build` or every downstream `t()` fails typecheck
with a key-union error.

The capture UI must use logical properties (`ms-`, `ps-`, `start-`) so it
mirrors correctly in Arabic. This is not aspirational: the web app currently
uses **zero** physical-direction utilities — no `ml-`, `pl-`, `left-`,
`text-left` anywhere — so introducing one would be the first.

## Out of scope

- **The barcode method**, still a typed text field rather than a live scanner.
  Real barcode scanning on web needs a detector library and is its own piece of
  work.
- **The receipt method**, still mocked (`['mock/receipt-1.jpg']`). It shares the
  upload path this spec builds, so it becomes a small follow-up rather than a
  rewrite — but it is not done here.
- **Mobile changes**, beyond re-exporting the moved module.
- **Any API or prompt change.**
