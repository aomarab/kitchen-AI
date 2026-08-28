import { z } from 'zod';
import { ingredientMatchSchema } from './catalog.js';
import {
  ingredientCategorySchema,
  isoDateSchema,
  isoDateTimeSchema,
  quantitySchema,
  unitSchema,
  uuidSchema,
} from './common.js';

/* ------------------------------------------------------------------ */
/* Jobs — long-running work never blocks a request (spec §3.3)         */
/* ------------------------------------------------------------------ */

export const jobTypeSchema = z.enum([
  'receipt.parse',
  'plan.generate',
  'recipe.translate',
  'video.fetch',
]);
export type JobType = z.infer<typeof jobTypeSchema>;

export const jobStatusSchema = z.enum(['queued', 'running', 'done', 'failed']);
export type JobStatus = z.infer<typeof jobStatusSchema>;

export const jobSchema = z.object({
  id: uuidSchema,
  type: jobTypeSchema,
  status: jobStatusSchema,
  /** 0..1. Best-effort; monthly plan generation reports per-week progress. */
  progress: z.number().min(0).max(1),
  resultRef: z
    .object({
      kind: z.enum(['meal_plan', 'recognition_session', 'recipe']),
      id: uuidSchema,
    })
    .nullable(),
  error: z
    .object({
      code: z.string(),
      messageKey: z.string(),
    })
    .nullable(),
  createdAt: isoDateTimeSchema,
  finishedAt: isoDateTimeSchema.nullable(),
});
export type Job = z.infer<typeof jobSchema>;

/* ------------------------------------------------------------------ */
/* Vision recognition                                                  */
/* ------------------------------------------------------------------ */

/**
 * Real gpt-5 returned `steps` as an array of objects — `{"step":1,"text":"…"}`
 * and friends — rather than plain strings, and did it again on the repair
 * attempt. The prompt now states the shape explicitly, which is the actual
 * fix; this keeps a well-formed instruction from being thrown away (at the
 * price of two calls) when the model decides to structure it anyway.
 *
 * Only unambiguous single-text objects are unwrapped. Anything else still
 * fails, so this cannot quietly turn nonsense into a recipe step.
 */
const STEP_TEXT_KEYS = ['text', 'instruction', 'step', 'description', 'content'] as const;

function coerceSteps(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  return value.map((step) => {
    if (typeof step === 'string') return step;
    if (step && typeof step === 'object') {
      for (const key of STEP_TEXT_KEYS) {
        const candidate = (step as Record<string, unknown>)[key];
        if (typeof candidate === 'string' && candidate.trim().length > 0) return candidate;
      }
    }
    return step;
  });
}

/**
 * A nullable field in a schema the *model* fills in, as opposed to one we fill
 * in ourselves. `.nullable()` alone demands the key be present carrying null,
 * and a model told a value is optional simply leaves the key out — real GPT-5
 * output dropped `nutritionPerServing` from every recipe it generated, which
 * failed validation, failed the repair, and cost two full-priced calls each
 * time. The prompt now asks for explicit nulls; this makes the omission
 * harmless if the model does it anyway. Output stays `T | null`, so nothing
 * downstream changes.
 */
function modelNullable<T extends z.ZodTypeAny>(schema: T) {
  return schema.nullish().default(null);
}

/**
 * Raw structured output from the vision model, before catalog resolution.
 * Kept separate from the API response so a model change cannot silently alter
 * the client contract.
 */
export const visionIngredientSchema = z.object({
  nameEn: z.string().min(1),
  nameAr: z.string().min(1),
  category: ingredientCategorySchema,
  estimatedQuantity: quantitySchema,
  unit: unitSchema,
  confidence: z.number().min(0).max(1),
});
export type VisionIngredient = z.infer<typeof visionIngredientSchema>;

export const visionResultSchema = z.object({
  ingredients: z.array(visionIngredientSchema),
});
export type VisionResult = z.infer<typeof visionResultSchema>;

/** One row in the user-facing review list. Never auto-committed (spec §5.1). */
export const recognizedItemSchema = z.object({
  tempId: z.string(),
  match: ingredientMatchSchema,
  nameEn: z.string(),
  nameAr: z.string(),
  category: ingredientCategorySchema,
  quantity: quantitySchema,
  unit: unitSchema,
  confidence: z.number().min(0).max(1),
  suggestedExpiresAt: isoDateSchema.nullable(),
  suggestedLocationType: z.enum(['fridge', 'freezer', 'pantry', 'spice_rack', 'other']),
  photoKey: z.string().nullable(),
});
export type RecognizedItem = z.infer<typeof recognizedItemSchema>;

export const recognitionSessionSchema = z.object({
  id: uuidSchema,
  items: z.array(recognizedItemSchema),
  /** Photo keys that produced no recognizable ingredients. */
  emptyPhotoKeys: z.array(z.string()).default([]),
  createdAt: isoDateTimeSchema,
});
export type RecognitionSession = z.infer<typeof recognitionSessionSchema>;

export const recognizeRequestSchema = z.object({
  photoKeys: z.array(z.string().min(1)).min(1).max(10),
  /** Hint from the capture screen; improves expiry and location suggestions. */
  locationHint: z.enum(['fridge', 'freezer', 'pantry', 'spice_rack']).optional(),
});
export type RecognizeRequest = z.infer<typeof recognizeRequestSchema>;

/* ------------------------------------------------------------------ */
/* Barcode                                                             */
/* ------------------------------------------------------------------ */

export const barcodeLookupQuerySchema = z.object({
  barcode: z.string().min(6).max(20).regex(/^\d+$/, 'Barcode must be numeric'),
});
export type BarcodeLookupQuery = z.infer<typeof barcodeLookupQuerySchema>;

export const barcodeLookupResponseSchema = z.object({
  found: z.boolean(),
  productName: z.string().nullable(),
  /**
   * The product's Arabic name, when the source record carries one. Confirming
   * an unmatched scan writes a row to the global `ingredients` table, so a
   * response with only one name gets that name filed under both languages for
   * every household — see `rawNameAr` on `inventoryItemInputSchema`.
   */
  productNameAr: z.string().nullable(),
  brand: z.string().nullable(),
  imageUrl: z.string().url().nullable(),
  match: ingredientMatchSchema.nullable(),
  /**
   * What kind of product this is. Only meaningful when `match` is null: a scan
   * that resolved to a catalog ingredient is already categorised. Null means
   * the source had no category we recognise, and the item falls back to
   * `other` exactly as it did before.
   */
  category: ingredientCategorySchema.nullable(),
  suggestedQuantity: quantitySchema.nullable(),
  suggestedUnit: unitSchema.nullable(),
});
export type BarcodeLookupResponse = z.infer<typeof barcodeLookupResponseSchema>;

/* ------------------------------------------------------------------ */
/* Receipt                                                             */
/* ------------------------------------------------------------------ */

export const receiptLineSchema = z.object({
  rawText: z.string(),
  nameGuess: z.string(),
  quantity: modelNullable(quantitySchema),
  unit: modelNullable(unitSchema),
  priceMinor: modelNullable(z.number().int()),
});
export type ReceiptLine = z.infer<typeof receiptLineSchema>;

export const receiptExtractionSchema = z.object({
  merchant: modelNullable(z.string()),
  purchasedOn: modelNullable(isoDateSchema),
  currency: modelNullable(z.string().length(3)),
  lines: z.array(receiptLineSchema),
});
export type ReceiptExtraction = z.infer<typeof receiptExtractionSchema>;

export const parseReceiptRequestSchema = z.object({
  photoKeys: z.array(z.string().min(1)).min(1).max(5),
});
export type ParseReceiptRequest = z.infer<typeof parseReceiptRequestSchema>;

/* ------------------------------------------------------------------ */
/* Plan generation model output                                        */
/* ------------------------------------------------------------------ */

/**
 * Stage-B structured output. Ingredients are returned by name and resolved
 * against the catalog before Stage-C validation runs. See spec §5.4.
 */
export const generatedRecipeSchema = z.object({
  title: z.string().min(1),
  description: z.string(),
  cuisine: modelNullable(z.string()),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  prepMinutes: z.number().int().nonnegative(),
  cookMinutes: z.number().int().nonnegative(),
  servings: z.number().int().positive(),
  ingredients: z.array(
    z.object({
      name: z.string().min(1),
      /**
       * Canonical English name, used only to match the global catalog.
       *
       * Without it an Arabic plan resolves Arabic names against an
       * English-seeded catalog, misses, and creates a duplicate row per
       * recipe — so the household's own pantry stops matching and coverage
       * reports a shortfall for food that is sitting in the fridge.
       * `modelNullable` because a model told a field may be absent omits it.
       */
      nameEn: modelNullable(z.string()),
      quantity: quantitySchema,
      unit: unitSchema,
      optional: z.boolean(),
    }),
  ),
  steps: z.preprocess(coerceSteps, z.array(z.string().min(1)).min(1)),
  nutritionPerServing: modelNullable(
    z.object({
      calories: z.number().nonnegative(),
      proteinG: z.number().nonnegative(),
      carbsG: z.number().nonnegative(),
      fatG: z.number().nonnegative(),
    }),
  ),
});
export type GeneratedRecipe = z.infer<typeof generatedRecipeSchema>;

export const generatedPlanEntrySchema = z.object({
  date: isoDateSchema,
  slot: z.enum(['breakfast', 'lunch', 'dinner', 'snack']),
  recipe: generatedRecipeSchema,
});
export type GeneratedPlanEntry = z.infer<typeof generatedPlanEntrySchema>;

export const generatedPlanSchema = z.object({
  entries: z.array(generatedPlanEntrySchema),
});
export type GeneratedPlan = z.infer<typeof generatedPlanSchema>;

/* ------------------------------------------------------------------ */
/* Usage accounting                                                    */
/* ------------------------------------------------------------------ */

export const aiUsageSummarySchema = z.object({
  householdId: uuidSchema,
  day: isoDateSchema,
  spentUsd: z.number().nonnegative(),
  budgetUsd: z.number().nonnegative(),
  callCount: z.number().int().nonnegative(),
});
export type AiUsageSummary = z.infer<typeof aiUsageSummarySchema>;
