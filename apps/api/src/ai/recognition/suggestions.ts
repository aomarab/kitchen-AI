import type { IngredientCategory, StorageLocationType } from '@kitchen/contracts';

/** Default storage location for a category, used when no capture hint is given. */
const CATEGORY_LOCATION: Partial<Record<IngredientCategory, StorageLocationType>> = {
  vegetable: 'fridge',
  fruit: 'fridge',
  meat: 'fridge',
  poultry: 'fridge',
  seafood: 'fridge',
  dairy: 'fridge',
  egg: 'fridge',
  herb: 'fridge',
  frozen: 'freezer',
  spice: 'spice_rack',
  grain: 'pantry',
  legume: 'pantry',
  pasta: 'pantry',
  bread: 'pantry',
  canned: 'pantry',
  oil: 'pantry',
  condiment: 'pantry',
  sweetener: 'pantry',
  baking: 'pantry',
  nut: 'pantry',
  beverage: 'pantry',
};

/** Rough shelf life in days by category; null means effectively non-perishable. */
const CATEGORY_SHELF_DAYS: Partial<Record<IngredientCategory, number | null>> = {
  vegetable: 7,
  fruit: 7,
  herb: 5,
  meat: 3,
  poultry: 3,
  seafood: 2,
  dairy: 14,
  egg: 21,
  bread: 5,
  frozen: 120,
  grain: null,
  legume: null,
  pasta: null,
  spice: null,
  oil: null,
  condiment: null,
  sweetener: null,
  baking: null,
  canned: 365,
  nut: 180,
  beverage: 90,
};

export function suggestedLocation(
  category: IngredientCategory,
  hint?: StorageLocationType,
): StorageLocationType {
  return hint ?? CATEGORY_LOCATION[category] ?? 'other';
}

export function suggestedExpiry(category: IngredientCategory, today = new Date()): string | null {
  const days = CATEGORY_SHELF_DAYS[category];
  if (days == null) return null;
  const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
