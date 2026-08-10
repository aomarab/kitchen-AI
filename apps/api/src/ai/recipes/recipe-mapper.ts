import type {
  Cuisine,
  IngredientCategory,
  Locale,
  Nutrition,
  Recipe,
  RecipeIngredient,
  RecipeStep,
  RecipeSummary,
  RecipeVideo,
  Unit,
} from '@kitchen/contracts';
import { cuisineSchema } from '@kitchen/contracts';
import { dimensionOf, toBase } from '../planner/units.js';
import type { PantrySnapshot } from '../planner/types.js';

type StoredStep = { index: number; text: string; durationMinutes: number | null };

export interface RecipeRow {
  id: string;
  householdId: string | null;
  titleEn: string | null;
  titleAr: string | null;
  descriptionEn: string | null;
  descriptionAr: string | null;
  stepsEn: StoredStep[] | null;
  stepsAr: StoredStep[] | null;
  prepMinutes: number;
  cookMinutes: number;
  servings: number;
  difficulty: 'easy' | 'medium' | 'hard';
  cuisine: string | null;
  nutrition: Record<string, number> | null;
  generatedBy: 'ai' | 'user';
  createdAt: Date;
}

export interface RecipeIngredientRow {
  quantity: string;
  unit: Unit;
  optional: boolean;
  note: string | null;
  ingredient: {
    id: string;
    canonicalNameEn: string;
    canonicalNameAr: string;
    category: IngredientCategory;
    defaultUnit: Unit;
    aliases: string[];
    isStaple: boolean;
    createdAt: Date;
  };
}

export interface RecipeVideoRow {
  youtubeId: string;
  title: string;
  channel: string;
  thumbnailUrl: string;
  durationSeconds: number | null;
  locale: Locale;
}

export interface FullRecipeRow extends RecipeRow {
  ingredients: RecipeIngredientRow[];
  videos?: RecipeVideoRow[];
}

function pickText(locale: Locale, en: string | null, ar: string | null): string {
  const primary = locale === 'ar' ? ar : en;
  return primary ?? en ?? ar ?? '';
}

function pickSteps(locale: Locale, en: StoredStep[] | null, ar: StoredStep[] | null): RecipeStep[] {
  const primary = locale === 'ar' ? ar : en;
  const steps = primary ?? en ?? ar ?? [];
  return steps.map((s, i) => ({
    index: s.index ?? i + 1,
    text: s.text,
    durationMinutes: s.durationMinutes ?? null,
  }));
}

function toCuisine(value: string | null): Cuisine | null {
  const parsed = cuisineSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function toNutrition(value: Record<string, number> | null): Nutrition | null {
  if (!value) return null;
  return {
    calories: value.calories ?? 0,
    proteinG: value.proteinG ?? 0,
    carbsG: value.carbsG ?? 0,
    fatG: value.fatG ?? 0,
    ...(value.fiberG != null ? { fiberG: value.fiberG } : {}),
  };
}

export function toRecipeSummary(row: RecipeRow, locale: Locale): RecipeSummary {
  return {
    id: row.id,
    title: pickText(locale, row.titleEn, row.titleAr),
    locale,
    prepMinutes: row.prepMinutes,
    cookMinutes: row.cookMinutes,
    servings: row.servings,
    difficulty: row.difficulty,
    cuisine: toCuisine(row.cuisine),
    heroImageUrl: null,
  };
}

function toRecipeVideo(row: RecipeVideoRow): RecipeVideo {
  return {
    youtubeId: row.youtubeId,
    title: row.title,
    channel: row.channel,
    thumbnailUrl: row.thumbnailUrl,
    durationSeconds: row.durationSeconds,
    locale: row.locale,
  };
}

function toRecipeIngredient(
  row: RecipeIngredientRow,
  locale: Locale,
  snapshot?: PantrySnapshot,
): RecipeIngredient {
  const quantity = Number(row.quantity);
  const ing = row.ingredient;
  const base: RecipeIngredient = {
    ingredient: {
      id: ing.id,
      canonicalNameEn: ing.canonicalNameEn,
      canonicalNameAr: ing.canonicalNameAr,
      category: ing.category,
      defaultUnit: ing.defaultUnit,
      aliases: ing.aliases ?? [],
      isStaple: ing.isStaple,
      createdAt: ing.createdAt.toISOString(),
    },
    quantity,
    unit: row.unit,
    optional: row.optional,
    note: row.note,
  };

  if (snapshot) {
    if (ing.isStaple && !snapshot.outOfStockStapleIds.has(ing.id)) {
      base.inStock = true;
    } else {
      const entry = snapshot.byIngredientId.get(ing.id);
      const availableBase = entry && entry.dimension === dimensionOf(row.unit) ? entry.baseQuantity : 0;
      const requiredBase = toBase(quantity, row.unit);
      base.inStock = availableBase + 1e-6 >= requiredBase;
      if (!base.inStock) {
        base.shortfall = Math.round((requiredBase - availableBase) / toBase(1, row.unit) * 1000) / 1000;
      }
    }
  }

  return base;
}

export function toRecipe(row: FullRecipeRow, locale: Locale, snapshot?: PantrySnapshot): Recipe {
  const steps = pickSteps(locale, row.stepsEn, row.stepsAr);
  return {
    id: row.id,
    householdId: row.householdId,
    title: pickText(locale, row.titleEn, row.titleAr),
    description: pickText(locale, row.descriptionEn, row.descriptionAr),
    locale,
    steps: steps.length > 0 ? steps : [{ index: 1, text: pickText(locale, row.titleEn, row.titleAr), durationMinutes: null }],
    ingredients: row.ingredients.map((i) => toRecipeIngredient(i, locale, snapshot)),
    prepMinutes: row.prepMinutes,
    cookMinutes: row.cookMinutes,
    servings: row.servings,
    difficulty: row.difficulty,
    cuisine: toCuisine(row.cuisine),
    nutrition: toNutrition(row.nutrition),
    heroImageUrl: null,
    videos: (row.videos ?? []).map(toRecipeVideo),
    generatedBy: row.generatedBy,
    createdAt: row.createdAt.toISOString(),
  };
}
