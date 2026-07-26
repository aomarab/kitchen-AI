import type {
  Cuisine,
  DietaryPreference,
  HealthGoal,
  InventorySource,
  MealSlot,
  PlanScope,
  StorageLocationType,
} from '@kitchen/contracts';
import type { MessageKey } from '@kitchen/i18n';

export function dietKey(pref: DietaryPreference): MessageKey {
  return `diet.${pref}` as MessageKey;
}

export function cuisineKey(cuisine: Cuisine): MessageKey {
  return `cuisine.${cuisine}` as MessageKey;
}

export function healthGoalKey(goal: HealthGoal): MessageKey {
  return `healthGoal.${goal}` as MessageKey;
}

const LOCATION_KEYS: Record<StorageLocationType, MessageKey> = {
  fridge: 'inventory.locations.fridge',
  freezer: 'inventory.locations.freezer',
  pantry: 'inventory.locations.pantry',
  spice_rack: 'inventory.locations.spice_rack',
  other: 'inventory.locations.other',
};

export function locationKey(type: StorageLocationType): MessageKey {
  return LOCATION_KEYS[type];
}

const SOURCE_KEYS: Record<InventorySource, MessageKey> = {
  photo: 'web.kitchen.sources.photo',
  manual: 'web.kitchen.sources.manual',
  barcode: 'web.kitchen.sources.barcode',
  receipt: 'web.kitchen.sources.receipt',
};

export function sourceKey(source: InventorySource): MessageKey {
  return SOURCE_KEYS[source];
}

const SLOT_KEYS: Record<MealSlot, MessageKey> = {
  breakfast: 'plans.breakfast',
  lunch: 'plans.lunch',
  dinner: 'plans.dinner',
  snack: 'plans.snack',
};

export function slotKey(slot: MealSlot): MessageKey {
  return SLOT_KEYS[slot];
}

const SCOPE_KEYS: Record<PlanScope, MessageKey> = {
  daily: 'plans.daily',
  weekly: 'plans.weekly',
  monthly: 'plans.monthly',
};

export function scopeKey(scope: PlanScope): MessageKey {
  return SCOPE_KEYS[scope];
}
