import type { Locale, MealSlot, PlanScope } from '@kitchen/contracts';

/**
 * Structured inputs the prompt builders turn into readable model prompts. The
 * same context objects are attached to the provider request so the mock can
 * assemble a request-aligned fixture. Prompts live in their own files and carry
 * a `version` so a wording change is traceable (spec quality bar).
 */

export interface PantryLine {
  /** Display name in the active locale — used verbatim in the prompt text. */
  name: string;
  /** Canonical English catalog name. Locale-independent key for coverage math. */
  nameEn: string;
  /** Canonical Arabic catalog name, so a synthesized dish reads natively. */
  nameAr: string;
  quantity: number;
  unit: string;
  /** ISO date or null. Soon-to-expire items must be prioritised. */
  expiresOn: string | null;
  isStaple: boolean;
}

export interface PlanConstraints {
  dietaryPrefs: string[];
  /** Free-text allergies the plan must never include. */
  allergies: string[];
  halal: boolean;
  cuisinePrefs: string[];
  householdSize: number;
  maxCookMinutes: number | null;
  /** Ingredient names to avoid for this plan only. */
  excludeNames: string[];
}

export interface PlanPromptContext {
  locale: Locale;
  scope: PlanScope;
  /** Dates to fill, ISO `YYYY-MM-DD`, ascending. */
  dates: string[];
  slots: MealSlot[];
  servings: number;
  constraints: PlanConstraints;
  pantry: PantryLine[];
  maxRepeatsPerWeek: number;
  /** Recipe titles already used earlier in a monthly plan; avoid repeating. */
  alreadyUsedTitles: string[];
  /** Free-form note from a per-entry regeneration request. */
  note?: string;
}

export interface VisionPromptContext {
  locale: Locale;
  locationHint?: 'fridge' | 'freezer' | 'pantry' | 'spice_rack';
}

export interface ReceiptExtractContext {
  locale: Locale;
}

export interface ReceiptMapContext {
  locale: Locale;
  rawLines: string[];
  /** Catalog candidates supplied in-prompt to constrain the mapping. */
  candidateNames: string[];
}

export interface NameResolveContext {
  locale: Locale;
  names: string[];
  /** Catalog candidates the model should map onto when possible. */
  candidateNames: string[];
}

export interface TranslateRecipeContext {
  fromLocale: Locale;
  toLocale: Locale;
  title: string;
  description: string;
  steps: string[];
}
