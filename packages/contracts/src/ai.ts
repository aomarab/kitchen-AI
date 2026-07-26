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
  brand: z.string().nullable(),
  imageUrl: z.string().url().nullable(),
  match: ingredientMatchSchema.nullable(),
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
  quantity: quantitySchema.nullable(),
  unit: unitSchema.nullable(),
  priceMinor: z.number().int().nullable(),
});
export type ReceiptLine = z.infer<typeof receiptLineSchema>;

export const receiptExtractionSchema = z.object({
  merchant: z.string().nullable(),
  purchasedOn: isoDateSchema.nullable(),
  currency: z.string().length(3).nullable(),
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
  cuisine: z.string().nullable(),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  prepMinutes: z.number().int().nonnegative(),
  cookMinutes: z.number().int().nonnegative(),
  servings: z.number().int().positive(),
  ingredients: z.array(
    z.object({
      name: z.string().min(1),
      quantity: quantitySchema,
      unit: unitSchema,
      optional: z.boolean(),
    }),
  ),
  steps: z.array(z.string().min(1)).min(1),
  nutritionPerServing: z
    .object({
      calories: z.number().nonnegative(),
      proteinG: z.number().nonnegative(),
      carbsG: z.number().nonnegative(),
      fatG: z.number().nonnegative(),
    })
    .nullable(),
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
