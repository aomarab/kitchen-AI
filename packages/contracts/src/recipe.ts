import { z } from 'zod';
import { ingredientSchema } from './catalog.js';
import { cuisineSchema } from './household.js';
import {
  isoDateTimeSchema,
  localeSchema,
  quantitySchema,
  unitSchema,
  uuidSchema,
} from './common.js';

/* ------------------------------------------------------------------ */
/* Recipe                                                              */
/* ------------------------------------------------------------------ */

export const recipeStepSchema = z.object({
  index: z.number().int().min(1),
  text: z.string().min(1),
  /** Optional hint shown as a timer button in cook mode. */
  durationMinutes: z.number().int().positive().nullable().default(null),
});
export type RecipeStep = z.infer<typeof recipeStepSchema>;

export const nutritionSchema = z.object({
  calories: z.number().nonnegative(),
  proteinG: z.number().nonnegative(),
  carbsG: z.number().nonnegative(),
  fatG: z.number().nonnegative(),
  fiberG: z.number().nonnegative().optional(),
});
export type Nutrition = z.infer<typeof nutritionSchema>;

export const recipeIngredientSchema = z.object({
  ingredient: ingredientSchema,
  quantity: quantitySchema,
  unit: unitSchema,
  optional: z.boolean().default(false),
  note: z.string().nullable().default(null),
  /** Populated by the API for the acting household. Drives the in-stock badge. */
  inStock: z.boolean().optional(),
  /** How much is short, in `unit`. Zero or absent when fully covered. */
  shortfall: quantitySchema.optional(),
});
export type RecipeIngredient = z.infer<typeof recipeIngredientSchema>;

export const recipeVideoSchema = z.object({
  youtubeId: z.string().min(5),
  title: z.string(),
  channel: z.string(),
  thumbnailUrl: z.string().url(),
  durationSeconds: z.number().int().positive().nullable(),
  locale: localeSchema,
});
export type RecipeVideo = z.infer<typeof recipeVideoSchema>;

export const difficultySchema = z.enum(['easy', 'medium', 'hard']);
export type Difficulty = z.infer<typeof difficultySchema>;

export const recipeSchema = z.object({
  id: uuidSchema,
  /** Null for globally shared recipes. */
  householdId: uuidSchema.nullable(),
  title: z.string().min(1),
  description: z.string(),
  /** Locale the returned `title`/`description`/`steps` are rendered in. */
  locale: localeSchema,
  steps: z.array(recipeStepSchema).min(1),
  ingredients: z.array(recipeIngredientSchema).min(1),
  prepMinutes: z.number().int().nonnegative(),
  cookMinutes: z.number().int().nonnegative(),
  servings: z.number().int().positive(),
  difficulty: difficultySchema,
  cuisine: cuisineSchema.nullable(),
  nutrition: nutritionSchema.nullable(),
  heroImageUrl: z.string().url().nullable(),
  videos: z.array(recipeVideoSchema).default([]),
  generatedBy: z.enum(['ai', 'user']),
  createdAt: isoDateTimeSchema,
});
export type Recipe = z.infer<typeof recipeSchema>;

/** Compact form used in plan grids and lists. */
export const recipeSummarySchema = recipeSchema.pick({
  id: true,
  title: true,
  locale: true,
  prepMinutes: true,
  cookMinutes: true,
  servings: true,
  difficulty: true,
  cuisine: true,
  heroImageUrl: true,
});
export type RecipeSummary = z.infer<typeof recipeSummarySchema>;

export const getRecipeQuerySchema = z.object({
  locale: localeSchema.optional(),
});
export type GetRecipeQuery = z.infer<typeof getRecipeQuerySchema>;

/** Marking a meal cooked deducts its ingredients from inventory (spec §4.2). */
export const markCookedRequestSchema = z.object({
  mealPlanEntryId: uuidSchema.nullable().default(null),
  servings: z.number().int().positive().optional(),
  /** When false, the recipe is logged as cooked without touching inventory. */
  deductInventory: z.boolean().default(true),
});
export type MarkCookedRequest = z.infer<typeof markCookedRequestSchema>;

export const markCookedResponseSchema = z.object({
  deductedItemIds: z.array(uuidSchema),
  /** Items the recipe needed that were not in stock and so were not deducted. */
  missingIngredientIds: z.array(uuidSchema),
});
export type MarkCookedResponse = z.infer<typeof markCookedResponseSchema>;
