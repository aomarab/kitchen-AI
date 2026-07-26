import { z } from 'zod';

/* ------------------------------------------------------------------ */
/* Primitives                                                          */
/* ------------------------------------------------------------------ */

export const uuidSchema = z.string().uuid();
export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');
export const isoDateTimeSchema = z.string().datetime({ offset: true });

export const localeSchema = z.enum(['en', 'ar']);
export type Locale = z.infer<typeof localeSchema>;

export const LOCALES = localeSchema.options;
export const DEFAULT_LOCALE: Locale = 'en';

/** Text that exists in both supported languages. */
export const localizedTextSchema = z.object({
  en: z.string(),
  ar: z.string(),
});
export type LocalizedText = z.infer<typeof localizedTextSchema>;

/* ------------------------------------------------------------------ */
/* Units & quantities                                                  */
/* ------------------------------------------------------------------ */

export const unitSchema = z.enum([
  'g',
  'kg',
  'ml',
  'l',
  'piece',
  'bunch',
  'clove',
  'slice',
  'can',
  'jar',
  'packet',
  'bottle',
  'cup',
  'tbsp',
  'tsp',
  'pinch',
]);
export type Unit = z.infer<typeof unitSchema>;

/** Base unit each unit converts to, for coverage math. `null` = not convertible. */
export const UNIT_DIMENSION: Record<Unit, 'mass' | 'volume' | 'count'> = {
  g: 'mass',
  kg: 'mass',
  ml: 'volume',
  l: 'volume',
  cup: 'volume',
  tbsp: 'volume',
  tsp: 'volume',
  pinch: 'volume',
  piece: 'count',
  bunch: 'count',
  clove: 'count',
  slice: 'count',
  can: 'count',
  jar: 'count',
  packet: 'count',
  bottle: 'count',
};

export const quantitySchema = z.number().nonnegative().finite();

export const measureSchema = z.object({
  quantity: quantitySchema,
  unit: unitSchema,
});
export type Measure = z.infer<typeof measureSchema>;

/* ------------------------------------------------------------------ */
/* Domain enums                                                        */
/* ------------------------------------------------------------------ */

export const ingredientCategorySchema = z.enum([
  'vegetable',
  'fruit',
  'meat',
  'poultry',
  'seafood',
  'dairy',
  'egg',
  'grain',
  'legume',
  'pasta',
  'bread',
  'spice',
  'herb',
  'condiment',
  'oil',
  'sweetener',
  'nut',
  'beverage',
  'frozen',
  'canned',
  'baking',
  'other',
]);
export type IngredientCategory = z.infer<typeof ingredientCategorySchema>;

export const storageLocationTypeSchema = z.enum([
  'fridge',
  'freezer',
  'pantry',
  'spice_rack',
  'other',
]);
export type StorageLocationType = z.infer<typeof storageLocationTypeSchema>;

export const inventorySourceSchema = z.enum(['photo', 'manual', 'barcode', 'receipt']);
export type InventorySource = z.infer<typeof inventorySourceSchema>;

export const mealSlotSchema = z.enum(['breakfast', 'lunch', 'dinner', 'snack']);
export type MealSlot = z.infer<typeof mealSlotSchema>;

export const planScopeSchema = z.enum(['daily', 'weekly', 'monthly']);
export type PlanScope = z.infer<typeof planScopeSchema>;

/** Slots filled by default for each plan scope. See spec §5.4. */
export const DEFAULT_SLOTS_BY_SCOPE: Record<PlanScope, MealSlot[]> = {
  daily: ['breakfast', 'lunch', 'dinner'],
  weekly: ['breakfast', 'lunch', 'dinner'],
  monthly: ['lunch', 'dinner'],
};

/** A recipe may appear at most this many times in any rolling 7-day window. */
export const MAX_RECIPE_REPEATS_PER_WEEK = 2;

/* ------------------------------------------------------------------ */
/* Pagination                                                          */
/* ------------------------------------------------------------------ */

export const paginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export function paginatedSchema<T extends z.ZodTypeAny>(item: T) {
  return z.object({
    items: z.array(item),
    nextCursor: z.string().nullable(),
  });
}

/* ------------------------------------------------------------------ */
/* Error envelope                                                      */
/* ------------------------------------------------------------------ */

/**
 * Every non-2xx API response has this shape. `messageKey` is an i18n key from
 * `@kitchen/i18n` — the server never sends user-facing prose. See spec §8.
 */
export const errorCodeSchema = z.enum([
  'VALIDATION_FAILED',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'HOUSEHOLD_REQUIRED',
  'RATE_LIMITED',
  'QUOTA_EXCEEDED',
  'AI_UNAVAILABLE',
  'AI_INVALID_OUTPUT',
  'AI_NO_RESULT',
  'PLAN_INFEASIBLE',
  'EXTERNAL_SERVICE_ERROR',
  'JOB_FAILED',
  'INTERNAL_ERROR',
]);
export type ErrorCode = z.infer<typeof errorCodeSchema>;

export const errorEnvelopeSchema = z.object({
  code: errorCodeSchema,
  messageKey: z.string(),
  details: z.record(z.unknown()).optional(),
});
export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>;

/** HTTP status each error code maps to. Used by the API exception filter. */
export const ERROR_STATUS: Record<ErrorCode, number> = {
  VALIDATION_FAILED: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  HOUSEHOLD_REQUIRED: 428,
  RATE_LIMITED: 429,
  QUOTA_EXCEEDED: 429,
  AI_UNAVAILABLE: 503,
  AI_INVALID_OUTPUT: 502,
  AI_NO_RESULT: 422,
  PLAN_INFEASIBLE: 422,
  EXTERNAL_SERVICE_ERROR: 502,
  JOB_FAILED: 500,
  INTERNAL_ERROR: 500,
};

/* ------------------------------------------------------------------ */
/* Shared request helpers                                              */
/* ------------------------------------------------------------------ */

/** Header name carrying the acting household id. */
export const HOUSEHOLD_HEADER = 'x-household-id';

/** Header name carrying an idempotency key for job-creating requests. */
export const IDEMPOTENCY_HEADER = 'idempotency-key';

export const idParamSchema = z.object({ id: uuidSchema });
export type IdParam = z.infer<typeof idParamSchema>;
