# Model Routing and Vision Cost Control Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut the vision tier's cost by right-sizing uploaded photos and routing vision to Gemini, and make `ai_usage` record what was actually spent per model so credit pricing can be derived from it.

**Architecture:** `StructuredRequest` already carries `tier`, so a new `RoutedAiProvider` implementing `AiProvider` can dispatch per tier and register under the existing `AI_PROVIDER` token — `AiGateway`, `SchemaGuard` and every consuming service keep working unchanged. Cost moves from a per-tier table to a per-model-id table. Images are resized on the client before presigning, with a server-side ceiling as backstop.

**Tech Stack:** NestJS + TypeScript (ESM-style `.js` import specifiers), Vitest, Drizzle, Zod, `@google/genai` v2.16.0, `expo-image-manipulator`.

Spec: `docs/superpowers/specs/2026-08-11-model-routing-design.md`

## Global Constraints

- **Never edit `packages/contracts`.** Every change here is API-side or client-side. The presign ceiling is enforced in the service layer precisely to avoid a contract change.
- **API imports carry the `.js` extension** (`./ai.constants.js`) even though the compiler emits CommonJS. Mobile and web imports have no extension.
- **The server never sends user-facing prose.** Throw `AppError` with an error code plus an i18n `messageKey`; clients translate.
- **NestJS DI:** inject with an explicit `@Inject(ClassName)` decorator, never a bare constructor param type. `@typescript-eslint/consistent-type-imports` would rewrite a bare type-position import to `import type`, erasing the runtime binding `emitDecoratorMetadata` needs — code that typechecks, lints clean and throws on boot. Never use `eslint-disable` for this.
- **`AI_MOCK` must keep working.** It defaults to `true` and is checked before any routing, so the whole system still runs offline and free with no OpenAI or Gemini key.
- **`AI_VISION_VENDOR` defaults to `openai`.** A missing or misconfigured Gemini setup degrades to today's behaviour.
- **Mobile specs run under `environment: 'node'`.** No spec may import a `.tsx` component or a native Expo module. Pure logic lives in `apps/mobile/src/lib/`.
- **Values fixed by the spec:** `MAX_IMAGE_EDGE_PX = 1024`, `IMAGE_JPEG_QUALITY = 0.7`, `MAX_CAPTURE_UPLOAD_BYTES = 2 * 1024 * 1024`.
- **Run the checks CI runs.** `pnpm --filter @kitchen/api exec vitest run`, `tsc --noEmit`, **and `eslint src`**. A green suite is not a green build.
- Every task ends green and committed.

---

## File Structure

**Created:**
- `apps/api/src/ai/providers/gemini.provider.ts` — Gemini adapter implementing `AiProvider`
- `apps/api/src/ai/providers/__tests__/gemini.provider.spec.ts`
- `apps/api/src/ai/providers/routed.provider.ts` — tier → provider dispatch and vision fallback
- `apps/api/src/ai/providers/__tests__/routed.provider.spec.ts`
- `apps/api/src/ai/__tests__/model-rates.spec.ts`
- `apps/api/src/storage/storage.service.spec.ts`
- `apps/mobile/src/lib/image.ts` — resize constants and pure fit maths
- `apps/mobile/src/lib/image.spec.ts`

**Not included — web capture.** The spec asks for a web resize too, but the web app has no
upload path to resize into: `apps/web/src/components/kitchen/CaptureFlow.tsx:240` submits a
hardcoded `['mock/receipt-1.jpg']`, and nothing in `apps/web/src` outside the MSW handlers
references `contentLength`, `uploadUrl` or presign. The camera-capture design exists on paper
and is unbuilt. A resize helper wired to nothing saves nothing, so the client work here is
mobile-only; the resize belongs to whatever task eventually builds the web upload.

**Modified:**
- `apps/api/src/ai/ai.constants.ts` — per-model rate table, `estimateCostUsd` signature
- `apps/api/src/ai/usage/budget.service.ts` — pass the model id to `estimateCostUsd`
- `apps/api/src/ai/providers/ai-provider.interface.ts` — widen `kind`, add `priorAttempts`
- `apps/api/src/ai/validation/schema-guard.ts` — carry `priorAttempts` through
- `apps/api/src/ai/ai-gateway.service.ts` — record a row per distinct model
- `apps/api/src/ai/ai.module.ts` — build the routed provider
- `apps/api/src/config/env.ts` — Gemini keys and production guard
- `apps/api/src/storage/storage.service.ts` — capture upload ceiling
- `apps/mobile/src/features/capture/PhotoCapture.tsx` — resize before upload
- `apps/mobile/package.json` — add `expo-image-manipulator`
- `apps/api/package.json` — add `@google/genai`

---

## Task 1: Price a call by its model, not its tier

Foundational: it makes the measurement in every later task trustworthy. Today `estimateCostUsd` reads the rate from the **tier**, which is correct only while one vendor serves every tier.

**Files:**
- Modify: `apps/api/src/ai/ai.constants.ts`
- Modify: `apps/api/src/ai/usage/budget.service.ts:47`
- Test: `apps/api/src/ai/__tests__/model-rates.spec.ts` (create)

**Interfaces:**
- Consumes: nothing.
- Produces: `estimateCostUsd(model: string, tier: ModelTier, inputTokens: number, outputTokens: number): number`; `MODEL_RATES_USD_PER_MTOK: Record<string, ModelRate>`; `TIER_FALLBACK_RATES: Record<ModelTier, ModelRate>`; `interface ModelRate { input: number; output: number }`.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/ai/__tests__/model-rates.spec.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { estimateCostUsd, MODEL_RATES_USD_PER_MTOK } from '../ai.constants.js';

describe('estimateCostUsd', () => {
  it('prices a known model from its own rate, not its tier', () => {
    // gpt-5-mini is a cheap-tier model; 1M input tokens at its own input rate.
    const cost = estimateCostUsd('gpt-5-mini', 'cheap', 1_000_000, 0);
    expect(cost).toBeCloseTo(MODEL_RATES_USD_PER_MTOK['gpt-5-mini'].input, 10);
  });

  it('prices two models on the same tier differently', () => {
    // The whole point: a Gemini vision call must not be billed at OpenAI rates.
    const openai = estimateCostUsd('gpt-5', 'vision', 1_000_000, 1_000_000);
    const gemini = estimateCostUsd('gemini-3-flash', 'vision', 1_000_000, 1_000_000);
    expect(gemini).toBeLessThan(openai);
  });

  it('falls back to the tier rate and warns for an unknown model', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const cost = estimateCostUsd('some-unreleased-model', 'cheap', 1_000_000, 0);
    expect(cost).toBeCloseTo(0.15, 10);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('sums input and output at their separate rates', () => {
    const rate = MODEL_RATES_USD_PER_MTOK['gpt-5-mini'];
    expect(estimateCostUsd('gpt-5-mini', 'cheap', 2_000_000, 3_000_000)).toBeCloseTo(
      rate.input * 2 + rate.output * 3,
      10,
    );
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter @kitchen/api exec vitest run src/ai/__tests__/model-rates.spec.ts`
Expected: FAIL — `estimateCostUsd` currently takes `(tier, input, output)`, so the model-id argument is not honoured.

- [ ] **Step 3: Replace the rate table and the function**

In `apps/api/src/ai/ai.constants.ts`, replace the existing `MODEL_RATES_USD_PER_MTOK` and `estimateCostUsd` with:

```ts
export interface ModelRate {
  input: number;
  output: number;
}

/**
 * USD per 1M tokens, keyed by the concrete model id the provider reports.
 *
 * Keyed by model rather than by tier because two vendors can serve one tier:
 * billing a Gemini vision call at OpenAI's rate would misstate spend in
 * `ai_usage`, and that ledger is what AI credit pricing is derived from.
 *
 * List prices as of 2026-08-11. Verify before launch; these move.
 */
export const MODEL_RATES_USD_PER_MTOK: Record<string, ModelRate> = {
  'gpt-5': { input: 2.5, output: 10 },
  'gpt-5-mini': { input: 0.15, output: 0.6 },
  'gemini-3-flash': { input: 1.5, output: 7.5 },
};

/**
 * Used only when a model id is not in the table above — a newly configured
 * model, or a provider reporting a dated id like `gpt-5-2026-01-01`. It keeps
 * billing conservative rather than free, but it is a fallback, not a plan:
 * an unknown model priced silently at a default is how spend drifts unnoticed,
 * so it warns.
 */
export const TIER_FALLBACK_RATES: Record<ModelTier, ModelRate> = {
  cheap: { input: 0.15, output: 0.6 },
  vision: { input: 2.5, output: 10 },
  planning: { input: 2.5, output: 10 },
};

export function estimateCostUsd(
  model: string,
  tier: ModelTier,
  inputTokens: number,
  outputTokens: number,
): number {
  let rate = MODEL_RATES_USD_PER_MTOK[model];
  if (!rate) {
    rate = TIER_FALLBACK_RATES[tier];
    console.warn(
      `[ai] no rate for model "${model}" (tier ${tier}); billing at the tier fallback rate. ` +
        'Add it to MODEL_RATES_USD_PER_MTOK.',
    );
  }
  return (inputTokens * rate.input + outputTokens * rate.output) / 1_000_000;
}
```

- [ ] **Step 4: Update the one call site**

In `apps/api/src/ai/usage/budget.service.ts`, `record()` currently calls
`estimateCostUsd(input.tier, ...)`. It already receives the concrete model:

```ts
    const cost = estimateCostUsd(
      input.model,
      input.tier,
      input.usage.inputTokens,
      input.usage.outputTokens,
    );
```

- [ ] **Step 5: Run the new test and the whole API suite**

Run: `pnpm --filter @kitchen/api exec vitest run`
Expected: PASS, including the new file. Any budget or usage spec that asserted a tier-priced number must be read carefully — if one fails, confirm the new number is right for the model it names before changing the assertion.

- [ ] **Step 6: Typecheck and lint**

Run: `pnpm --filter @kitchen/api exec tsc --noEmit && pnpm --filter @kitchen/api exec eslint src`
Expected: both exit 0.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/ai/ai.constants.ts apps/api/src/ai/usage/budget.service.ts apps/api/src/ai/__tests__/model-rates.spec.ts
git commit -m "Price an AI call by its model instead of its tier"
```

---

## Task 2: Refuse an un-resized capture upload

The contract caps `contentLength` at 15 MB, which a full camera frame passes easily. The client resize in Tasks 3 and 4 is the fix; this is the backstop that makes it enforceable.

**Files:**
- Modify: `apps/api/src/storage/storage.service.ts:63`
- Test: `apps/api/src/storage/storage.service.spec.ts` (create)

**Interfaces:**
- Consumes: nothing.
- Produces: `MAX_CAPTURE_UPLOAD_BYTES` exported from `apps/api/src/storage/storage.service.ts`.

- [ ] **Step 1: Write the failing test**

`StorageService` takes only `env` (`@Inject(ENV)`), so it can be constructed directly with a
literal — no Nest module needed. Create `apps/api/src/storage/storage.service.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { MAX_CAPTURE_UPLOAD_BYTES, StorageService } from './storage.service.js';
import { AppError } from '../common/errors.js';
import type { Env } from '../config/env.js';

const HOUSEHOLD = '11111111-1111-1111-1111-111111111111';

function makeStorageService(): StorageService {
  // Only the S3 fields are read by the constructor; the URL is signed locally
  // by the SDK, so no network call happens in this spec.
  const env = {
    S3_BUCKET: 'kitchen-test',
    S3_ENDPOINT: 'http://localhost:9000',
    S3_REGION: 'us-east-1',
    S3_FORCE_PATH_STYLE: true,
    S3_ACCESS_KEY: 'test',
    S3_SECRET_KEY: 'test-secret',
  } as unknown as Env;
  return new StorageService(env);
}

describe('presignUpload capture ceiling', () => {
  it('rejects an inventory photo above the capture ceiling', async () => {
    await expect(
      makeStorageService().presignUpload(HOUSEHOLD, {
        contentType: 'image/jpeg',
        contentLength: MAX_CAPTURE_UPLOAD_BYTES + 1,
        purpose: 'inventory_photo',
      }),
    ).rejects.toBeInstanceOf(AppError);
  });

  it('rejects an oversized receipt too', async () => {
    await expect(
      makeStorageService().presignUpload(HOUSEHOLD, {
        contentType: 'image/jpeg',
        contentLength: MAX_CAPTURE_UPLOAD_BYTES + 1,
        purpose: 'receipt',
      }),
    ).rejects.toBeInstanceOf(AppError);
  });

  it('allows a resized capture at exactly the ceiling', async () => {
    await expect(
      makeStorageService().presignUpload(HOUSEHOLD, {
        contentType: 'image/jpeg',
        contentLength: MAX_CAPTURE_UPLOAD_BYTES,
        purpose: 'inventory_photo',
      }),
    ).resolves.toBeDefined();
  });

  it('leaves non-capture purposes on the wider contract limit', async () => {
    // recipe_image is not a camera capture and keeps the 15 MB contract cap.
    await expect(
      makeStorageService().presignUpload(HOUSEHOLD, {
        contentType: 'image/jpeg',
        contentLength: MAX_CAPTURE_UPLOAD_BYTES + 1,
        purpose: 'recipe_image',
      }),
    ).resolves.toBeDefined();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter @kitchen/api exec vitest run src/storage/storage.service.spec.ts`
Expected: FAIL — `MAX_CAPTURE_UPLOAD_BYTES` is not exported and no ceiling is applied.

- [ ] **Step 3: Implement the ceiling**

In `apps/api/src/storage/storage.service.ts`, add near the other module constants:

```ts
/**
 * Camera captures are resized client-side to MAX_IMAGE_EDGE_PX before upload.
 * The contract's 15 MB cap is far too loose to notice a client that skipped
 * that step, and an un-resized frame costs real money on the vision tier, so
 * capture purposes get their own ceiling. A 1024px JPEG at quality 0.7 lands
 * well under this.
 */
export const MAX_CAPTURE_UPLOAD_BYTES = 2 * 1024 * 1024;

const CAPTURE_PURPOSES = new Set(['inventory_photo', 'receipt']);
```

At the top of `presignUpload`, before the key is built:

```ts
    if (CAPTURE_PURPOSES.has(dto.purpose) && dto.contentLength > MAX_CAPTURE_UPLOAD_BYTES) {
      throw new AppError('VALIDATION_FAILED', 'errors.VALIDATION_FAILED', {
        field: 'contentLength',
        maxBytes: MAX_CAPTURE_UPLOAD_BYTES,
        actualBytes: dto.contentLength,
        purpose: dto.purpose,
      });
    }
```

Import `AppError` from `../common/errors.js` if it is not already imported.

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @kitchen/api exec vitest run src/storage/`
Expected: PASS.

- [ ] **Step 5: Typecheck and lint, then commit**

```bash
pnpm --filter @kitchen/api exec tsc --noEmit && pnpm --filter @kitchen/api exec eslint src
git add apps/api/src/storage/
git commit -m "Refuse a capture upload that skipped the client resize"
```

---

## Task 3: Right-size photos on mobile

Vision is billed on **dimensions**, and `PhotoCapture.tsx` only sets `quality: 0.6`, which is JPEG compression. Full camera frames are being uploaded and read.

**Files:**
- Create: `apps/mobile/src/lib/image.ts`
- Create: `apps/mobile/src/lib/image.spec.ts`
- Modify: `apps/mobile/src/features/capture/PhotoCapture.tsx:63-76`
- Modify: `apps/mobile/package.json`

**Interfaces:**
- Consumes: nothing.
- Produces: `MAX_IMAGE_EDGE_PX = 1024`; `IMAGE_JPEG_QUALITY = 0.7`; `fitWithin(width: number, height: number, maxEdge?: number): { width: number; height: number }`; `resizeForUpload(uri: string): Promise<string>`.

- [ ] **Step 1: Install the dependency**

```bash
pnpm --filter @kitchen/mobile add expo-image-manipulator
```

- [ ] **Step 2: Write the failing test**

Mobile specs run under `environment: 'node'` and cannot import native Expo modules, so the test targets the pure maths. Create `apps/mobile/src/lib/image.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { fitWithin, IMAGE_JPEG_QUALITY, MAX_IMAGE_EDGE_PX } from './image';

describe('fitWithin', () => {
  it('scales a landscape camera frame down to the long edge', () => {
    // A typical phone camera frame.
    expect(fitWithin(4032, 3024)).toEqual({ width: 1024, height: 768 });
  });

  it('scales a portrait frame down to the long edge', () => {
    expect(fitWithin(3024, 4032)).toEqual({ width: 768, height: 1024 });
  });

  it('never upscales an image that is already small', () => {
    // Upscaling would cost more tokens for no extra detail.
    expect(fitWithin(640, 480)).toEqual({ width: 640, height: 480 });
  });

  it('leaves an image exactly at the ceiling alone', () => {
    expect(fitWithin(1024, 1024)).toEqual({ width: 1024, height: 1024 });
  });

  it('preserves aspect ratio within a pixel', () => {
    const out = fitWithin(4000, 2250);
    expect(out.width / out.height).toBeCloseTo(4000 / 2250, 2);
  });

  it('rounds to whole pixels', () => {
    const out = fitWithin(4032, 3024);
    expect(Number.isInteger(out.width)).toBe(true);
    expect(Number.isInteger(out.height)).toBe(true);
  });

  it('pins the spec values', () => {
    // Pinned so a later change has to be deliberate: these two numbers set the
    // per-call vision cost, and the web capture path will have to match them
    // when it is eventually built.
    expect(MAX_IMAGE_EDGE_PX).toBe(1024);
    expect(IMAGE_JPEG_QUALITY).toBe(0.7);
  });
});
```

- [ ] **Step 3: Run it and watch it fail**

Run: `pnpm --filter @kitchen/mobile exec vitest run src/lib/image.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement**

Create `apps/mobile/src/lib/image.ts`:

```ts
import * as ImageManipulator from 'expo-image-manipulator';

/**
 * Vision models are billed on image dimensions, not file size, so capturing at
 * `quality: 0.6` saved bandwidth and nothing else. A 1024px long edge is enough
 * to recognise jars and packets on a shelf and costs a fraction of a full frame.
 *
 * Duplicated by whatever builds the web capture upload, which does not exist
 * yet: this is a capture concern and neither app should reach into the other.
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

/**
 * Resize a captured photo before upload and return the new local URI.
 *
 * Passing only the long edge lets the manipulator derive the other side, which
 * keeps the aspect ratio exact. The manipulator also bakes EXIF rotation into
 * the pixels: a sideways shelf recognises worse than an upright one, so an
 * orientation-losing resize would spend the saving back on accuracy.
 */
export async function resizeForUpload(uri: string): Promise<string> {
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: MAX_IMAGE_EDGE_PX } }],
    { compress: IMAGE_JPEG_QUALITY, format: ImageManipulator.SaveFormat.JPEG },
  );
  return result.uri;
}
```

- [ ] **Step 5: Run the test**

Run: `pnpm --filter @kitchen/mobile exec vitest run src/lib/image.spec.ts`
Expected: PASS.

- [ ] **Step 6: Wire it into capture**

In `apps/mobile/src/features/capture/PhotoCapture.tsx`, import `resizeForUpload` from `../../lib/image` and resize in **both** paths — a library pick needs it as much as a camera shot:

```tsx
  const takePhoto = async () => {
    const shot = await cameraRef.current?.takePictureAsync({ quality: 0.6 });
    if (shot?.uri) addPhoto(await resizeForUpload(shot.uri));
  };

  const pickLibrary = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.6,
      allowsMultipleSelection: mode === 'photo',
    });
    if (result.canceled) return;
    const resized = await Promise.all(result.assets.map((asset) => resizeForUpload(asset.uri)));
    resized.forEach(addPhoto);
  };
```

- [ ] **Step 7: Verify the whole mobile suite, lint, and commit**

```bash
pnpm --filter @kitchen/mobile exec vitest run
pnpm --filter @kitchen/mobile exec tsc --noEmit
pnpm --filter @kitchen/mobile exec eslint src
git add apps/mobile/
git commit -m "Resize a captured photo before uploading it"
```

---

## Task 4: A Gemini provider

**Files:**
- Create: `apps/api/src/ai/providers/gemini.provider.ts`
- Create: `apps/api/src/ai/providers/__tests__/gemini.provider.spec.ts`
- Modify: `apps/api/package.json`

**Interfaces:**
- Consumes: `AiProvider`, `StructuredRequest`, `StructuredResponse` from `../providers/ai-provider.interface.js`; `PROVIDER_TIMEOUT_MS`, `PROVIDER_MAX_RETRIES`, `PROVIDER_MAX_OUTPUT_TOKENS` from `../ai.constants.js`; `toProviderError` from `./openai.provider.js`.
- Produces: `class GeminiProvider implements AiProvider` with `readonly kind = 'gemini'` and `constructor(apiKey: string, models: { vision: string })`.

- [ ] **Step 1: Install the SDK**

```bash
pnpm --filter @kitchen/api add @google/genai
```

- [ ] **Step 2: Write the failing test**

The SDK is mocked; this is a unit test of the adapter's mapping, not of Google. Create `apps/api/src/ai/providers/__tests__/gemini.provider.spec.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const generateContent = vi.fn();
vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = { generateContent };
  },
}));

const { GeminiProvider } = await import('../gemini.provider.js');

function request(overrides = {}) {
  return {
    operation: 'vision.recognize' as const,
    tier: 'vision' as const,
    system: 'you are a kitchen assistant',
    user: 'what is in this photo',
    ...overrides,
  };
}

describe('GeminiProvider', () => {
  beforeEach(() => generateContent.mockReset());

  it('counts thinking tokens as output tokens', async () => {
    // Gemini bills thinking tokens as output but reports them separately.
    // Mapping only the visible count undercosts every call.
    generateContent.mockResolvedValue({
      text: '{"items":[]}',
      usageMetadata: {
        promptTokenCount: 100,
        candidatesTokenCount: 20,
        thoughtsTokenCount: 30,
      },
    });

    const provider = new GeminiProvider('key', { vision: 'gemini-3-flash' });
    const result = await provider.complete(request());

    expect(result.usage).toEqual({ inputTokens: 100, outputTokens: 50 });
  });

  it('parses the JSON body into raw', async () => {
    generateContent.mockResolvedValue({
      text: '{"items":[{"name":"tomato"}]}',
      usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 },
    });

    const provider = new GeminiProvider('key', { vision: 'gemini-3-flash' });
    const result = await provider.complete(request());

    expect(result.raw).toEqual({ items: [{ name: 'tomato' }] });
    expect(result.model).toBe('gemini-3-flash');
  });

  it('treats a missing thoughts count as zero rather than NaN', async () => {
    generateContent.mockResolvedValue({
      text: '{}',
      usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 7 },
    });

    const provider = new GeminiProvider('key', { vision: 'gemini-3-flash' });
    const result = await provider.complete(request());

    expect(result.usage).toEqual({ inputTokens: 5, outputTokens: 7 });
  });

  it('asks for JSON and applies the tier output ceiling', async () => {
    generateContent.mockResolvedValue({
      text: '{}',
      usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 },
    });

    const provider = new GeminiProvider('key', { vision: 'gemini-3-flash' });
    await provider.complete(request());

    const config = generateContent.mock.calls[0][0].config;
    expect(config.responseMimeType).toBe('application/json');
    expect(config.maxOutputTokens).toBe(8192); // PROVIDER_MAX_OUTPUT_TOKENS.vision
  });

  it('maps a transport failure onto the app error vocabulary', async () => {
    generateContent.mockRejectedValue(Object.assign(new Error('socket hang up'), {}));

    const provider = new GeminiProvider('key', { vision: 'gemini-3-flash' });
    await expect(provider.complete(request())).rejects.toMatchObject({
      code: 'AI_UNAVAILABLE',
    });
  });

  it('surfaces a rate limit as RATE_LIMITED', async () => {
    generateContent.mockRejectedValue(Object.assign(new Error('quota'), { status: 429 }));

    const provider = new GeminiProvider('key', { vision: 'gemini-3-flash' });
    await expect(provider.complete(request())).rejects.toMatchObject({
      code: 'RATE_LIMITED',
    });
  });

  it('sends images as inline parts when the request carries them', async () => {
    generateContent.mockResolvedValue({
      text: '{}',
      usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 },
    });
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/jpeg' } }),
    );

    const provider = new GeminiProvider('key', { vision: 'gemini-3-flash' });
    await provider.complete(request({ images: [{ url: 'https://example.test/a.jpg' }] }));

    expect(fetchSpy).toHaveBeenCalledWith('https://example.test/a.jpg');
    const parts = generateContent.mock.calls[0][0].contents[0].parts;
    expect(parts.some((p: { inlineData?: unknown }) => p.inlineData)).toBe(true);
    fetchSpy.mockRestore();
  });
});
```

- [ ] **Step 3: Run it and watch it fail**

Run: `pnpm --filter @kitchen/api exec vitest run src/ai/providers/__tests__/gemini.provider.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement**

Create `apps/api/src/ai/providers/gemini.provider.ts`:

```ts
import { GoogleGenAI } from '@google/genai';
import type {
  AiProvider,
  StructuredRequest,
  StructuredResponse,
} from './ai-provider.interface.js';
import { PROVIDER_MAX_OUTPUT_TOKENS, PROVIDER_TIMEOUT_MS } from '../ai.constants.js';
import { toProviderError } from './openai.provider.js';

export interface GeminiModels {
  vision: string;
}

/**
 * Gemini adapter, deliberately as thin as the OpenAI one: build the request,
 * ask for JSON, parse it, report usage. Validation belongs to the SchemaGuard.
 *
 * Bound to the vision tier only (spec: model routing). The cheap tier is at
 * price parity with OpenAI and would buy a second failure surface for nothing,
 * and planning keeps its frontier model.
 */
export class GeminiProvider implements AiProvider {
  readonly kind = 'gemini' as const;
  private readonly client: GoogleGenAI;

  constructor(
    apiKey: string,
    private readonly models: GeminiModels,
  ) {
    this.client = new GoogleGenAI({ apiKey });
  }

  async complete(request: StructuredRequest): Promise<StructuredResponse> {
    const model = this.models.vision;

    const parts: Array<Record<string, unknown>> = [{ text: request.user }];
    for (const image of request.images ?? []) {
      // The URL is a presigned GET; Gemini takes bytes, not a URL, so fetch it.
      const response = await fetch(image.url);
      const bytes = Buffer.from(await response.arrayBuffer());
      parts.push({
        inlineData: {
          mimeType: response.headers.get('content-type') ?? 'image/jpeg',
          data: bytes.toString('base64'),
        },
      });
    }

    if (request.repairOf) {
      parts.push({
        text:
          'Your previous response failed validation with error: ' +
          `${request.repairOf.error}\nPrevious output was:\n` +
          `${JSON.stringify(request.repairOf.previousRaw)}\n` +
          'Return corrected JSON that satisfies the required shape. JSON only.',
      });
    }

    let response;
    try {
      response = await this.client.models.generateContent({
        model,
        contents: [{ role: 'user', parts }],
        config: {
          systemInstruction: request.system,
          responseMimeType: 'application/json',
          maxOutputTokens: PROVIDER_MAX_OUTPUT_TOKENS[request.tier],
          abortSignal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS[request.tier]),
        },
      });
    } catch (error) {
      throw toProviderError(error, request.operation, model);
    }

    const meta = response.usageMetadata ?? {};
    const usage = {
      inputTokens: meta.promptTokenCount ?? 0,
      // Thinking tokens are billed as output but reported separately. Leaving
      // them out undercosts every call, in the direction that costs us money.
      outputTokens: (meta.candidatesTokenCount ?? 0) + (meta.thoughtsTokenCount ?? 0),
    };

    return { raw: this.parse(response.text ?? '{}'), usage, model };
  }

  /** Parse leniently — a fenced or prefixed body should not crash the pipeline. */
  private parse(content: string): unknown {
    try {
      return JSON.parse(content);
    } catch {
      const start = content.indexOf('{');
      const end = content.lastIndexOf('}');
      if (start >= 0 && end > start) {
        try {
          return JSON.parse(content.slice(start, end + 1));
        } catch {
          return { __unparseable: content };
        }
      }
      return { __unparseable: content };
    }
  }
}
```

Widen the union in `apps/api/src/ai/providers/ai-provider.interface.ts`:

```ts
export interface AiProvider {
  readonly kind: 'openai' | 'gemini' | 'mock' | 'routed';
  complete(request: StructuredRequest): Promise<StructuredResponse>;
}
```

- [ ] **Step 5: Run the test**

Run: `pnpm --filter @kitchen/api exec vitest run src/ai/providers/`
Expected: PASS. If the SDK's real response field names differ from the mock, fix the **adapter** to match the SDK and update the mock to match reality — never the other way round.

- [ ] **Step 6: Typecheck, lint, commit**

```bash
pnpm --filter @kitchen/api exec tsc --noEmit && pnpm --filter @kitchen/api exec eslint src
git add apps/api/src/ai/providers/ apps/api/package.json pnpm-lock.yaml
git commit -m "Add a Gemini provider for the vision tier"
```

---

## Task 5: Route by tier

`StructuredRequest` already carries `tier`, so dispatch can live entirely inside a provider. **If this task changes `AiGateway`, `SchemaGuard`, or any consuming service, the design has been missed** — the whole point is that they do not move.

**Files:**
- Create: `apps/api/src/ai/providers/routed.provider.ts`
- Create: `apps/api/src/ai/providers/__tests__/routed.provider.spec.ts`
- Modify: `apps/api/src/ai/ai.module.ts:99-110`
- Modify: `apps/api/src/config/env.ts`

**Interfaces:**
- Consumes: `AiProvider` from `./ai-provider.interface.js`; `GeminiProvider` from `./gemini.provider.js`; `OpenAiProvider` from `./openai.provider.js`.
- Produces: `class RoutedAiProvider implements AiProvider` with `readonly kind = 'routed'` and `constructor(bindings: Record<ModelTier, AiProvider>)`.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/ai/providers/__tests__/routed.provider.spec.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { RoutedAiProvider } from '../routed.provider.js';
import type { AiProvider, StructuredRequest } from '../ai-provider.interface.js';

function stub(name: string): AiProvider & { complete: ReturnType<typeof vi.fn> } {
  return {
    kind: 'mock',
    complete: vi.fn().mockResolvedValue({
      raw: { from: name },
      usage: { inputTokens: 1, outputTokens: 1 },
      model: name,
    }),
  } as never;
}

function request(tier: 'cheap' | 'vision' | 'planning'): StructuredRequest {
  return {
    operation: tier === 'vision' ? 'vision.recognize' : 'name.resolve',
    tier,
    system: 's',
    user: 'u',
  };
}

describe('RoutedAiProvider', () => {
  it('sends each tier to its bound provider', async () => {
    const cheap = stub('cheap-model');
    const vision = stub('vision-model');
    const planning = stub('planning-model');
    const routed = new RoutedAiProvider({ cheap, vision, planning });

    await routed.complete(request('cheap'));
    await routed.complete(request('vision'));
    await routed.complete(request('planning'));

    expect(cheap.complete).toHaveBeenCalledTimes(1);
    expect(vision.complete).toHaveBeenCalledTimes(1);
    expect(planning.complete).toHaveBeenCalledTimes(1);
  });

  it('returns the bound provider result unchanged', async () => {
    const vision = stub('vision-model');
    const routed = new RoutedAiProvider({ cheap: stub('c'), vision, planning: stub('p') });

    const result = await routed.complete(request('vision'));

    expect(result.model).toBe('vision-model');
    expect(result.raw).toEqual({ from: 'vision-model' });
  });

  it('does not swallow an error when no fallback is configured', async () => {
    const vision = stub('vision-model');
    vision.complete.mockRejectedValue(new Error('upstream down'));
    const routed = new RoutedAiProvider({ cheap: stub('c'), vision, planning: stub('p') });

    await expect(routed.complete(request('vision'))).rejects.toThrow('upstream down');
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter @kitchen/api exec vitest run src/ai/providers/__tests__/routed.provider.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `apps/api/src/ai/providers/routed.provider.ts`:

```ts
import type { ModelTier } from '../ai.constants.js';
import type {
  AiProvider,
  StructuredRequest,
  StructuredResponse,
} from './ai-provider.interface.js';

export type TierBindings = Record<ModelTier, AiProvider>;

/**
 * Dispatches a call to the provider bound to its tier.
 *
 * This exists so a second vendor can be introduced without touching anything
 * that consumes AI: it registers under the same AI_PROVIDER token, and
 * `StructuredRequest` already carries the tier, so AiGateway, SchemaGuard and
 * every service stay exactly as they were.
 */
export class RoutedAiProvider implements AiProvider {
  readonly kind = 'routed' as const;

  constructor(private readonly bindings: TierBindings) {}

  async complete(request: StructuredRequest): Promise<StructuredResponse> {
    return this.bindings[request.tier].complete(request);
  }
}
```

- [ ] **Step 4: Run the test**

Run: `pnpm --filter @kitchen/api exec vitest run src/ai/providers/__tests__/routed.provider.spec.ts`
Expected: PASS.

- [ ] **Step 5: Add the environment contract**

In `apps/api/src/config/env.ts`, beside the existing `OPENAI_*` keys:

```ts
  GEMINI_API_KEY: z.string().default(''),
  GEMINI_MODEL_VISION: z.string().default('gemini-3-flash'),
  /**
   * Which vendor serves the vision tier. Defaults to `openai` so a missing or
   * half-finished Gemini setup degrades to today's behaviour instead of failing.
   */
  AI_VISION_VENDOR: z.enum(['openai', 'gemini']).default('openai'),
```

And in the `superRefine` block, following the existing `OPENAI_API_KEY` guard:

```ts
  if (
    env.NODE_ENV === 'production' &&
    !env.AI_MOCK &&
    env.AI_VISION_VENDOR === 'gemini' &&
    env.GEMINI_API_KEY.trim() === ''
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['GEMINI_API_KEY'],
      message: 'is required when AI_VISION_VENDOR is gemini',
    });
  }
```

- [ ] **Step 6: Wire the module**

In `apps/api/src/ai/ai.module.ts`, replace the `AI_PROVIDER` factory. `AI_MOCK` is still checked first, so the offline path is untouched:

```ts
    {
      provide: AI_PROVIDER,
      inject: [ENV],
      useFactory: (env: Env) => {
        if (env.AI_MOCK) return new MockAiProvider();

        const openai = new OpenAiProvider(env.OPENAI_API_KEY, {
          cheap: env.OPENAI_MODEL_CHEAP,
          vision: env.OPENAI_MODEL_VISION,
          planning: env.OPENAI_MODEL_PLANNING,
        });

        const vision =
          env.AI_VISION_VENDOR === 'gemini'
            ? new GeminiProvider(env.GEMINI_API_KEY, { vision: env.GEMINI_MODEL_VISION })
            : openai;

        return new RoutedAiProvider({ cheap: openai, vision, planning: openai });
      },
    },
```

Add the two imports with `.js` extensions.

- [ ] **Step 7: Prove DI still boots**

The only spec that compiles the real provider graph is `src/testing/staff-routes.spec.ts`
(`Test.createTestingModule({ imports: [AppModule] }).compile()`). A spec that supplies a
provider with `useValue: new Thing(...)` constructs it directly and proves nothing.

```bash
pnpm --filter @kitchen/api exec vitest run src/testing/staff-routes.spec.ts
pnpm --filter @kitchen/api exec vitest run
pnpm --filter @kitchen/api exec tsc --noEmit && pnpm --filter @kitchen/api exec eslint src
```

Expected: all pass, all exit 0.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/ai/ apps/api/src/config/env.ts
git commit -m "Route each model tier to its own provider"
```

---

## Task 6: Fall back on vision, and bill what the failed attempt cost

A fallback that is not recorded is invisible spend. That is tolerable today and not tolerable once credits are priced off this ledger.

**Files:**
- Modify: `apps/api/src/ai/providers/ai-provider.interface.ts`
- Modify: `apps/api/src/ai/providers/routed.provider.ts`
- Modify: `apps/api/src/ai/validation/schema-guard.ts`
- Modify: `apps/api/src/ai/ai-gateway.service.ts`
- Test: `apps/api/src/ai/providers/__tests__/routed.provider.spec.ts` (append)

**Interfaces:**
- Consumes: `RoutedAiProvider` from Task 5; `readSpend` from `../ai-spend.js`; `BudgetService.record` from Task 1.
- Produces: `StructuredResponse.priorAttempts?: AiSpend[]`; `GuardedResult.priorAttempts?: AiSpend[]`; `RoutedAiProvider` constructor gains an optional second argument `fallbacks?: Partial<Record<ModelTier, AiProvider>>`.

- [ ] **Step 1: Write the failing tests**

Append to `apps/api/src/ai/providers/__tests__/routed.provider.spec.ts`:

```ts
describe('RoutedAiProvider fallback', () => {
  it('retries the vision tier on the fallback provider', async () => {
    const vision = stub('gemini');
    vision.complete.mockRejectedValue(new Error('gemini down'));
    const fallback = stub('openai');
    const routed = new RoutedAiProvider(
      { cheap: stub('c'), vision, planning: stub('p') },
      { vision: fallback },
    );

    const result = await routed.complete(request('vision'));

    expect(result.model).toBe('openai');
    expect(fallback.complete).toHaveBeenCalledTimes(1);
  });

  it('makes at most one hop', async () => {
    const vision = stub('gemini');
    vision.complete.mockRejectedValue(new Error('gemini down'));
    const fallback = stub('openai');
    fallback.complete.mockRejectedValue(new Error('openai down too'));
    const routed = new RoutedAiProvider(
      { cheap: stub('c'), vision, planning: stub('p') },
      { vision: fallback },
    );

    await expect(routed.complete(request('vision'))).rejects.toThrow('openai down too');
    expect(vision.complete).toHaveBeenCalledTimes(1);
    expect(fallback.complete).toHaveBeenCalledTimes(1);
  });

  it('does not fall back on cheap or planning', async () => {
    const cheap = stub('cheap');
    cheap.complete.mockRejectedValue(new Error('cheap down'));
    const fallback = stub('openai');
    const routed = new RoutedAiProvider(
      { cheap, vision: stub('v'), planning: stub('p') },
      { vision: fallback },
    );

    await expect(routed.complete(request('cheap'))).rejects.toThrow('cheap down');
    expect(fallback.complete).not.toHaveBeenCalled();
  });

  it('reports what the failed attempt already cost', async () => {
    // A model that answered unusably still billed us. Dropping that spend is
    // exactly the error a credit ledger cannot absorb.
    const vision = stub('gemini');
    const billed = Object.assign(new Error('bad output'), {});
    const { attachSpend } = await import('../../ai-spend.js');
    attachSpend(billed, { usage: { inputTokens: 900, outputTokens: 100 }, model: 'gemini' });
    vision.complete.mockRejectedValue(billed);

    const routed = new RoutedAiProvider(
      { cheap: stub('c'), vision, planning: stub('p') },
      { vision: stub('openai') },
    );

    const result = await routed.complete(request('vision'));

    expect(result.priorAttempts).toEqual([
      { usage: { inputTokens: 900, outputTokens: 100 }, model: 'gemini' },
    ]);
  });

  it('reports no prior attempts when the primary succeeded', async () => {
    const routed = new RoutedAiProvider(
      { cheap: stub('c'), vision: stub('gemini'), planning: stub('p') },
      { vision: stub('openai') },
    );

    const result = await routed.complete(request('vision'));

    expect(result.priorAttempts ?? []).toEqual([]);
  });
});
```

- [ ] **Step 2: Run and watch them fail**

Run: `pnpm --filter @kitchen/api exec vitest run src/ai/providers/__tests__/routed.provider.spec.ts`
Expected: FAIL — the constructor takes one argument and there is no `priorAttempts`.

- [ ] **Step 3: Extend the response type**

In `apps/api/src/ai/providers/ai-provider.interface.ts`, add to `StructuredResponse`:

```ts
  /**
   * Attempts that were billed but did not produce this response — currently a
   * vision call that failed over to the other vendor. Each carries its own
   * model id because two vendors bill at different rates, so these cannot be
   * summed into the successful call's usage without mispricing them.
   */
  priorAttempts?: AiSpend[];
```

Import the type: `import type { AiSpend } from '../ai-spend.js';`

- [ ] **Step 4: Implement the fallback**

Replace the body of `apps/api/src/ai/providers/routed.provider.ts`:

```ts
import type { ModelTier } from '../ai.constants.js';
import { readSpend } from '../ai-spend.js';
import type {
  AiProvider,
  StructuredRequest,
  StructuredResponse,
} from './ai-provider.interface.js';

export type TierBindings = Record<ModelTier, AiProvider>;

export class RoutedAiProvider implements AiProvider {
  readonly kind = 'routed' as const;

  constructor(
    private readonly bindings: TierBindings,
    /** Only the vision tier is configured with one. Exactly one hop, never a chain. */
    private readonly fallbacks: Partial<Record<ModelTier, AiProvider>> = {},
  ) {}

  async complete(request: StructuredRequest): Promise<StructuredResponse> {
    const primary = this.bindings[request.tier];
    const fallback = this.fallbacks[request.tier];

    if (!fallback) return primary.complete(request);

    try {
      return await primary.complete(request);
    } catch (error) {
      // A failed attempt may still have been billed; carry it so the gateway
      // can record it against its own model's rate.
      const spend = readSpend(error);
      const response = await fallback.complete(request);
      return spend ? { ...response, priorAttempts: [spend] } : response;
    }
  }
}
```

- [ ] **Step 5: Carry it through the guard**

In `apps/api/src/ai/validation/schema-guard.ts`, add to `GuardedResult`:

```ts
  /** Billed attempts that produced no usable answer. See StructuredResponse. */
  priorAttempts?: AiSpend[];
```

Import `AiSpend` alongside the existing `ai-spend.js` imports. Then include it in each of the two success returns — the single-call path and the repaired path — concatenating both calls' attempts on the latter:

```ts
    // first-parse success
    return {
      data: firstParse.data,
      usage: first.usage,
      model: first.model,
      attempts: 1,
      priorAttempts: first.priorAttempts,
    };
```

```ts
    // repaired success
    if (secondParse.success) {
      const priorAttempts = [...(first.priorAttempts ?? []), ...(second.priorAttempts ?? [])];
      return {
        data: secondParse.data,
        usage,
        model: second.model,
        attempts: 2,
        ...(priorAttempts.length > 0 ? { priorAttempts } : {}),
      };
    }
```

- [ ] **Step 6: Record a row per model**

In `apps/api/src/ai/ai-gateway.service.ts`, before the existing success `record` call, record each prior attempt separately. They must not be summed into the successful call: they were served by a different model at a different rate.

```ts
    for (const attempt of result.priorAttempts ?? []) {
      await this.budget.record({
        householdId: input.householdId,
        model: attempt.model,
        operation: input.operation,
        tier,
        usage: attempt.usage,
      });
    }
```

- [ ] **Step 7: Bind the fallback in the module**

In `apps/api/src/ai/ai.module.ts`, pass a vision fallback only when Gemini is actually serving vision:

```ts
        return new RoutedAiProvider(
          { cheap: openai, vision, planning: openai },
          env.AI_VISION_VENDOR === 'gemini' ? { vision: openai } : {},
        );
```

- [ ] **Step 8: Run everything, lint, commit**

```bash
pnpm --filter @kitchen/api exec vitest run
pnpm --filter @kitchen/api exec tsc --noEmit && pnpm --filter @kitchen/api exec eslint src
git add apps/api/src/ai/
git commit -m "Fall back to OpenAI on vision and bill the failed attempt"
```

---

## Task 7: Whole-workspace gate

**Files:** none changed unless a failure demands it.

- [ ] **Step 1: Build, typecheck, lint, test the whole workspace**

```bash
pnpm build && pnpm typecheck && pnpm lint && pnpm test
```

Expected: every command exits 0. `turbo` requires `packages/*/dist` before typecheck, lint or test, so run `build` first, in this order.

- [ ] **Step 2: Confirm the offline path still works**

`AI_MOCK` defaults to true, so the whole system must still run with no OpenAI or Gemini key:

```bash
pnpm --filter @kitchen/api exec vitest run src/testing/staff-routes.spec.ts
```

Expected: PASS — the real `AppModule` compiles with mock providers and no keys set.

- [ ] **Step 3: Commit only if something needed fixing**

```bash
git add -A && git commit -m "Fix fallout from the model routing gate"
```

---

## Verification

From the spec, and not satisfied by the test suite alone: **measure the saving**.

On a real pantry photo, compare `ai_usage` rows for one `vision.recognize` before and after:

1. `pnpm infra:up && pnpm db:migrate && pnpm db:seed`
2. With `AI_MOCK=false` and `AI_VISION_VENDOR=openai`, run one recognition on a full-size photo and record `input_tokens` and `cost_usd`.
3. Repeat with the client resize in place. Input tokens should fall several-fold.
4. Repeat with `AI_VISION_VENDOR=gemini`. Cost should fall roughly a further 40% on input.
5. Confirm the `ai_usage` row names the **Gemini** model id and is priced at the Gemini rate. If it still shows an OpenAI rate, Task 1 is wrong and must be fixed before any credit work is built on this ledger.

Also confirm on a dense **receipt** photo that 1024px has not cost recognition accuracy. If it has, `MAX_IMAGE_EDGE_PX` is a single exported constant in `apps/mobile/src/lib/image.ts`, pinned by its own test.

**Orientation, by hand.** The spec asks for a rotated fixture, but neither test environment can decode an image — the mobile suite is node-only with no native render harness, and `expo-image-manipulator` is native code. So this is a manual gate, and it is not optional: take a photo with the phone held **sideways**, upload it, and open the stored object. If it appears rotated, `expo-image-manipulator` is not baking EXIF orientation in and the resize is making recognition worse, not cheaper. Do not close Task 3 without doing this.
