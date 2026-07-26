import { z } from 'zod';
import {
  ingredientCategorySchema,
  isoDateTimeSchema,
  paginationQuerySchema,
  unitSchema,
  uuidSchema,
} from './common.js';

/**
 * Global bilingual ingredient catalog. Vision output, receipt lines and barcode
 * lookups all resolve to a canonical row here, which is what makes pantry
 * coverage a deterministic SQL question rather than fuzzy string matching.
 * See spec §4.2.
 */
export const ingredientSchema = z.object({
  id: uuidSchema,
  canonicalNameEn: z.string().min(1),
  canonicalNameAr: z.string().min(1),
  category: ingredientCategorySchema,
  defaultUnit: unitSchema,
  aliases: z.array(z.string()).default([]),
  /**
   * Staples (water, salt, pepper, cooking oil, sugar, flour…) are assumed
   * available during plan validation unless the household marks them out of
   * stock. Without this, no daily plan would ever validate. See spec §5.4.
   */
  isStaple: z.boolean().default(false),
  createdAt: isoDateTimeSchema,
});
export type Ingredient = z.infer<typeof ingredientSchema>;

export const searchIngredientsQuerySchema = paginationQuerySchema.extend({
  q: z.string().min(1).max(80),
  category: ingredientCategorySchema.optional(),
});
export type SearchIngredientsQuery = z.infer<typeof searchIngredientsQuerySchema>;

export const createIngredientRequestSchema = z.object({
  canonicalNameEn: z.string().min(1).max(120),
  canonicalNameAr: z.string().min(1).max(120),
  category: ingredientCategorySchema,
  defaultUnit: unitSchema,
  aliases: z.array(z.string().min(1).max(120)).default([]),
  isStaple: z.boolean().default(false),
});
export type CreateIngredientRequest = z.infer<typeof createIngredientRequestSchema>;

/**
 * Result of resolving a free-text ingredient name (from vision, a receipt line,
 * or a barcode product title) against the catalog.
 */
export const ingredientMatchSchema = z.object({
  ingredientId: uuidSchema.nullable(),
  /** How the match was made; `created` means a new catalog row was inserted. */
  strategy: z.enum(['exact', 'alias', 'embedding', 'created', 'unresolved']),
  confidence: z.number().min(0).max(1),
  rawName: z.string(),
});
export type IngredientMatch = z.infer<typeof ingredientMatchSchema>;
