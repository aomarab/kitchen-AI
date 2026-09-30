# Mobile Redesign · Plan 1: Vision Boxes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every item the vision model recognises can carry an optional, sanitised bounding box
(`RecognizedItem.box`), so the redesigned capture screen (Plan 4) can pin items on the photo and
fall back to a tray when there is no box.

**Architecture:** The vision prompt (`vision/v2`) asks the model for a loose `box` per item. The
contract parses that permissively, as `modelNullable(rawBoxSchema).catch(null)`, so a bad box can
never fail a scan or pay for a repair retry. `RecognitionService` then runs each raw box through a
pure `sanitizeBox()` into a strict `NormalizedBox`. The response field is `nullish`, so every other
producer of a `RecognizedItem` compiles unchanged. No routes, error codes, credit prices or database
columns change.

**Tech Stack:** zod 3 (`packages/contracts`), NestJS 11 + Vitest (`apps/api`), PostgreSQL 17 (one
integration spec only).

**Spec:** `docs/superpowers/specs/2026-09-27-mobile-apricot-bento-redesign-design.md`, §10 (vision
boxes) and §14 (fixture migration). Client-side use of the box (§10.4, `ArPins`, the tray) is
Plan 4, not this plan.

## Global Constraints

- Run every command from the repo root. Node >= 20 (CI uses 22). pnpm 10.34.5.
- **The contract change is its own commit** (Task 1) and lands before any screen work. Never edit
  `packages/contracts` from an app.
- **Box semantics:** normalised to the uploaded image stored at `photoKey`. The origin is top-left,
  and `x`, `y`, `w`, `h` are fractions of the image width and height. A valid box satisfies
  `x + w <= 1 + 1e-6` and `y + h <= 1 + 1e-6`.
- **Sanitising returns `null`** when:
  - the input is `null`
  - any value is non-finite
  - any value is below −0.05 or above 1.05 ("probably another scale, such as 0–1000. It is never
    rescaled on a guess")
- **Otherwise sanitising** clamps `x` and `y` to [0,1] and clips `w` and `h` to fit. It then
  rejects a `w` or `h` under 0.02, and an area over 0.9.
- **Prompt:** `VISION_PROMPT_VERSION` becomes `'vision/v2'`. The JSON shape the prompt asks for
  gains `"box"` after `"confidence"`, and the system prompt adds exactly this sentence. The rest of
  the prompt is unchanged:

  ```text
  "box" is {x,y,w,h} as fractions (0–1) of the image width and height, origin top-left, drawn tightly around the item. If several of the same item are visible, box the group. Use null if you cannot localise it.
  ```

- **No new** routes, error codes or credit prices (`CREDIT_COSTS` is unchanged).
- **Mock fixtures stay without boxes:** the API `MockVisionProvider` and the mobile MSW
  `mocks/data.ts`. A fixture box over a real photo would pin the wrong thing (§10.5).
- **Every model call goes through `AiGateway`.** Never call a provider directly.
- **API relative imports carry the `.js` extension** (`./box.js`), even though the output is
  CommonJS.
- **Format only the files you touched:**
  `npx prettier --config packages/config/prettier.config.mjs --write <paths>`. Never run
  `pnpm format`, which rewrites ~700 unrelated files.
- **Every commit message ends with the trailer**
  `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>`.

## Before you start

- [ ] **Install and build the shared packages.** The API resolves `@kitchen/contracts` from
      `packages/contracts/dist`, so the packages must be built before any API test or typecheck.

```bash
pnpm install --frozen-lockfile
pnpm exec turbo run build --filter='./packages/*'
```

Expected: turbo runs `@kitchen/config`, `@kitchen/contracts`, `@kitchen/i18n` and
`@kitchen/api-client` `build`, and all succeed.

## File map

| File                                                            | Responsibility                                                               |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `packages/contracts/src/ai.ts`                                  | `normalizedBoxSchema`, `RawVisionBox`, `box` on the vision item and response |
| `packages/contracts/src/ai.spec.ts` _(new)_                     | Contract behaviour of both box schemas                                       |
| `apps/api/src/ai/recognition/box.ts` _(new)_                    | `sanitizeBox()`, the only place a model box is trusted                       |
| `apps/api/src/ai/recognition/box.spec.ts` _(new)_               | Every sanitising rule                                                        |
| `apps/api/src/ai/prompts/vision.prompt.ts`                      | `vision/v2`: asks for `box`                                                  |
| `apps/api/src/ai/prompts/vision.prompt.spec.ts` _(new)_         | Pins the version and the box instruction                                     |
| `apps/api/src/ai/recognition/recognition.service.ts`            | Sets `box: sanitizeBox(item.box)` on each item                               |
| `apps/api/src/ai/__tests__/vision-box.spec.ts` _(new)_          | Integration: model JSON → gateway → service → item                           |
| `apps/api/src/ai/__tests__/real-model-output.spec.ts`           | v1 and v2 recorded outputs both parse                                        |
| `apps/api/src/credits/{cost-attribution,credit-debits}.spec.ts` | Typed `VisionResult` literals gain `box: null`                               |

---

### Task 1: Contract — optional box on vision items

**Files:**

- Modify: `packages/contracts/src/ai.ts:91-96, 103-108, 124-129`
- Create: `packages/contracts/src/ai.spec.ts`
- Modify: `apps/api/src/ai/__tests__/real-model-output.spec.ts:261-263` (append at end of file)
- Modify: `apps/api/src/credits/cost-attribution.spec.ts:88-93`
- Modify: `apps/api/src/credits/credit-debits.spec.ts:106-111`

**Interfaces:**

- Consumes: the existing private helper `modelNullable(schema)` in `ai.ts`
  (`schema.nullish().default(null)`).
- Produces, all exported from `@kitchen/contracts`:
  - `normalizedBoxSchema`: a zod object `{ x, y, w, h }` with the edge refine.
  - `type NormalizedBox = { x: number; y: number; w: number; h: number }`
  - `type RawVisionBox = { x: number; y: number; w: number; h: number }`, which Task 2 consumes.
  - `VisionIngredient['box']: RawVisionBox | null`. It is **required** in the output type, because
    the default fills it.
  - `RecognizedItem['box']?: NormalizedBox | null`. It is optional, so no other producer changes.

- [ ] **Step 1: Write the failing contract spec**

Create `packages/contracts/src/ai.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { normalizedBoxSchema, recognizedItemSchema, visionIngredientSchema } from './ai.js';

const ingredient = {
  nameEn: 'Tomato',
  nameAr: 'طماطم',
  category: 'vegetable',
  estimatedQuantity: 200,
  unit: 'g',
  confidence: 0.9,
};

const item = {
  tempId: 't1',
  match: { ingredientId: null, strategy: 'unresolved', confidence: 0, rawName: 'Tomato' },
  nameEn: 'Tomato',
  nameAr: 'طماطم',
  category: 'vegetable',
  quantity: 200,
  unit: 'g',
  confidence: 0.9,
  suggestedExpiresAt: null,
  suggestedLocationType: 'fridge',
  photoKey: 'h/photo.jpg',
};

describe('normalizedBoxSchema', () => {
  it('accepts a box that touches the right and bottom edges', () => {
    expect(normalizedBoxSchema.safeParse({ x: 0.6, y: 0.5, w: 0.4, h: 0.5 }).success).toBe(true);
  });

  it('rejects a box that runs off the image', () => {
    expect(normalizedBoxSchema.safeParse({ x: 0.7, y: 0.1, w: 0.4, h: 0.2 }).success).toBe(false);
    expect(normalizedBoxSchema.safeParse({ x: 0.1, y: 0.9, w: 0.2, h: 0.2 }).success).toBe(false);
  });

  it('rejects a zero-sized box', () => {
    expect(normalizedBoxSchema.safeParse({ x: 0.1, y: 0.1, w: 0, h: 0.2 }).success).toBe(false);
  });
});

describe('visionIngredientSchema box', () => {
  it('reads an omitted box as null, the way a v1 prompt answers', () => {
    const parsed = visionIngredientSchema.parse(ingredient);
    expect(parsed.box).toBeNull();
  });

  it('keeps a raw box as written, out-of-range values included, for the API to sanitise', () => {
    const parsed = visionIngredientSchema.parse({
      ...ingredient,
      box: { x: -0.01, y: 0.2, w: 0.3, h: 1.02 },
    });
    expect(parsed.box).toEqual({ x: -0.01, y: 0.2, w: 0.3, h: 1.02 });
  });

  it('drops a malformed box instead of failing the whole scan', () => {
    const parsed = visionIngredientSchema.safeParse({ ...ingredient, box: { x: '0.1', y: 0.2 } });
    expect(parsed.success).toBe(true);
    expect(parsed.data!.box).toBeNull();
  });
});

describe('recognizedItemSchema box', () => {
  it('parses an item from a server that predates boxes', () => {
    const parsed = recognizedItemSchema.safeParse(item);
    expect(parsed.success).toBe(true);
    expect(parsed.data!.box).toBeUndefined();
  });

  it('carries a normalised box through', () => {
    const box = { x: 0.1, y: 0.2, w: 0.3, h: 0.4 };
    expect(recognizedItemSchema.parse({ ...item, box }).box).toEqual(box);
  });

  it('refuses an unsanitised box on the client contract', () => {
    expect(
      recognizedItemSchema.safeParse({ ...item, box: { x: 0.9, y: 0, w: 0.5, h: 0.1 } }).success,
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Add the recorded-output cases to the API**

These pin what a real model sends: a v1 answer with no `box` key, and a v2 answer mixing a good
box, an explicit `null`, and a malformed array. Append to
`apps/api/src/ai/__tests__/real-model-output.spec.ts` (its imports already include
`visionResultSchema`):

```diff
--- a/apps/api/src/ai/__tests__/real-model-output.spec.ts
+++ b/apps/api/src/ai/__tests__/real-model-output.spec.ts
@@ -261,3 +261,41 @@ describe('sourcing rule matches what the planner will actually accept', () => {
     expect(system).toMatch(/never invent a filler recipe/i);
   });
 });
+
+/**
+ * `vision/v2` asks for a box per item. Both answers must keep parsing: a model
+ * that ignores the new field (or an old prompt still in a retry) must not start
+ * failing scans, and the new field must not be required to be well-formed.
+ */
+describe('vision output parses with and without boxes', () => {
+  const v1Item = {
+    nameEn: 'Roma tomato',
+    nameAr: 'طماطم روما',
+    category: 'vegetable',
+    estimatedQuantity: 400,
+    unit: 'g',
+    confidence: 0.81,
+  };
+
+  it('accepts a v1 answer with no box key at all', () => {
+    const parsed = visionResultSchema.safeParse({ ingredients: [v1Item] });
+    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
+    expect(parsed.data!.ingredients[0]!.box).toBeNull();
+  });
+
+  it('accepts a v2 answer mixing a box, an explicit null and a malformed box', () => {
+    const parsed = visionResultSchema.safeParse({
+      ingredients: [
+        { ...v1Item, box: { x: 0.12, y: 0.4, w: 0.3, h: 0.22 } },
+        { ...v1Item, nameEn: 'Labneh', box: null },
+        { ...v1Item, nameEn: 'Cucumber', box: [0.1, 0.2, 0.3, 0.4] },
+      ],
+    });
+    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
+    expect(parsed.data!.ingredients.map((i) => i.box)).toEqual([
+      { x: 0.12, y: 0.4, w: 0.3, h: 0.22 },
+      null,
+      null,
+    ]);
+  });
+});
```

- [ ] **Step 3: Run both and watch them fail**

```bash
pnpm --filter @kitchen/contracts exec vitest run src/ai.spec.ts
pnpm --filter @kitchen/api exec vitest run src/ai/__tests__/real-model-output.spec.ts
```

Expected for contracts: **8 failed | 1 passed (9)**.

- The `normalizedBoxSchema` cases fail with
  `TypeError: Cannot read properties of undefined (reading 'safeParse')`.
- The box cases fail with `AssertionError: expected undefined to be null`.
- "parses an item from a server that predates boxes" already passes. It pins today's behaviour, which the
  change must keep.

Expected for the API: **2 failed | 22 passed (24)**, with
`AssertionError: expected undefined to be null` and
`expected [ undefined, undefined, undefined ] to deeply equal [ …(3) ]`. Zod strips the unknown
`box` key today.

- [ ] **Step 4: Add the schemas**

Edit `packages/contracts/src/ai.ts`. Add the two box schemas directly below `modelNullable`, and
the `box` field to `visionIngredientSchema` and `recognizedItemSchema`:

```diff
--- a/packages/contracts/src/ai.ts
+++ b/packages/contracts/src/ai.ts
@@ -91,6 +91,32 @@ function modelNullable<T extends z.ZodTypeAny>(schema: T) {
   return schema.nullish().default(null);
 }

+/**
+ * Where an item sits in the photo it was recognised in, normalised to that
+ * uploaded image: origin top-left, every value a fraction of width or height.
+ * Drawn by the mobile capture screen as a pin; absent means "no position", and
+ * the client lists the item in its tray instead.
+ */
+export const normalizedBoxSchema = z
+  .object({
+    x: z.number().min(0).max(1),
+    y: z.number().min(0).max(1),
+    w: z.number().gt(0).max(1),
+    h: z.number().gt(0).max(1),
+  })
+  .refine((b) => b.x + b.w <= 1 + 1e-6 && b.y + b.h <= 1 + 1e-6, 'box exceeds image');
+export type NormalizedBox = z.infer<typeof normalizedBoxSchema>;
+
+/**
+ * The box as the model writes it: deliberately loose, and sanitised by the API
+ * before it reaches a client. A strict 0..1 schema here would fail the whole
+ * scan on one slightly out-of-range number and pay for a repair call, which is
+ * the failure `modelNullable` exists to avoid. `.catch(null)` extends that to a
+ * box that is malformed outright — a position is a nicety, never worth a retry.
+ */
+const rawBoxSchema = z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() });
+export type RawVisionBox = z.infer<typeof rawBoxSchema>;
+
 /**
  * Raw structured output from the vision model, before catalog resolution.
  * Kept separate from the API response so a model change cannot silently alter
@@ -103,6 +129,7 @@ export const visionIngredientSchema = z.object({
   estimatedQuantity: quantitySchema,
   unit: unitSchema,
   confidence: z.number().min(0).max(1),
+  box: modelNullable(rawBoxSchema).catch(null),
 });
 export type VisionIngredient = z.infer<typeof visionIngredientSchema>;

@@ -124,6 +151,12 @@ export const recognizedItemSchema = z.object({
   suggestedExpiresAt: isoDateSchema.nullable(),
   suggestedLocationType: z.enum(['fridge', 'freezer', 'pantry', 'spice_rack', 'other']),
   photoKey: z.string().nullable(),
+  /**
+   * Optional rather than defaulted, so every other producer of a
+   * `RecognizedItem` (receipts, barcode, mocks) compiles unchanged. Clients
+   * read `null` and `undefined` alike as "no box".
+   */
+  box: normalizedBoxSchema.nullish(),
 });
 export type RecognizedItem = z.infer<typeof recognizedItemSchema>;
```

Why `.catch(null)` and not a strict schema: the gateway's `SchemaGuard` retries once on a parse
failure, and that retry is a second full-price model call. A position is a nicety. A malformed box
must cost nothing, and simply produce "no box".

- [ ] **Step 5: Give the typed `VisionResult` literals their `box`**

`box` is required in the output type, so the two API specs that build a `VisionResult` by hand stop
compiling. Add `box: null` to each (untyped fixtures such as `vision.fixtures.ts` are parsed at
runtime, so they need nothing):

```diff
--- a/apps/api/src/credits/cost-attribution.spec.ts
+++ b/apps/api/src/credits/cost-attribution.spec.ts
@@ -88,6 +88,7 @@ const visionRaw: VisionResult = {
       estimatedQuantity: 200,
       unit: 'g',
       confidence: 0.95,
+      box: null,
     },
   ],
 };
```

```diff
--- a/apps/api/src/credits/credit-debits.spec.ts
+++ b/apps/api/src/credits/credit-debits.spec.ts
@@ -106,6 +106,7 @@ function makeRecognitionService(credits: CreditsService, gatewayImpl?: Partial<A
     estimatedQuantity: 200,
     unit: 'g',
     confidence: 0.95,
+    box: null,
   };
   const gateway = {
     execute: vi.fn(async () => ({ ingredients: [fakeIngredient] }) satisfies VisionResult),
```

- [ ] **Step 6: Rebuild contracts, then run the specs and every consumer's typecheck**

```bash
pnpm --filter @kitchen/contracts exec vitest run src/ai.spec.ts
pnpm --filter @kitchen/contracts build
pnpm --filter @kitchen/api exec vitest run src/ai/__tests__/real-model-output.spec.ts
pnpm --filter @kitchen/contracts typecheck && pnpm --filter @kitchen/contracts lint
pnpm --filter @kitchen/api typecheck && pnpm --filter @kitchen/api lint
pnpm --filter @kitchen/mobile typecheck && pnpm --filter @kitchen/web typecheck
```

Expected:

- contracts **9 passed (9)**
- API **24 passed (24)**
- every typecheck and lint exits 0

Mobile and web compile untouched because `RecognizedItem.box` is optional. The rebuild matters:
the API test reads `dist`, so skipping it re-runs the old schema.

- [ ] **Step 7: Format and commit**

```bash
npx prettier --config packages/config/prettier.config.mjs --write packages/contracts/src/ai.ts packages/contracts/src/ai.spec.ts apps/api/src/ai/__tests__/real-model-output.spec.ts apps/api/src/credits/cost-attribution.spec.ts apps/api/src/credits/credit-debits.spec.ts
git add packages/contracts/src/ai.ts packages/contracts/src/ai.spec.ts apps/api/src/ai/__tests__/real-model-output.spec.ts apps/api/src/credits/cost-attribution.spec.ts apps/api/src/credits/credit-debits.spec.ts
git commit -m "feat(contracts): optional vision box on recognised items" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 2: `sanitizeBox` — the only place a model box is trusted

**Files:**

- Create: `apps/api/src/ai/recognition/box.ts`
- Create: `apps/api/src/ai/recognition/box.spec.ts`

**Interfaces:**

- Consumes: `type RawVisionBox` and `type NormalizedBox` from `@kitchen/contracts` (Task 1).
- Produces: `sanitizeBox(raw: RawVisionBox | null | undefined): NormalizedBox | null`, exported
  from `apps/api/src/ai/recognition/box.ts`. Task 4 consumes it.

- [ ] **Step 1: Write the failing spec**

Create `apps/api/src/ai/recognition/box.spec.ts`. One case per rule in the Global Constraints,
plus the 0–1000 scale that must never be rescaled:

```ts
import { describe, expect, it } from 'vitest';
import { normalizedBoxSchema } from '@kitchen/contracts';
import { sanitizeBox } from './box.js';

describe('sanitizeBox', () => {
  it('passes a clean box through unchanged', () => {
    expect(sanitizeBox({ x: 0.1, y: 0.2, w: 0.3, h: 0.4 })).toEqual({
      x: 0.1,
      y: 0.2,
      w: 0.3,
      h: 0.4,
    });
  });

  it('returns null for no box', () => {
    expect(sanitizeBox(null)).toBeNull();
    expect(sanitizeBox(undefined)).toBeNull();
  });

  it('rejects non-finite values', () => {
    expect(sanitizeBox({ x: Number.NaN, y: 0.2, w: 0.3, h: 0.4 })).toBeNull();
    expect(sanitizeBox({ x: 0.1, y: 0.2, w: Number.POSITIVE_INFINITY, h: 0.4 })).toBeNull();
  });

  it('never rescales a box written in another scale', () => {
    // 0..1000 is the most common wrong answer from vision models.
    expect(sanitizeBox({ x: 120, y: 80, w: 300, h: 240 })).toBeNull();
    expect(sanitizeBox({ x: 0.1, y: 0.2, w: 1.2, h: 0.4 })).toBeNull();
    expect(sanitizeBox({ x: -0.2, y: 0.2, w: 0.3, h: 0.4 })).toBeNull();
  });

  it('clamps a slightly negative origin, keeping the far edge where the model drew it', () => {
    const box = sanitizeBox({ x: -0.03, y: 0.1, w: 0.33, h: 0.2 })!;
    expect(box.x).toBe(0);
    expect(box.w).toBeCloseTo(0.3, 10);
  });

  it('clips a box that runs just past the right and bottom edges', () => {
    const box = sanitizeBox({ x: 0.8, y: 0.9, w: 0.24, h: 0.14 })!;
    expect(box.w).toBeCloseTo(0.2, 10);
    expect(box.h).toBeCloseTo(0.1, 10);
  });

  it('rejects a box too thin to point at anything', () => {
    expect(sanitizeBox({ x: 0.5, y: 0.5, w: 0.01, h: 0.3 })).toBeNull();
    // Clipping can make a box thin too: this one is almost wholly off-frame.
    expect(sanitizeBox({ x: 0.99, y: 0.5, w: 0.05, h: 0.3 })).toBeNull();
  });

  it('rejects a box that covers the whole frame', () => {
    expect(sanitizeBox({ x: 0, y: 0, w: 1, h: 0.95 })).toBeNull();
  });

  it('always returns something the client contract accepts', () => {
    const inputs = [
      { x: 0.8, y: 0.9, w: 0.24, h: 0.14 },
      { x: -0.05, y: -0.05, w: 1.05, h: 0.5 },
      { x: 0.3333333, y: 0.6666667, w: 0.6666667, h: 0.3333333 },
    ];
    for (const raw of inputs) {
      const box = sanitizeBox(raw);
      if (box) expect(normalizedBoxSchema.safeParse(box).success, JSON.stringify(raw)).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
pnpm --filter @kitchen/api exec vitest run src/ai/recognition/box.spec.ts
```

Expected: FAIL, with no tests run.
`Error: Failed to load url ./box.js (resolved id: ./box.js) in …/box.spec.ts. Does the file exist?`

- [ ] **Step 3: Implement `sanitizeBox`**

Create `apps/api/src/ai/recognition/box.ts`:

```ts
import type { NormalizedBox, RawVisionBox } from '@kitchen/contracts';

/** How far past the frame a value may sit and still be read as rounding. */
const EDGE_TOLERANCE = 0.05;
/** Narrower than this is not a real localisation — a pin on a speck. */
const MIN_SIDE = 0.02;
/** The model boxed the whole frame, which says nothing about where the item is. */
const MAX_AREA = 0.9;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/**
 * Turns the model's box into one a client can draw, or `null` when it cannot be
 * trusted (vision spec §10.3).
 *
 * A value well outside 0..1 almost certainly means the model answered in
 * another scale — pixels, or 0..1000 — and it is dropped rather than rescaled on
 * a guess: a confident pin on the wrong item is worse than no pin, because the
 * tray still lists every item.
 */
export function sanitizeBox(raw: RawVisionBox | null | undefined): NormalizedBox | null {
  if (!raw) return null;
  const values = [raw.x, raw.y, raw.w, raw.h];
  if (!values.every(Number.isFinite)) return null;
  if (values.some((v) => v < -EDGE_TOLERANCE || v > 1 + EDGE_TOLERANCE)) return null;

  const x = clamp01(raw.x);
  const y = clamp01(raw.y);
  // Shrink by exactly what clamping the origin moved, so a box nudged past the
  // left edge keeps its right edge where the model drew it, then clip to the
  // frame. Written this way, an in-range box comes back bit-for-bit unchanged —
  // recomputing it from its far edge adds float drift (0.30000000000000004).
  const w = Math.min(raw.w - (x - raw.x), 1 - x);
  const h = Math.min(raw.h - (y - raw.y), 1 - y);

  if (w < MIN_SIDE || h < MIN_SIDE) return null;
  if (w * h > MAX_AREA) return null;
  return { x, y, w, h };
}
```

Note the clip: `w = Math.min(raw.w - (x - raw.x), 1 - x)`. It shortens `w` by exactly the amount
`x` was clamped, so the box's right edge does not move. Writing `Math.min(raw.w, 1 - x)` instead
would widen a box whose `x` was clamped from −0.04, which fails the "clamps a slightly negative origin, keeping the far edge where the model drew it"
case.

- [ ] **Step 4: Run it and watch it pass**

```bash
pnpm --filter @kitchen/api exec vitest run src/ai/recognition/box.spec.ts
pnpm --filter @kitchen/api typecheck && pnpm --filter @kitchen/api lint
```

Expected: **9 passed (9)**. Typecheck and lint exit 0.

- [ ] **Step 5: Format and commit**

```bash
npx prettier --config packages/config/prettier.config.mjs --write apps/api/src/ai/recognition/box.ts apps/api/src/ai/recognition/box.spec.ts
git add apps/api/src/ai/recognition/box.ts apps/api/src/ai/recognition/box.spec.ts
git commit -m "feat(api): sanitise vision boxes before they reach a client" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 3: Vision prompt v2 asks for a box

**Files:**

- Modify: `apps/api/src/ai/prompts/vision.prompt.ts:7-13, 17-25`
- Create: `apps/api/src/ai/prompts/vision.prompt.spec.ts`

**Interfaces:**

- Consumes: the existing `buildVisionPrompt({ locale })`, which returns a `BuiltPrompt`
  `{ version, system, … }`, and the exported `VISION_PROMPT_VERSION`.
- Produces: `VISION_PROMPT_VERSION === 'vision/v2'`. The version is an identifier for tests and
  debugging only: `AiGateway` neither stores it in `ai_usage` nor sends it to the provider, so the
  bump changes no ledger or analytics.

- [ ] **Step 1: Write the failing spec**

There is no prompt test today. Create `apps/api/src/ai/prompts/vision.prompt.spec.ts`. It is pure,
with no database and no Nest:

```ts
import { describe, expect, it } from 'vitest';
import { buildVisionPrompt, VISION_PROMPT_VERSION } from './vision.prompt.js';

describe('vision prompt', () => {
  it('is the version that asks for boxes', () => {
    expect(VISION_PROMPT_VERSION).toBe('vision/v2');
    expect(buildVisionPrompt({ locale: 'en' }).version).toBe('vision/v2');
  });

  it('asks for a box in the output shape and defines its coordinate space', () => {
    const { system } = buildVisionPrompt({ locale: 'en' });
    expect(system).toContain('"box"');
    expect(system).toContain('fractions (0–1)');
    expect(system).toContain('origin top-left');
    expect(system).toContain('Use null if you cannot localise it');
  });

  it('asks for boxes in Arabic sessions too', () => {
    expect(buildVisionPrompt({ locale: 'ar' }).system).toContain('"box"');
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
pnpm --filter @kitchen/api exec vitest run src/ai/prompts/vision.prompt.spec.ts
```

Expected: **3 failed (3)**, with `AssertionError: expected 'vision/v1' to be 'vision/v2'` and,
twice, `expected 'You identify food ingredients visible…' to contain '"box"'`.

- [ ] **Step 3: Bump the version and add the box instruction**

```diff
--- a/apps/api/src/ai/prompts/vision.prompt.ts
+++ b/apps/api/src/ai/prompts/vision.prompt.ts
@@ -7,7 +7,7 @@ import { type BuiltPrompt, localeDirective } from './prompt.shared.js';
  * result is always a review list — never auto-committed — so an unsure guess is
  * acceptable as long as confidence reflects it.
  */
-export const VISION_PROMPT_VERSION = 'vision/v1';
+export const VISION_PROMPT_VERSION = 'vision/v2';

 export function buildVisionPrompt(ctx: VisionPromptContext): BuiltPrompt {
   const hint = ctx.locationHint
@@ -17,9 +17,13 @@ export function buildVisionPrompt(ctx: VisionPromptContext): BuiltPrompt {
   const system = [
     'You identify food ingredients visible in kitchen photos (fridge, pantry, spice rack).',
     'Return JSON {"ingredients":[{"nameEn","nameAr","category","estimatedQuantity","unit",' +
-      '"confidence"}]}. Give both an English and an Arabic name for every item. Category must be ' +
-      'one of the known ingredient categories. Quantity is a best-effort estimate; set a low ' +
-      'confidence when unsure. Never invent items you cannot see — return an empty array instead.',
+      '"confidence","box"}]}. Give both an English and an Arabic name for every item. Category ' +
+      'must be one of the known ingredient categories. Quantity is a best-effort estimate; set a ' +
+      'low confidence when unsure. Never invent items you cannot see — return an empty array ' +
+      'instead.',
+    '"box" is {x,y,w,h} as fractions (0–1) of the image width and height, origin top-left, ' +
+      'drawn tightly around the item. If several of the same item are visible, box the group. ' +
+      'Use null if you cannot localise it.',
     localeDirective(ctx.locale),
   ].join('\n\n');
```

- [ ] **Step 4: Run it and watch it pass**

```bash
pnpm --filter @kitchen/api exec vitest run src/ai/prompts/vision.prompt.spec.ts src/ai/__tests__/real-model-output.spec.ts
pnpm --filter @kitchen/api typecheck && pnpm --filter @kitchen/api lint
```

Expected: **27 passed (27)** across the two files. Typecheck and lint exit 0.

- [ ] **Step 5: Format and commit**

```bash
npx prettier --config packages/config/prettier.config.mjs --write apps/api/src/ai/prompts/vision.prompt.ts apps/api/src/ai/prompts/vision.prompt.spec.ts
git add apps/api/src/ai/prompts/vision.prompt.ts apps/api/src/ai/prompts/vision.prompt.spec.ts
git commit -m "feat(api): vision prompt v2 asks for a box per item" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 4: Carry the sanitised box onto recognised items

**Files:**

- Modify: `apps/api/src/ai/recognition/recognition.service.ts:20-25, 138-143`
- Create: `apps/api/src/ai/__tests__/vision-box.spec.ts`

**Interfaces:**

- Consumes: `sanitizeBox` (Task 2); `RecognitionService(db, catalog, gateway, storage, credits)`.
  The service dedupes items by `nameEn` with the first photo winning. It throws
  `AppError('AI_NO_RESULT', 'errors.AI_NO_RESULT', { emptyPhotoKeys })` when no photo yields
  anything.
- Produces: each `RecognizedItem` from `RecognitionService.recognize` carries
  `box: NormalizedBox | null`, relative to that item's `photoKey`.

- [ ] **Step 1: Start the database**

The new spec is an integration spec. It seeds a user and household and runs the real `AiGateway`,
`SchemaGuard`, `BudgetService` and `CreditsService` against Postgres, with only the model provider
stubbed.

```bash
test -f .env || cp .env.example .env
pnpm infra:up
pnpm db:migrate && pnpm db:seed
```

Expected: `Migrations applied.`, then `Seeded 500 new and refreshed 0 existing ingredients.` on a
fresh database. A reused one reports the 500 as refreshed instead.

If MinIO's host ports 9000/9001 are already taken by another local stack, `infra:up` fails on
MinIO. This spec only needs Postgres and Redis, so run `docker compose up -d postgres redis`
instead.

- [ ] **Step 2: Write the failing integration spec**

Create `apps/api/src/ai/__tests__/vision-box.spec.ts`:

```ts
import { afterAll, describe, expect, it, vi } from 'vitest';
import type { RecognizedItem } from '@kitchen/contracts';
import { createTestContext, seedHousehold, seedUser, cleanup } from '../../testing/harness.js';
import { CreditsService } from '../../credits/credits.service.js';
import { AppError } from '../../common/errors.js';
import { AiGateway } from '../ai-gateway.service.js';
import { SchemaGuard } from '../validation/schema-guard.js';
import { BudgetService } from '../usage/budget.service.js';
import { DrizzleUsageRepository } from '../usage/usage.repository.js';
import { RecognitionService } from '../recognition/recognition.service.js';
import type { AiProvider } from '../providers/ai-provider.interface.js';
import type { IngredientResolverPort } from '../catalog/ingredient-resolver.port.js';
import type { StorageService } from '../../storage/storage.service.js';
import type { Env } from '../../config/env.js';

/**
 * The vision box travels model → SchemaGuard → sanitizeBox → session. These run
 * the real gateway and guard behind a stub provider, so the raw JSON is parsed
 * by the same code that parses a real model's answer.
 */

const ctx = createTestContext();
const createdHouseholds: string[] = [];
const createdUsers: string[] = [];

afterAll(async () => {
  await cleanup(ctx.db, { households: createdHouseholds, users: createdUsers });
  await ctx.client.end();
});

async function seedCtx() {
  const userId = await seedUser(ctx.db);
  const householdId = await seedHousehold(ctx.db, userId);
  createdUsers.push(userId);
  createdHouseholds.push(householdId);
  return { userId, householdId, credits: new CreditsService(ctx.db) };
}

function serviceReturning(raw: unknown, credits: CreditsService) {
  const provider: AiProvider = {
    kind: 'mock',
    complete: vi.fn(async () => ({
      raw,
      usage: { inputTokens: 1000, outputTokens: 500 },
      model: 'gpt-5-mini',
    })),
  };
  const budget = new BudgetService(new DrizzleUsageRepository(ctx.db), {
    AI_DAILY_BUDGET_USD: 100,
  } as Env);
  const gateway = new AiGateway(provider, new SchemaGuard(), budget);
  const catalog = {
    resolve: vi.fn(async (names: { name: string }[]) =>
      names.map((n) => ({
        rawName: n.name,
        ingredient: null,
        strategy: 'unresolved' as const,
        confidence: 0,
      })),
    ),
  } as unknown as IngredientResolverPort;
  const storage = {
    providerImageUrl: vi.fn(async () => 'https://example.com/photo.jpg'),
  } as unknown as StorageService;
  return new RecognitionService(ctx.db, catalog, gateway, storage, credits);
}

const tomato = {
  nameEn: 'Tomato',
  nameAr: 'طماطم',
  category: 'vegetable',
  estimatedQuantity: 200,
  unit: 'g',
  confidence: 0.95,
};

function byName(items: RecognizedItem[], name: string) {
  return items.find((i) => i.nameEn === name)!;
}

describe('recognition carries the vision box', () => {
  it('sanitises a box onto the item and nulls the ones it cannot trust', async () => {
    const { userId, householdId, credits } = await seedCtx();
    const raw = {
      ingredients: [
        { ...tomato, box: { x: -0.02, y: 0.1, w: 0.32, h: 0.2 } },
        { ...tomato, nameEn: 'Labneh', category: 'dairy', box: { x: 100, y: 80, w: 300, h: 200 } },
        { ...tomato, nameEn: 'Cucumber' },
      ],
    };

    const session = await serviceReturning(raw, credits).recognize({
      householdId,
      userId,
      request: { photoKeys: ['a.jpg'] },
    });

    const box = byName(session.items, 'Tomato').box!;
    expect(box.x).toBe(0);
    expect(box.w).toBeCloseTo(0.3, 10);
    expect(byName(session.items, 'Labneh').box).toBeNull();
    expect(byName(session.items, 'Cucumber').box).toBeNull();
  });

  it('still refuses an all-empty scan with the photos that found nothing', async () => {
    const { userId, householdId, credits } = await seedCtx();
    const attempt = serviceReturning({ ingredients: [] }, credits).recognize({
      householdId,
      userId,
      request: { photoKeys: ['a.jpg', 'b.jpg'] },
    });

    await expect(attempt).rejects.toBeInstanceOf(AppError);
    await expect(attempt).rejects.toMatchObject({
      code: 'AI_NO_RESULT',
      details: { emptyPhotoKeys: ['a.jpg', 'b.jpg'] },
    });
  });
});
```

- [ ] **Step 3: Run it and watch it fail**

```bash
pnpm --filter @kitchen/api exec vitest run src/ai/__tests__/vision-box.spec.ts
```

Expected: **1 failed | 1 passed (2)**.

- "sanitises a box onto the item…" fails with
  `TypeError: Cannot read properties of undefined (reading 'x')`, because the service does not copy
  the box yet.
- The `AI_NO_RESULT` case passes already. It is a characterisation test: adding boxes must not
  change what an empty scan does.

- [ ] **Step 4: Set the box on every item the service builds**

```diff
--- a/apps/api/src/ai/recognition/recognition.service.ts
+++ b/apps/api/src/ai/recognition/recognition.service.ts
@@ -20,6 +20,7 @@ import { CATALOG_PORT } from '../ai.constants.js';
 import type { IngredientResolverPort } from '../catalog/ingredient-resolver.port.js';
 import { buildVisionPrompt } from '../prompts/vision.prompt.js';
 import { runInBillingContext } from '../usage/billing-context.js';
+import { sanitizeBox } from './box.js';
 import { suggestedExpiry, suggestedLocation } from './suggestions.js';

 export interface RecognizeInput {
@@ -138,6 +139,9 @@ export class RecognitionService {
           hint as StorageLocationType | undefined,
         ),
         photoKey,
+        // Relative to `photoKey`'s image, which is why deduplication above
+        // keeps the first photo's item: its box and its key must agree.
+        box: sanitizeBox(item.box),
       };
     });
```

- [ ] **Step 5: Run the vision specs, then the whole API suite**

```bash
pnpm --filter @kitchen/api exec vitest run src/ai/__tests__/vision-box.spec.ts src/ai/recognition src/ai/prompts src/ai/__tests__/real-model-output.spec.ts src/credits/cost-attribution.spec.ts src/credits/credit-debits.spec.ts
pnpm --filter @kitchen/api test
pnpm --filter @kitchen/api typecheck && pnpm --filter @kitchen/api lint
```

Expected:

- Every listed file passes.
- The full suite passes. At the time of writing that was **80 files, 778 tests**.
- `[Nest] … ERROR [PlanProcessor] job … failed` lines in the output are expected. They come from
  specs that fail jobs on purpose.
- Typecheck and lint exit 0.

- [ ] **Step 6: Format and commit**

```bash
npx prettier --config packages/config/prettier.config.mjs --write apps/api/src/ai/recognition/recognition.service.ts apps/api/src/ai/__tests__/vision-box.spec.ts
git add apps/api/src/ai/recognition/recognition.service.ts apps/api/src/ai/__tests__/vision-box.spec.ts
git commit -m "feat(api): carry the sanitised vision box onto recognised items" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Done when

- [ ] CI's four gates pass locally: `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm test` (with
      the database from Task 4 running).
- [ ] `git log --oneline -4` shows the four commits above, the contract first.
- [ ] `git grep -n "box" -- apps/api/src/ai/fixtures/vision.fixtures.ts apps/api/src/ai/providers/mock.provider.ts apps/mobile/src/mocks/data.ts`
      returns nothing. The mock fixtures stay box-free (§10.5).
