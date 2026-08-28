# Web Photo Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the web app's "Photo" capture method upload a real photograph — open the camera (or pick a file), resize it, upload it to object storage, and recognise ingredients from it — replacing the two hardcoded `mock/fridge-*.jpg` keys.

**Architecture:** The API presign engine, the recognition route, and both MSW handlers already exist; mobile already does this end-to-end. This plan relocates the platform-agnostic upload orchestration from mobile into `@kitchen/api-client`, then builds the web-native halves (canvas resize, `getUserMedia` camera, a `Blob` uploader) on top of it. Every photo — camera or file — is re-encoded through a canvas to a 1024px-edge JPEG so it clears the server's 2 MB capture ceiling.

**Tech Stack:** Next.js (App Router) + React + TanStack Query + Zustand, Vitest (jsdom) + MSW, `@kitchen/api-client`, `@kitchen/contracts`, `@kitchen/i18n`.

**Spec:** `docs/superpowers/specs/2026-07-27-web-camera-capture-design.md` (approved; reconciled 2026-08-28 against `2026-08-11-model-routing-design.md`).

## Global Constraints

Every task's requirements implicitly include this section. Values copied verbatim from the specs.

- **Resize target (authoritative):** `MAX_IMAGE_EDGE_PX = 1024` (longest edge, aspect ratio preserved, never upscale), `IMAGE_JPEG_QUALITY = 0.7`. The web copy is **duplicated**, not imported from mobile.
- **Server backstop:** `presignUpload` rejects `inventory_photo` / `receipt` requests over `MAX_CAPTURE_UPLOAD_BYTES = 2 MB` with `VALIDATION_FAILED`. A 1024px JPEG at 0.7 lands well under this.
- **Output type:** every uploaded blob is `image/jpeg` (always re-encoded through canvas); presign is always signed for `image/jpeg`.
- **Recognition limits:** `recognizeRequestSchema.photoKeys` is `min(1).max(10)`; `locationHint` is `'fridge' | 'freezer' | 'pantry' | 'spice_rack'` (optional). The thumbnail strip caps at **10**.
- **Build order:** `@kitchen/api-client` and `@kitchen/i18n` are built packages consumed via their barrels; run `pnpm --filter @kitchen/api-client build` / `pnpm --filter @kitchen/i18n build` **before** either app typechecks or tests against a change to them. A deep import (`@kitchen/api-client/upload`) will not resolve — re-export from `src/index.ts`.
- **i18n parity:** `ar.ts` is typed against `en.ts`; a missing Arabic key is a build error. New web strings go in `web.en.ts` **and** `web.ar.ts`.
- **RTL:** logical properties only — `ms/me`, `ps/pe`, `start/end`, `text-start`. No `ml-*`, `pl-*`, `left-*`, `text-left`, `border-l-*`, `rounded-l-*` in string literals (`eslint.base.mjs` rejects them).
- **Formatting:** format only changed files — `npx prettier --config packages/config/prettier.config.mjs --write <paths>`. Never `pnpm format`.
- **Fault-injection discipline:** every named check gets a case in `scripts/fault-inject-assistant.mjs`; each injection must redden **the check that names the behaviour**. Run the harness **after** Prettier (it can reflow anchors).
- **Commit trailer:** end every commit message with `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>`.
- **Branch:** all work lands on `feat/web-photo-upload` (already checked out, off `main`).

---

## File Structure

**Relocated (mobile → shared):**
- `packages/api-client/src/upload.ts` — **new** (moved from `apps/mobile/src/lib/upload.ts`): `PhotoUploader<T>`, `uploadPhotos<T>`, `PhotoUploadError`, made generic in the photo type.
- `packages/api-client/src/upload.spec.ts` — **new** (moved from mobile), plus one non-string test.
- `packages/api-client/src/index.ts` — **modify**: re-export `./upload.js`.
- `apps/mobile/src/lib/upload.ts` — **modify**: becomes a re-export from `@kitchen/api-client` so mobile's three importers don't change.
- `apps/mobile/src/lib/upload.spec.ts` — **delete** (moved).
- `apps/mobile/src/lib/photo-uploader.ts` — **modify**: `PhotoUploader` → `PhotoUploader<string>`.

**New (web):**
- `apps/web/src/lib/image.ts` — pure `fitWithin` + the two constants.
- `apps/web/src/lib/image.spec.ts` — resize maths + constants-drift guard.
- `apps/web/src/lib/image-encode.ts` — the browser canvas/`createImageBitmap` encode (manual-gated, no unit test).
- `apps/web/src/lib/photo-uploader.ts` — `webPhotoUploader: PhotoUploader<Blob>`.
- `apps/web/src/lib/photo-uploader.spec.ts` — PUT passthrough + mock short-circuit.
- `apps/web/src/hooks/camera.ts` — `useCamera()`.
- `apps/web/src/hooks/camera.spec.ts` — state mapping + cleanup.
- `apps/web/src/components/kitchen/PhotoCapture.tsx` — the UI.
- `apps/web/src/components/kitchen/PhotoCapture.test.tsx` — component behaviour.

**Modified (web):**
- `apps/web/src/hooks/capture.ts` — add `usePresignUpload`.
- `apps/web/src/components/kitchen/CaptureFlow.tsx` — replace the mocked `PhotoStep` with `<PhotoCapture>`.
- `packages/i18n/src/web.en.ts` + `packages/i18n/src/web.ar.ts` — new capture strings; delete `simulateHint`.
- `scripts/fault-inject-assistant.mjs` — new falsifiable cases.

**Not needed (already exist):** the `presignUpload` and `recognizePhotos` MSW handlers (`apps/web/src/mocks/handlers.ts:449`, `:457`). This feature adds no new routes, so no `coverage.spec.ts` port is required — the two routes it calls are already mocked.

---

## Task 1: Relocate `uploadPhotos` into `@kitchen/api-client`, generic in the photo type

**Files:**
- Create: `packages/api-client/src/upload.ts`
- Create: `packages/api-client/src/upload.spec.ts`
- Modify: `packages/api-client/src/index.ts`
- Modify: `apps/mobile/src/lib/upload.ts` (→ re-export)
- Modify: `apps/mobile/src/lib/photo-uploader.ts:11` (`PhotoUploader` → `PhotoUploader<string>`)
- Delete: `apps/mobile/src/lib/upload.spec.ts`

**Interfaces:**
- Produces:
  - `interface PhotoUploader<T> { size(photo: T): Promise<number | null>; put(photo: T, url: string, headers: Record<string, string>): Promise<number>; }`
  - `class PhotoUploadError extends Error { readonly reason: 'unreadable' | 'rejected'; readonly detail: string; }`
  - `function uploadPhotos<T>(photos: T[], presign: (contentLength: number) => Promise<PresignUploadResponse>, uploader: PhotoUploader<T>): Promise<string[]>`

- [ ] **Step 1: Create the generic module**

Create `packages/api-client/src/upload.ts` (the mobile logic, unchanged except `<T>`):

```ts
import type { PresignUploadResponse } from '@kitchen/contracts';

/**
 * Platform-agnostic half of a photo upload. `T` is the photo handle — a file
 * URI on mobile (`string`), a `Blob` on web. The two native operations,
 * `size` and `put`, are injected so this orchestration stays unit-testable
 * without a native or browser runtime.
 */
export interface PhotoUploader<T> {
  /** Byte size of a photo. `null` when it is missing or unreadable. */
  size(photo: T): Promise<number | null>;
  /** PUTs the photo's bytes and resolves with the HTTP status. */
  put(photo: T, url: string, headers: Record<string, string>): Promise<number>;
}

/** A photo could not be read, or the storage PUT was rejected. */
export class PhotoUploadError extends Error {
  constructor(
    readonly reason: 'unreadable' | 'rejected',
    readonly detail: string,
  ) {
    super(`photo upload failed (${reason}): ${detail}`);
    this.name = 'PhotoUploadError';
  }
}

/**
 * Uploads each photo and returns the object keys to hand to recognition.
 *
 * A presigned key names an object that does not exist until its bytes are PUT
 * to the signed URL. Recognition run against un-uploaded keys sees nothing, so
 * a failure here stops the flow rather than passing empty keys downstream. The
 * real byte size is sent to the presigner because the API signs `ContentLength`
 * into the URL — a guessed size makes the signature reject the upload.
 */
export async function uploadPhotos<T>(
  photos: T[],
  presign: (contentLength: number) => Promise<PresignUploadResponse>,
  uploader: PhotoUploader<T>,
): Promise<string[]> {
  const keys: string[] = [];

  for (const photo of photos) {
    const size = await uploader.size(photo);
    if (size == null || size <= 0) throw new PhotoUploadError('unreadable', String(photo));

    const target = await presign(size);
    const status = await uploader.put(photo, target.uploadUrl, target.headers);
    if (status < 200 || status >= 300) {
      throw new PhotoUploadError('rejected', `${status} for ${target.key}`);
    }
    keys.push(target.key);
  }

  return keys;
}
```

- [ ] **Step 2: Move the spec and add a non-string test**

Create `packages/api-client/src/upload.spec.ts` — the mobile spec's cases plus one that proves the generic generalises:

```ts
import { describe, expect, it, vi } from 'vitest';
import { PhotoUploadError, uploadPhotos, type PhotoUploader } from './upload';

function presigner(sizes: number[] = []) {
  return vi.fn(async (contentLength: number) => {
    sizes.push(contentLength);
    return {
      uploadUrl: `https://s3.test/put/${sizes.length}`,
      key: `households/hh/inventory_photo/${sizes.length}.jpg`,
      headers: { 'Content-Type': 'image/jpeg', 'Content-Length': String(contentLength) },
      expiresIn: 300,
    };
  });
}

function uploader(overrides: Partial<PhotoUploader<string>> = {}): PhotoUploader<string> {
  return { size: async () => 1234, put: async () => 200, ...overrides };
}

describe('uploadPhotos', () => {
  it('PUTs every photo before returning its key', async () => {
    const put = vi.fn<PhotoUploader<string>['put']>(async () => 200);
    const keys = await uploadPhotos(['a.jpg', 'b.jpg'], presigner(), uploader({ put }));
    expect(put).toHaveBeenCalledTimes(2);
    expect(put.mock.calls.map((c) => c[0])).toEqual(['a.jpg', 'b.jpg']);
    expect(keys).toEqual([
      'households/hh/inventory_photo/1.jpg',
      'households/hh/inventory_photo/2.jpg',
    ]);
  });

  it('sends the real byte size to the presigner', async () => {
    const sizes: number[] = [];
    await uploadPhotos(['a.jpg'], presigner(sizes), uploader({ size: async () => 4096 }));
    expect(sizes).toEqual([4096]);
  });

  it('throws unreadable when a photo has no size', async () => {
    await expect(
      uploadPhotos(['a.jpg'], presigner(), uploader({ size: async () => null })),
    ).rejects.toMatchObject({ reason: 'unreadable' });
  });

  it('stops and throws rejected when a PUT fails', async () => {
    const put = vi.fn<PhotoUploader<string>['put']>(async () => 403);
    await expect(uploadPhotos(['a.jpg', 'b.jpg'], presigner(), uploader({ put }))).rejects.toBeInstanceOf(
      PhotoUploadError,
    );
    expect(put).toHaveBeenCalledTimes(1);
  });

  it('generalises beyond string photos', async () => {
    const put = vi.fn(async () => 200);
    const keys = await uploadPhotos<{ id: number }>(
      [{ id: 7 }],
      presigner(),
      { size: async () => 10, put },
    );
    expect(put.mock.calls[0]![0]).toEqual({ id: 7 });
    expect(keys).toHaveLength(1);
  });
});
```

- [ ] **Step 3: Re-export from the api-client barrel**

In `packages/api-client/src/index.ts`, after the existing `export * from './errors.js';` line, add:

```ts
export * from './upload.js';
```

- [ ] **Step 4: Turn mobile's module into a re-export and fix the uploader type**

Replace the entire contents of `apps/mobile/src/lib/upload.ts` with:

```ts
export { PhotoUploadError, uploadPhotos, type PhotoUploader } from '@kitchen/api-client';
```

In `apps/mobile/src/lib/photo-uploader.ts`, change the declaration (line 11):

```ts
export const expoPhotoUploader: PhotoUploader<string> = {
```

Then delete `apps/mobile/src/lib/upload.spec.ts` (it now lives in api-client):

```bash
git rm apps/mobile/src/lib/upload.spec.ts
```

- [ ] **Step 5: Build the package and run the moved spec (confirm it actually runs)**

```bash
pnpm --filter @kitchen/api-client build
pnpm --filter @kitchen/api-client exec vitest run src/upload.spec.ts
```

Expected: 5 tests **run** and PASS (not "no tests found" — the package's `test` script uses `--passWithNoTests`, so a silently-lost file would look green).

- [ ] **Step 6: Confirm mobile still typechecks against the re-export**

```bash
pnpm --filter @kitchen/mobile typecheck
```

Expected: PASS. (`PhotoCapture.tsx`, `photo-uploader.ts` resolve `uploadPhotos`/`PhotoUploader` through the re-export; `uploadPhotos(photos, …)` infers `T = string`.)

- [ ] **Step 7: Format and commit**

```bash
npx prettier --config packages/config/prettier.config.mjs --write \
  packages/api-client/src/upload.ts packages/api-client/src/upload.spec.ts \
  packages/api-client/src/index.ts apps/mobile/src/lib/upload.ts apps/mobile/src/lib/photo-uploader.ts
git add -A packages/api-client apps/mobile/src/lib
git commit -m "refactor(api-client): relocate uploadPhotos from mobile, make it generic

Web holds Blobs where mobile holds file URIs, so uploadPhotos becomes generic
in the photo type. Mobile re-exports from the old path; its three importers are
unchanged. The spec moves with the code and gains a non-string case proving the
generic generalises.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 2: Web resize maths — `fitWithin` + constants + drift guard

**Files:**
- Create: `apps/web/src/lib/image.ts`
- Test: `apps/web/src/lib/image.spec.ts`

**Interfaces:**
- Produces:
  - `const MAX_IMAGE_EDGE_PX = 1024`
  - `const IMAGE_JPEG_QUALITY = 0.7`
  - `function fitWithin(width: number, height: number, maxEdge?: number): { width: number; height: number }`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/image.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { IMAGE_JPEG_QUALITY, MAX_IMAGE_EDGE_PX, fitWithin } from './image';

describe('fitWithin', () => {
  it('caps the longest edge at 1024', () => {
    expect(fitWithin(4000, 2000)).toEqual({ width: 1024, height: 512 });
    expect(fitWithin(2000, 4000)).toEqual({ width: 512, height: 1024 });
  });

  it('preserves aspect ratio', () => {
    const { width, height } = fitWithin(3000, 2000);
    expect(width / height).toBeCloseTo(1.5, 5);
  });

  it('never upscales a small image', () => {
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
  });
});

describe('capture constants', () => {
  it('uses the resize target the model-routing spec mandates', () => {
    expect(MAX_IMAGE_EDGE_PX).toBe(1024);
    expect(IMAGE_JPEG_QUALITY).toBe(0.7);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
pnpm --filter @kitchen/web exec vitest run src/lib/image.spec.ts
```

Expected: FAIL — cannot resolve `./image`.

- [ ] **Step 3: Write the module**

Create `apps/web/src/lib/image.ts`:

```ts
/**
 * Vision models are billed on image dimensions, not file size, and the API
 * rejects a capture-purpose presign over 2 MB. A 1024px long edge recognises
 * jars and packets on a shelf and lands well under both limits.
 *
 * Duplicated from `apps/mobile/src/lib/image.ts` on purpose: capture is a
 * per-app concern (canvas here, expo-image-manipulator there) and neither app
 * reaches into the other. `image.spec.ts` guards these values against the
 * model-routing spec so the copies cannot drift.
 */
export const MAX_IMAGE_EDGE_PX = 1024;
export const IMAGE_JPEG_QUALITY = 0.7;

/** Fit within a square of `maxEdge`, preserving aspect ratio. Never upscales. */
export function fitWithin(
  width: number,
  height: number,
  maxEdge: number = MAX_IMAGE_EDGE_PX,
): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width, height };
  const scale = maxEdge / longest;
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}
```

- [ ] **Step 4: Run it to verify it passes**

```bash
pnpm --filter @kitchen/web exec vitest run src/lib/image.spec.ts
```

Expected: PASS (4 tests).

- [ ] **Step 5: Format and commit**

```bash
npx prettier --config packages/config/prettier.config.mjs --write apps/web/src/lib/image.ts apps/web/src/lib/image.spec.ts
git add apps/web/src/lib/image.ts apps/web/src/lib/image.spec.ts
git commit -m "feat(web): pure resize maths for capture, guarded against the resize target

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 3: Web uploader — `webPhotoUploader: PhotoUploader<Blob>`

**Files:**
- Create: `apps/web/src/lib/photo-uploader.ts`
- Test: `apps/web/src/lib/photo-uploader.spec.ts`

**Interfaces:**
- Consumes: `PhotoUploader<T>` (Task 1), `MOCKING_ENABLED` (`apps/web/src/lib/config.ts`).
- Produces: `const webPhotoUploader: PhotoUploader<Blob>`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/photo-uploader.spec.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => vi.restoreAllMocks());

describe('webPhotoUploader', () => {
  it('PUTs the blob with its headers and returns the status', async () => {
    vi.doMock('./config', () => ({ MOCKING_ENABLED: false }));
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 200 }));
    const { webPhotoUploader } = await import('./photo-uploader');

    const blob = new Blob(['x'], { type: 'image/jpeg' });
    const status = await webPhotoUploader.put(blob, 'https://s3.test/put', { 'x-h': '1' });

    expect(status).toBe(200);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe('https://s3.test/put');
    expect(init).toMatchObject({ method: 'PUT', headers: { 'x-h': '1' } });
    expect(init!.body).toBe(blob);
    vi.doUnmock('./config');
  });

  it('short-circuits to 200 under mocks without fetching', async () => {
    vi.doMock('./config', () => ({ MOCKING_ENABLED: true }));
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const { webPhotoUploader } = await import('./photo-uploader');

    const status = await webPhotoUploader.put(new Blob(['x']), 'https://s3.test/put', {});

    expect(status).toBe(200);
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.doUnmock('./config');
  });

  it('reports null for an empty blob', async () => {
    const { webPhotoUploader } = await import('./photo-uploader');
    expect(await webPhotoUploader.size(new Blob([]))).toBeNull();
    expect(await webPhotoUploader.size(new Blob(['abc']))).toBe(3);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
pnpm --filter @kitchen/web exec vitest run src/lib/photo-uploader.spec.ts
```

Expected: FAIL — cannot resolve `./photo-uploader`.

- [ ] **Step 3: Write the module**

Create `apps/web/src/lib/photo-uploader.ts`:

```ts
import type { PhotoUploader } from '@kitchen/api-client';
import { MOCKING_ENABLED } from './config';

/**
 * The browser half of a photo upload: `size` reads the blob, `put` PUTs its
 * bytes straight to the presigned URL. `File extends Blob`, so the same
 * implementation serves both a canvas capture and a file picked from disk.
 */
export const webPhotoUploader: PhotoUploader<Blob> = {
  async size(blob) {
    return blob.size > 0 ? blob.size : null;
  },

  async put(blob, url, headers) {
    // Under mocks a presigned URL points at nothing, exactly as on mobile.
    // Report success rather than fail the flow the mock exists to exercise.
    if (MOCKING_ENABLED) return 200;
    const response = await fetch(url, { method: 'PUT', body: blob, headers });
    return response.status;
  },
};
```

- [ ] **Step 4: Run it to verify it passes**

```bash
pnpm --filter @kitchen/web exec vitest run src/lib/photo-uploader.spec.ts
```

Expected: PASS (3 tests).

- [ ] **Step 5: Format and commit**

```bash
npx prettier --config packages/config/prettier.config.mjs --write apps/web/src/lib/photo-uploader.ts apps/web/src/lib/photo-uploader.spec.ts
git add apps/web/src/lib/photo-uploader.ts apps/web/src/lib/photo-uploader.spec.ts
git commit -m "feat(web): Blob PhotoUploader that PUTs to the presigned URL

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 4: `useCamera` hook — the `MediaStream` lifecycle

**Files:**
- Create: `apps/web/src/hooks/camera.ts`
- Test: `apps/web/src/hooks/camera.spec.ts`

**Interfaces:**
- Produces:
  - `type CameraState = 'idle' | 'requesting' | 'ready' | 'denied' | 'unavailable'`
  - `function useCamera(): { state: CameraState; videoRef: RefObject<HTMLVideoElement | null>; start: () => Promise<void>; stop: () => void }`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/hooks/camera.spec.ts`:

```ts
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useCamera } from './camera';

function stubMediaDevices(getUserMedia: () => Promise<MediaStream>) {
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: vi.fn(getUserMedia) },
  });
}

afterEach(() => {
  // @ts-expect-error - remove the stub between tests
  delete navigator.mediaDevices;
});

function trackedStream(track: { stop: () => void }): MediaStream {
  return { getTracks: () => [track] } as unknown as MediaStream;
}

describe('useCamera', () => {
  it('maps a refused permission to denied', async () => {
    stubMediaDevices(() => Promise.reject(new DOMException('no', 'NotAllowedError')));
    const { result } = renderHook(() => useCamera());
    await act(async () => {
      await result.current.start();
    });
    expect(result.current.state).toBe('denied');
  });

  it('maps a missing camera to unavailable', async () => {
    stubMediaDevices(() => Promise.reject(new DOMException('no', 'NotFoundError')));
    const { result } = renderHook(() => useCamera());
    await act(async () => {
      await result.current.start();
    });
    expect(result.current.state).toBe('unavailable');
  });

  it('reports unavailable when mediaDevices is absent', async () => {
    const { result } = renderHook(() => useCamera());
    await act(async () => {
      await result.current.start();
    });
    expect(result.current.state).toBe('unavailable');
  });

  it('stops every track on stop', async () => {
    const stop = vi.fn();
    stubMediaDevices(() => Promise.resolve(trackedStream({ stop })));
    const { result } = renderHook(() => useCamera());
    await act(async () => {
      await result.current.start();
    });
    expect(result.current.state).toBe('ready');
    act(() => result.current.stop());
    expect(stop).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
pnpm --filter @kitchen/web exec vitest run src/hooks/camera.spec.ts
```

Expected: FAIL — cannot resolve `./camera`.

- [ ] **Step 3: Write the hook**

Create `apps/web/src/hooks/camera.ts`:

```ts
import { useCallback, useEffect, useRef, useState } from 'react';

export type CameraState = 'idle' | 'requesting' | 'ready' | 'denied' | 'unavailable';

/**
 * Owns the camera `MediaStream` and nothing else — all permission reasoning
 * lives here. `getUserMedia` requires a secure context, so `navigator.
 * mediaDevices` is undefined on plain HTTP (localhost is exempt); that absence
 * maps to `unavailable`, which lands on the file-input fallback like every
 * other acquisition failure.
 */
export function useCamera(): {
  state: CameraState;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  start: () => Promise<void>;
  stop: () => void;
} {
  const [state, setState] = useState<CameraState>('idle');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const start = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setState('unavailable');
      return;
    }
    setState('requesting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 } },
      });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setState('ready');
    } catch (error) {
      // Refusal is distinct from absence: one offers a retry, the other only a
      // file input. NotReadable (device busy) and Overconstrained both mean the
      // camera cannot serve us, so they degrade to the fallback too.
      const name = error instanceof DOMException ? error.name : '';
      setState(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'unavailable');
    }
  }, []);

  // A leaked stream is nearly invisible — the webcam light stays on after the
  // user has moved to another tab or the review screen. Stop on unmount.
  useEffect(() => stop, [stop]);

  return { state, videoRef, start, stop };
}
```

- [ ] **Step 4: Run it to verify it passes**

```bash
pnpm --filter @kitchen/web exec vitest run src/hooks/camera.spec.ts
```

Expected: PASS (4 tests).

- [ ] **Step 5: Format and commit**

```bash
npx prettier --config packages/config/prettier.config.mjs --write apps/web/src/hooks/camera.ts apps/web/src/hooks/camera.spec.ts
git add apps/web/src/hooks/camera.ts apps/web/src/hooks/camera.spec.ts
git commit -m "feat(web): useCamera owns the MediaStream lifecycle and permission states

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 5: i18n strings for the real capture UI

**Files:**
- Modify: `packages/i18n/src/web.en.ts` (the `capture:` block, ~line 106)
- Modify: `packages/i18n/src/web.ar.ts` (matching block)

**Interfaces:**
- Produces the message keys consumed by Task 6/7: `web.capture.locationPrompt`, `web.capture.location.{fridge,freezer,pantry,spiceRack}`, `web.capture.startCamera`, `web.capture.requesting`, `web.capture.shutter`, `web.capture.useFile`, `web.capture.denied`, `web.capture.retake`, `web.capture.photoCount`, `web.capture.uploadFailed`, `web.capture.nothingRecognised`, `web.capture.addManually`. Removes `web.capture.simulateHint`.

- [ ] **Step 1: Add the English strings**

In `packages/i18n/src/web.en.ts`, inside the `capture: { … }` block: delete the `simulateHint` line and add:

```ts
      locationPrompt: 'Where are you photographing?',
      location: {
        fridge: 'Fridge',
        freezer: 'Freezer',
        pantry: 'Pantry',
        spiceRack: 'Spice rack',
      },
      startCamera: 'Start camera',
      requesting: 'Allow camera access to continue…',
      shutter: 'Take photo',
      useFile: 'Use a file instead',
      denied: 'Camera access was blocked. Choose a photo from your device instead.',
      retake: 'Retake',
      photoCount: plural('count', {
        one: '{count} photo — up to 10',
        other: '{count} photos — up to 10',
      }),
      uploadFailed: "Those photos couldn't be uploaded. Check your connection and try again.",
      nothingRecognised: "We couldn't identify anything. Retake the photo or add items by hand.",
      addManually: 'Add manually',
```

(`plural` is already imported in this file — it is used by `addedToast` just below.)

- [ ] **Step 2: Add the Arabic strings**

In `packages/i18n/src/web.ar.ts`, delete its `simulateHint` line and add the same keys with Arabic values:

```ts
      locationPrompt: 'أين تلتقط الصورة؟',
      location: {
        fridge: 'الثلاجة',
        freezer: 'الفريزر',
        pantry: 'المؤن',
        spiceRack: 'رف البهارات',
      },
      startCamera: 'تشغيل الكاميرا',
      requesting: 'اسمح بالوصول إلى الكاميرا للمتابعة…',
      shutter: 'التقط صورة',
      useFile: 'استخدم ملفًا بدلاً من ذلك',
      denied: 'تم حظر الوصول إلى الكاميرا. اختر صورة من جهازك بدلاً من ذلك.',
      retake: 'إعادة الالتقاط',
      photoCount: plural('count', {
        zero: '{count} صورة — حتى ١٠',
        one: 'صورة واحدة — حتى ١٠',
        two: 'صورتان — حتى ١٠',
        few: '{count} صور — حتى ١٠',
        many: '{count} صورة — حتى ١٠',
        other: '{count} صورة — حتى ١٠',
      }),
      uploadFailed: 'تعذّر رفع هذه الصور. تحقق من اتصالك وحاول مرة أخرى.',
      nothingRecognised: 'لم نتمكن من التعرف على أي شيء. أعد التقاط الصورة أو أضف العناصر يدويًا.',
      addManually: 'الإضافة يدويًا',
```

- [ ] **Step 3: Build i18n and confirm parity holds**

```bash
pnpm --filter @kitchen/i18n build
```

Expected: PASS. A missing Arabic key (or a leftover `simulateHint` use) is a build error.

- [ ] **Step 4: Format and commit**

```bash
npx prettier --config packages/config/prettier.config.mjs --write packages/i18n/src/web.en.ts packages/i18n/src/web.ar.ts
git add packages/i18n/src/web.en.ts packages/i18n/src/web.ar.ts
git commit -m "i18n(web): capture strings for the real camera flow; drop the demo hint

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 6: `PhotoCapture` component — the UI, upload, and recognition

**Files:**
- Create: `apps/web/src/lib/image-encode.ts`
- Create: `apps/web/src/components/kitchen/PhotoCapture.tsx`
- Test: `apps/web/src/components/kitchen/PhotoCapture.test.tsx`
- Modify: `apps/web/src/hooks/capture.ts` (add `usePresignUpload`)

**Interfaces:**
- Consumes: `uploadPhotos`, `PhotoUploadError` (Task 1); `webPhotoUploader` (Task 3); `useCamera` (Task 4); `fitWithin`, `IMAGE_JPEG_QUALITY` (Task 2); `useRecognize` (`hooks/capture.ts`); `ReviewList`-bound `RecognizedItem`.
- Produces:
  - `type EncodeSource = HTMLVideoElement | Blob`
  - `function encodeResized(source: EncodeSource): Promise<Blob>` (`image-encode.ts`)
  - `function usePresignUpload()` (`hooks/capture.ts`)
  - `function PhotoCapture({ onItems, encode? }: { onItems: (items: RecognizedItem[]) => void; encode?: (source: EncodeSource) => Promise<Blob> })`

- [ ] **Step 1: Add the presign hook**

In `apps/web/src/hooks/capture.ts`, add `PresignUploadRequest` to the existing `@kitchen/contracts` type-import block (which already imports `BulkCreateInventoryRequest`, `RecognizeRequest`) and add the hook, mirroring the existing `useRecognize` shape:

```ts
import type {
  BulkCreateInventoryRequest,
  PresignUploadRequest,
  RecognizeRequest,
} from '@kitchen/contracts';

// …after useRecognize…

export function usePresignUpload() {
  return useMutation({
    mutationFn: (body: PresignUploadRequest) => api.call('presignUpload', { body }),
  });
}
```

(`RouteBody` is imported into api-client's `index.ts` but not re-exported, so use the named `PresignUploadRequest` type — the same convention `useRecognize` uses with `RecognizeRequest`.)

- [ ] **Step 2: Write the browser encode (manual-gated, no unit test)**

Create `apps/web/src/lib/image-encode.ts`:

```ts
import { IMAGE_JPEG_QUALITY, fitWithin } from './image';

export type EncodeSource = HTMLVideoElement | Blob;

/**
 * Re-encode a captured frame or a picked file to a 1024px-edge JPEG.
 *
 * A `<video>` frame is already upright. A file picked from disk carries its
 * rotation in EXIF, and a naive canvas draw would emit sideways pixels, so it
 * is read with `imageOrientation: 'from-image'`, baking rotation into the
 * bitmap first. Both paths converge on one canvas encode, so the output is
 * always `image/jpeg`.
 *
 * This touches canvas and `createImageBitmap`, neither of which jsdom
 * implements, so it is exercised by the manual hardware gate, not a unit test —
 * the component injects a stub. The pure `fitWithin` maths it depends on is
 * unit-tested in `image.spec.ts`.
 */
export async function encodeResized(source: EncodeSource): Promise<Blob> {
  let width: number;
  let height: number;
  let draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void;

  if (source instanceof Blob) {
    const bitmap = await createImageBitmap(source, { imageOrientation: 'from-image' });
    width = bitmap.width;
    height = bitmap.height;
    draw = (ctx, w, h) => ctx.drawImage(bitmap, 0, 0, w, h);
  } else {
    width = source.videoWidth;
    height = source.videoHeight;
    draw = (ctx, w, h) => ctx.drawImage(source, 0, 0, w, h);
  }

  const fit = fitWithin(width, height);
  const canvas = document.createElement('canvas');
  canvas.width = fit.width;
  canvas.height = fit.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d context unavailable');
  draw(ctx, fit.width, fit.height);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', IMAGE_JPEG_QUALITY),
  );
  if (!blob) throw new Error('canvas encode produced no blob');
  return blob;
}
```

- [ ] **Step 3: Write the failing component test**

Create `apps/web/src/components/kitchen/PhotoCapture.test.tsx`:

```tsx
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EncodeSource } from '../../lib/image-encode';
import { PhotoCapture } from './PhotoCapture';

// jsdom implements neither of these; the component only needs them not to throw.
beforeEach(() => {
  let n = 0;
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: vi.fn(() => `blob:mock/${n++}`),
    revokeObjectURL: vi.fn(),
  });
});
afterEach(() => vi.unstubAllGlobals());

const jpeg = () => new Blob(['x'], { type: 'image/jpeg' });
const encodeStub = vi.fn(async (_source: EncodeSource) => jpeg());

function renderCapture(onItems = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <PhotoCapture onItems={onItems} encode={encodeStub} />
    </QueryClientProvider>,
  );
  return { onItems };
}

/** Pick `count` files, which the component encodes and adds to the strip. */
async function pickFiles(count: number) {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  const files = Array.from({ length: count }, (_, i) => new File(['x'], `p${i}.jpg`, { type: 'image/jpeg' }));
  await userEvent.upload(input, files);
}

describe('PhotoCapture', () => {
  it('shows a file input when the camera is denied or unavailable', async () => {
    // jsdom has no navigator.mediaDevices, so useCamera reports unavailable.
    renderCapture();
    await userEvent.click(screen.getByText('Pantry'));
    expect(document.querySelector('input[type="file"]')).not.toBeNull();
  });

  it('caps the thumbnail strip at ten photos', async () => {
    renderCapture();
    await userEvent.click(screen.getByText('Pantry'));
    await pickFiles(12);
    const thumbs = await screen.findAllByRole('img', { name: /photo/i });
    expect(thumbs).toHaveLength(10);
  });

  it('presigns once when submit is pressed twice', async () => {
    renderCapture();
    await userEvent.click(screen.getByText('Pantry'));
    await pickFiles(1);
    const submit = screen.getByRole('button', { name: /analyse/i });
    await userEvent.click(submit);
    await userEvent.click(submit);
    // The MSW presign handler returns keys of the form `mock/<uuid>.jpg`.
    // Recognition runs once, so onItems fires once.
    await waitFor(() => expect(screen.queryByRole('button', { name: /analyse/i })).toBeNull());
  });

  it('submits the presigned keys, not the sample photos', async () => {
    const { onItems } = renderCapture();
    await userEvent.click(screen.getByText('Pantry'));
    await pickFiles(1);
    await userEvent.click(screen.getByRole('button', { name: /analyse/i }));
    await waitFor(() => expect(onItems).toHaveBeenCalled());
    // The mock recognition session is built from whatever keys were uploaded;
    // the point is the flow reached recognition via a real presign, not the
    // deleted `mock/fridge-1.jpg` shortcut. encodeStub proves each file was
    // re-encoded before upload.
    expect(encodeStub).toHaveBeenCalled();
  });
});
```

> **Note on the empty-result assertion:** the shared MSW recognition handler (`buildRecognitionSession`) returns items, so "nothing recognised" cannot be triggered through MSW without a handler override. Cover it by asserting the state renders when `onItems` would receive an empty list — inject via a `server.use(...)` override that returns `{ …session, items: [] }` for `/inventory/recognize`, then assert `screen.getByText(/couldn't identify/i)`. Add this as a fifth test using the web MSW `server` from `../../mocks/server`.

- [ ] **Step 4: Run it to verify it fails**

```bash
pnpm --filter @kitchen/web exec vitest run src/components/kitchen/PhotoCapture.test.tsx
```

Expected: FAIL — cannot resolve `./PhotoCapture`.

- [ ] **Step 5: Write the component**

Create `apps/web/src/components/kitchen/PhotoCapture.tsx`:

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import type { RecognizedItem } from '@kitchen/contracts';
import { PhotoUploadError, uploadPhotos } from '@kitchen/api-client';
import { useLocale } from '../../lib/locale';
import { useCamera } from '../../hooks/camera';
import { usePresignUpload, useRecognize } from '../../hooks/capture';
import { webPhotoUploader } from '../../lib/photo-uploader';
import { encodeResized, type EncodeSource } from '../../lib/image-encode';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { ErrorState } from '../ui/states';
import { CameraIcon } from '../ui/icons';

type LocationHint = 'fridge' | 'freezer' | 'pantry' | 'spice_rack';
const LOCATIONS: { hint: LocationHint; key: 'fridge' | 'freezer' | 'pantry' | 'spiceRack' }[] = [
  { hint: 'fridge', key: 'fridge' },
  { hint: 'freezer', key: 'freezer' },
  { hint: 'pantry', key: 'pantry' },
  { hint: 'spice_rack', key: 'spiceRack' },
];

const MAX_PHOTOS = 10;

type Shot = { id: string; blob: Blob; url: string };

export function PhotoCapture({
  onItems,
  encode = encodeResized,
}: {
  onItems: (items: RecognizedItem[]) => void;
  encode?: (source: EncodeSource) => Promise<Blob>;
}) {
  const { t } = useLocale();
  const camera = useCamera();
  const presign = usePresignUpload();
  const recognize = useRecognize();

  const [location, setLocation] = useState<LocationHint | null>(null);
  const [shots, setShots] = useState<Shot[]>([]);
  const [uploading, setUploading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [empty, setEmpty] = useState(false);
  const idRef = useRef(0);

  const busy = presign.isPending || uploading || recognize.isPending;

  // Revoke every object URL on unmount so retakes don't leak blobs.
  useEffect(
    () => () => {
      shots.forEach((shot) => URL.revokeObjectURL(shot.url));
    },
    [shots],
  );

  const addBlob = (blob: Blob) =>
    setShots((prev) =>
      prev.length >= MAX_PHOTOS
        ? prev
        : [...prev, { id: `s${idRef.current++}`, blob, url: URL.createObjectURL(blob) }],
    );

  const onFiles = async (files: FileList | null) => {
    if (!files) return;
    const room = MAX_PHOTOS - shots.length;
    for (const file of Array.from(files).slice(0, room)) {
      addBlob(await encode(file));
    }
  };

  const removeShot = (id: string) =>
    setShots((prev) => {
      const gone = prev.find((s) => s.id === id);
      if (gone) URL.revokeObjectURL(gone.url);
      return prev.filter((s) => s.id !== id);
    });

  const submit = async () => {
    if (busy || shots.length === 0) return;
    setFailed(false);
    setEmpty(false);
    setUploading(true);
    try {
      const keys = await uploadPhotos(
        shots.map((s) => s.blob),
        (contentLength) =>
          presign.mutateAsync({
            contentType: 'image/jpeg',
            contentLength,
            purpose: 'inventory_photo',
          }),
        webPhotoUploader,
      );
      const session = await recognize.mutateAsync({
        photoKeys: keys,
        locationHint: location ?? undefined,
      });
      if (session.items.length === 0) {
        setEmpty(true);
        return;
      }
      onItems(session.items);
    } catch (error) {
      // Only uploadPhotos can fail to *send* bytes; recognition failures reached
      // the server. Distinguish so we don't blame the connection for an
      // out-of-credits or model error.
      setFailed(error instanceof PhotoUploadError);
      if (!(error instanceof PhotoUploadError)) throw error;
    } finally {
      setUploading(false);
    }
  };

  if (location === null) {
    return (
      <Card className="flex flex-col items-center gap-4 py-10 text-center">
        <CameraIcon className="h-10 w-10 text-muted-foreground" />
        <p className="font-medium">{t('web.capture.locationPrompt')}</p>
        <div className="flex flex-wrap justify-center gap-2">
          {LOCATIONS.map(({ hint, key }) => (
            <Button
              key={hint}
              variant="secondary"
              onClick={() => {
                setLocation(hint);
                void camera.start();
              }}
            >
              {t(`web.capture.location.${key}`)}
            </Button>
          ))}
        </div>
      </Card>
    );
  }

  if (empty) {
    return (
      <Card className="flex flex-col items-center gap-4 py-10 text-center">
        <p className="font-medium">{t('web.capture.nothingRecognised')}</p>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setEmpty(false)}>
            {t('web.capture.retake')}
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col items-center gap-4 py-6 text-center">
      {camera.state === 'ready' ? (
        <video
          ref={camera.videoRef}
          autoPlay
          muted
          playsInline
          className="w-full max-w-md rounded-2xl"
        />
      ) : null}

      {/* File input is always available and is the sole path when the camera is
          denied or unavailable. `capture` opens the camera on mobile browsers. */}
      <label className="cursor-pointer text-sm text-primary-text underline">
        {camera.state === 'denied' ? t('web.capture.denied') : t('web.capture.useFile')}
        <input
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          className="sr-only"
          onChange={(e) => void onFiles(e.target.files)}
        />
      </label>

      {shots.length > 0 ? (
        <>
          <div className="flex flex-wrap justify-center gap-2">
            {shots.map((shot, i) => (
              <button
                key={shot.id}
                type="button"
                onClick={() => removeShot(shot.id)}
                className="relative"
                aria-label={t('web.capture.retake')}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={shot.url}
                  alt={`${t('web.capture.shutter')} ${i + 1}`}
                  className="h-16 w-16 rounded-lg object-cover"
                />
              </button>
            ))}
          </div>
          <p className="text-sm text-muted-foreground">
            {t('web.capture.photoCount', { count: shots.length })}
          </p>
        </>
      ) : null}

      {/* resolveErrorKey only reads .messageKey off an ApiError, so a synthetic
          upload failure is rendered directly rather than through ErrorState. */}
      {failed ? (
        <p role="alert" className="text-sm text-danger">
          {t('web.capture.uploadFailed')}
        </p>
      ) : null}
      {recognize.isError ? <ErrorState error={recognize.error} /> : null}

      <Button onClick={() => void submit()} disabled={busy || shots.length === 0}>
        {busy ? t('capture.scanning') : t('web.capture.analyze')}
      </Button>
    </Card>
  );
}
```

> **Implementation notes for the executor:**
> - `ErrorState` takes `error: unknown` and resolves it via `resolveErrorKey`, which only reads `.messageKey` off an `ApiError` instance. The recognition error is an `ApiError`, so `<ErrorState error={recognize.error} />` renders correctly; the synthetic upload failure is rendered as plain translated text instead.
> - `Button`'s `variant="secondary"` must exist; if the component's prop differs, use the closest existing variant rather than inventing one. Check `apps/web/src/components/ui/Button.tsx`.
> - `text-primary-text` (not `text-primary`) for text colour, per the token-usage guard.
> - The live-camera **shutter** (draw `camera.videoRef.current` → `encode` → `addBlob`) is deliberately omitted from the test path because jsdom can't play a video; wire a shutter button shown only when `camera.state === 'ready'` that calls `addBlob(await encode(camera.videoRef.current!))`. It is covered by the manual hardware gate.

- [ ] **Step 6: Run the tests to verify they pass**

```bash
pnpm --filter @kitchen/web exec vitest run src/components/kitchen/PhotoCapture.test.tsx
```

Expected: PASS (5 tests). If `userEvent.upload` doesn't trigger `onFiles`, confirm the input is not `disabled` and is found by `input[type="file"]`.

- [ ] **Step 7: Format and commit**

```bash
npx prettier --config packages/config/prettier.config.mjs --write \
  apps/web/src/lib/image-encode.ts apps/web/src/hooks/capture.ts \
  apps/web/src/components/kitchen/PhotoCapture.tsx apps/web/src/components/kitchen/PhotoCapture.test.tsx
git add apps/web/src/lib/image-encode.ts apps/web/src/hooks/capture.ts \
  apps/web/src/components/kitchen/PhotoCapture.tsx apps/web/src/components/kitchen/PhotoCapture.test.tsx
git commit -m "feat(web): real photo capture — camera/file, resize, upload, recognise

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 7: Wire `PhotoCapture` into `CaptureFlow` and delete the mock step

**Files:**
- Modify: `apps/web/src/components/kitchen/CaptureFlow.tsx`

**Interfaces:**
- Consumes: `PhotoCapture` (Task 6).

- [ ] **Step 1: Replace the render site**

In `apps/web/src/components/kitchen/CaptureFlow.tsx`, change the photo branch (~line 101):

```tsx
{method === 'photo' ? <PhotoCapture onItems={setItems} /> : null}
```

- [ ] **Step 2: Delete the mock `PhotoStep` and add the import**

Add near the other component imports:

```tsx
import { PhotoCapture } from './PhotoCapture';
```

Delete the entire `function PhotoStep({ onItems }) { … }` definition (the block rendering `web.capture.dropHint` / `simulateHint` and calling `recognize.mutate({ photoKeys: ['mock/fridge-1.jpg', …] })`).

Remove `useRecognize` from the `../../hooks/capture` import if it is now unused in this file (it moved into `PhotoCapture`). Keep `useLookupBarcode`, `useParseReceipt`, `useRecognitionSession`. Keep the `CameraIcon` import — the `MethodTab` at line 95 still uses it.

- [ ] **Step 3: Typecheck, lint, and run the web suite**

```bash
pnpm --filter @kitchen/web typecheck
pnpm --filter @kitchen/web lint
pnpm --filter @kitchen/web exec vitest run src/components/kitchen src/hooks/camera.spec.ts src/lib/image.spec.ts src/lib/photo-uploader.spec.ts
```

Expected: all PASS. Typecheck fails if `simulateHint` or `dropHint`-only-usage left a dangling `t()` key; lint fails on any physical-direction class. Fix inline.

- [ ] **Step 4: Format and commit**

```bash
npx prettier --config packages/config/prettier.config.mjs --write apps/web/src/components/kitchen/CaptureFlow.tsx
git add apps/web/src/components/kitchen/CaptureFlow.tsx
git commit -m "feat(web): use real PhotoCapture in the capture flow, drop the sample-photo step

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 8: Fault-injection cases

**Files:**
- Modify: `scripts/fault-inject-assistant.mjs`

Each case pairs a source mutation with the exact substring of the test name that must redden. Add a file/anchor constant per touched file, then append the cases before the closing `];` of the `CASES` array. The harness rebuilds `packages/*` by directory, so the api-client change propagates.

- [ ] **Step 1: Add the cases**

Add these cases (mutation `from` → `to`, `check` = failing test-name substring):

| File | `from` (anchor) | `to` (defect) | `check` (must redden) |
|---|---|---|---|
| `packages/api-client/src/upload.ts` | `if (status < 200 \|\| status >= 300) {` | `if (status < 200 && status >= 300) {` | `stops and throws rejected when a PUT fails` |
| `packages/api-client/src/upload.ts` | `const target = await presign(size);` | `const target = await presign(1);` | `sends the real byte size to the presigner` |
| `apps/web/src/lib/image.ts` | `if (longest <= maxEdge) return { width, height };` | `if (longest >= maxEdge) return { width, height };` | `never upscales a small image` |
| `apps/web/src/lib/image.ts` | `export const MAX_IMAGE_EDGE_PX = 1024;` | `export const MAX_IMAGE_EDGE_PX = 1600;` | `uses the resize target the model-routing spec mandates` |
| `apps/web/src/lib/photo-uploader.ts` | `if (MOCKING_ENABLED) return 200;` | `if (!MOCKING_ENABLED) return 200;` | `short-circuits to 200 under mocks without fetching` |
| `apps/web/src/hooks/camera.ts` | `name === 'NotAllowedError' \|\| name === 'SecurityError' ? 'denied' : 'unavailable'` | `false ? 'denied' : 'unavailable'` | `maps a refused permission to denied` |
| `apps/web/src/hooks/camera.ts` | `streamRef.current?.getTracks().forEach((track) => track.stop());` | `streamRef.current?.getTracks().forEach((track) => void track);` | `stops every track on stop` |
| `apps/web/src/components/kitchen/PhotoCapture.tsx` | `prev.length >= MAX_PHOTOS` | `prev.length >= MAX_PHOTOS + 5` | `caps the thumbnail strip at ten photos` |
| `apps/web/src/components/kitchen/PhotoCapture.tsx` | `if (busy \|\| shots.length === 0) return;` | `if (shots.length === 0) return;` | `presigns once when submit is pressed twice` |
| `apps/web/src/components/kitchen/PhotoCapture.tsx` | `if (session.items.length === 0) {` | `if (session.items.length < 0) {` | `couldn't identify` |

> If any anchor no longer matches after Prettier reflow, copy the reflowed line verbatim from the source — anchors are string-exact.

- [ ] **Step 2: Run the full harness (redirect to a file — never pipe to tail)**

```bash
node scripts/fault-inject-assistant.mjs > /tmp/wpu-fault.log 2>&1; echo "REAL_EXIT=$?"
tail -40 /tmp/wpu-fault.log
```

Expected: the last line reads `N/N defects were caught by the check that names them` and `REAL_EXIT=0`, and each new check name appears with a `✓`. If a mutation is rejected by the compiler (e.g. the camera `void track` change), the harness reports it as "redundant with the type — delete it"; in that case remove that case rather than defend it.

- [ ] **Step 3: Commit**

```bash
git add scripts/fault-inject-assistant.mjs
git commit -m "test(web): fault-injection cases for the photo upload path

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 9: Full gate and manual hardware gate

- [ ] **Step 1: Run the whole gate**

```bash
pnpm build   > /tmp/wpu-build.log 2>&1; echo "BUILD=$?"
pnpm typecheck > /tmp/wpu-tc.log 2>&1; echo "TC=$?"
pnpm lint    > /tmp/wpu-lint.log 2>&1; echo "LINT=$?"
pnpm test    > /tmp/wpu-test.log 2>&1; echo "TEST=$?"
```

Expected: all exit 0. `turbo run build` must precede typecheck/lint/test (every task `dependsOn: ["^build"]`). Inspect the `.log` files on any non-zero exit; the pipe-to-tail trap masks exit codes, so read the files directly.

- [ ] **Step 2: Record the manual hardware gates (cannot be unit-tested)**

These two require a real browser + camera and are a human pass before the feature ships. Document the result in the PR body:

1. **Live camera:** on `https://` (or `http://localhost:3100`), pick a location, confirm a real preview opens, the preview is **not mirrored**, a shot uploads, and recognition returns items.
2. **File orientation:** photograph something with the phone held **sideways**, pick that file through the fallback, and confirm the stored/recognised image is **upright** (EXIF baked in).

- [ ] **Step 3: Push and open the PR (stacked on nothing — base `main`)**

```bash
git push -u origin feat/web-photo-upload
gh pr create --base main --head feat/web-photo-upload \
  --title "feat(web): real photo capture and upload" \
  --body-file <(printf '%s\n' "See docs/superpowers/plans/2026-08-28-web-photo-upload.md. Manual gates pending: <fill in>.")
```

---

## Self-Review

- **Spec coverage:** Reconciliation §1 (resize 1024/0.7) → Tasks 2, 6; §2 (EXIF orientation) → Task 6 (`encodeResized`); §3 (always JPEG) → Task 6. Five approved units → api-client `upload.ts` relocation (Task 1), `photo-uploader.ts` (Task 3), `camera.ts` (Task 4), `PhotoCapture.tsx` (Task 6), `CaptureFlow.tsx` edit (Task 7); the sixth unit `image.ts` → Task 2. `usePresignUpload` + presign MSW → Task 6 (handler already exists). i18n + delete `simulateHint` → Task 5. Testing table → Tasks 1–6; fault injection → Task 8; manual gates → Task 9. **The "ported coverage.spec.ts" row is intentionally dropped** — both routes this feature calls already have web MSW handlers, so there is no coverage gap, and web's path-keyed handler array does not fit mobile's resolver-object check.
- **Placeholder scan:** none — every code step carries full source; the shutter and empty-result MSW-override are described with exact wiring.
- **Type consistency:** `PhotoUploader<T>` / `uploadPhotos<T>` (Task 1) used as `PhotoUploader<Blob>` (Task 3) and `uploadPhotos(shots.map(...blob), presign, webPhotoUploader)` (Task 6). `EncodeSource` / `encodeResized` (Task 6 image-encode) consumed by `PhotoCapture`'s `encode` prop. `CameraState` / `useCamera()` shape (Task 4) consumed in Task 6. `locationHint` values match `recognizeRequestSchema` (`spice_rack`). `web.capture.*` keys defined in Task 5 are exactly those read in Tasks 6/7.
