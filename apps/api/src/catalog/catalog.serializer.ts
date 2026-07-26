import type { Ingredient, IngredientCategory, Unit } from '@kitchen/contracts';
import { toIso } from '../common/serialization.js';

export interface IngredientRow {
  id: string;
  canonicalNameEn: string;
  canonicalNameAr: string;
  category: IngredientCategory;
  defaultUnit: Unit;
  aliases: string[];
  isStaple: boolean;
  createdAt: Date;
}

export function toIngredient(row: IngredientRow): Ingredient {
  return {
    id: row.id,
    canonicalNameEn: row.canonicalNameEn,
    canonicalNameAr: row.canonicalNameAr,
    category: row.category,
    defaultUnit: row.defaultUnit,
    aliases: row.aliases,
    isStaple: row.isStaple,
    createdAt: toIso(row.createdAt),
  };
}
