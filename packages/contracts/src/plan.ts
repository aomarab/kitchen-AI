import { z } from 'zod';
import { recipeSummarySchema } from './recipe.js';
import { cuisineSchema } from './household.js';
import {
  isoDateSchema,
  isoDateTimeSchema,
  localeSchema,
  mealSlotSchema,
  planScopeSchema,
  quantitySchema,
  unitSchema,
  uuidSchema,
} from './common.js';

/* ------------------------------------------------------------------ */
/* Meal plan                                                           */
/* ------------------------------------------------------------------ */

export const mealPlanEntryStateSchema = z.enum(['planned', 'cooked', 'skipped']);
export type MealPlanEntryState = z.infer<typeof mealPlanEntryStateSchema>;

export const mealPlanEntrySchema = z.object({
  id: uuidSchema,
  planId: uuidSchema,
  date: isoDateSchema,
  slot: mealSlotSchema,
  recipe: recipeSummarySchema,
  servings: z.number().int().positive(),
  state: mealPlanEntryStateSchema,
  /**
   * True when every non-optional, non-staple ingredient is currently in stock.
   * Always true for daily plans (spec §5.4 Stage C).
   */
  fullyCovered: z.boolean(),
});
export type MealPlanEntry = z.infer<typeof mealPlanEntrySchema>;

export const planStatusSchema = z.enum(['generating', 'ready', 'failed']);
export type PlanStatus = z.infer<typeof planStatusSchema>;

export const mealPlanSchema = z.object({
  id: uuidSchema,
  householdId: uuidSchema,
  scope: planScopeSchema,
  startsOn: isoDateSchema,
  endsOn: isoDateSchema,
  status: planStatusSchema,
  locale: localeSchema,
  entries: z.array(mealPlanEntrySchema),
  createdAt: isoDateTimeSchema,
});
export type MealPlan = z.infer<typeof mealPlanSchema>;

/* ------------------------------------------------------------------ */
/* Generation                                                          */
/* ------------------------------------------------------------------ */

export const generatePlanRequestSchema = z.object({
  scope: planScopeSchema,
  startsOn: isoDateSchema,
  /** Defaults come from DEFAULT_SLOTS_BY_SCOPE when omitted. */
  slots: z.array(mealSlotSchema).min(1).optional(),
  /** Overrides the profile value for this plan only. */
  servings: z.number().int().min(1).max(20).optional(),
  cuisinePrefs: z.array(cuisineSchema).optional(),
  /** Ingredients to avoid for this plan only, on top of profile allergies. */
  excludeIngredientIds: z.array(uuidSchema).optional(),
  maxCookMinutes: z.number().int().min(5).max(480).optional(),
  locale: localeSchema.optional(),
});
export type GeneratePlanRequest = z.infer<typeof generatePlanRequestSchema>;

export const regenerateEntryRequestSchema = z.object({
  /** Avoid producing this recipe again. */
  excludeRecipeIds: z.array(uuidSchema).default([]),
  note: z.string().max(280).optional(),
});
export type RegenerateEntryRequest = z.infer<typeof regenerateEntryRequestSchema>;

export const updateEntryRequestSchema = z
  .object({
    date: isoDateSchema,
    slot: mealSlotSchema,
    servings: z.number().int().positive(),
    state: mealPlanEntryStateSchema,
  })
  .partial();
export type UpdateEntryRequest = z.infer<typeof updateEntryRequestSchema>;

export const listPlansQuerySchema = z.object({
  scope: planScopeSchema.optional(),
  /** Plans overlapping this date. */
  on: isoDateSchema.optional(),
  status: planStatusSchema.optional(),
  /**
   * Language to render the plan's recipes in. A plan is generated in one
   * language but read in whichever the reader has chosen, and the server holds
   * both, so the reader's choice has to travel with the request — without it a
   * plan is permanently stuck in the language it was created in.
   */
  locale: localeSchema.optional(),
});
export type ListPlansQuery = z.infer<typeof listPlansQuerySchema>;

export const getPlanQuerySchema = z.object({
  locale: localeSchema.optional(),
});
export type GetPlanQuery = z.infer<typeof getPlanQuerySchema>;

/* ------------------------------------------------------------------ */
/* Pantry coverage — powers the web pantry rail (spec §6.2)            */
/* ------------------------------------------------------------------ */

export const coverageShortfallSchema = z.object({
  ingredientId: uuidSchema,
  nameEn: z.string(),
  nameAr: z.string(),
  required: quantitySchema,
  available: quantitySchema,
  shortfall: quantitySchema,
  unit: unitSchema,
});
export type CoverageShortfall = z.infer<typeof coverageShortfallSchema>;

export const planCoverageSchema = z.object({
  planId: uuidSchema,
  /** Fraction of entries fully cookable from stock, 0..1. */
  coverageRatio: z.number().min(0).max(1),
  coveredEntryIds: z.array(uuidSchema),
  uncoveredEntryIds: z.array(uuidSchema),
  shortfalls: z.array(coverageShortfallSchema),
  /** Inventory items expiring inside the plan window, soonest first. */
  expiringSoonIngredientIds: z.array(uuidSchema),
});
export type PlanCoverage = z.infer<typeof planCoverageSchema>;

/* ------------------------------------------------------------------ */
/* Shopping list                                                       */
/* ------------------------------------------------------------------ */

export const shoppingListItemSchema = z.object({
  id: uuidSchema,
  planId: uuidSchema.nullable(),
  ingredientId: uuidSchema,
  nameEn: z.string(),
  nameAr: z.string(),
  quantity: quantitySchema,
  unit: unitSchema,
  purchased: z.boolean(),
  purchasedAt: isoDateTimeSchema.nullable(),
});
export type ShoppingListItem = z.infer<typeof shoppingListItemSchema>;

export const addShoppingItemsRequestSchema = z.object({
  planId: uuidSchema.nullable().default(null),
  items: z
    .array(
      z.object({
        ingredientId: uuidSchema,
        quantity: quantitySchema,
        unit: unitSchema,
      }),
    )
    .min(1)
    .max(200),
});
export type AddShoppingItemsRequest = z.infer<typeof addShoppingItemsRequestSchema>;

export const toggleShoppingItemRequestSchema = z.object({
  purchased: z.boolean(),
});
export type ToggleShoppingItemRequest = z.infer<typeof toggleShoppingItemRequestSchema>;

/** Moves purchased shopping items into inventory as `purchased` events. */
export const checkoutShoppingRequestSchema = z.object({
  itemIds: z.array(uuidSchema).min(1),
  locationId: uuidSchema,
});
export type CheckoutShoppingRequest = z.infer<typeof checkoutShoppingRequestSchema>;
