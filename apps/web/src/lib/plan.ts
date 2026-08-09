import type { MealPlan, MealPlanEntry, MealSlot } from '@kitchen/contracts';

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** The weekly plan if present, else the first plan. */
export function primaryPlan(plans: MealPlan[] | undefined): MealPlan | undefined {
  if (!plans || plans.length === 0) return undefined;
  return plans.find((p) => p.scope === 'weekly') ?? plans[0];
}

export interface TonightMeal {
  plan: MealPlan;
  entry: MealPlanEntry;
}

/** Today's dinner (or the first meal today) across all plans. */
export function tonightMeal(plans: MealPlan[] | undefined): TonightMeal | undefined {
  const today = todayIso();
  for (const plan of plans ?? []) {
    const todays = plan.entries.filter((e) => e.date === today);
    const dinner = todays.find((e) => e.slot === 'dinner') ?? todays[0];
    if (dinner) return { plan, entry: dinner };
  }
  return undefined;
}

export interface WeekProgress {
  cooked: number;
  total: number;
}

export function weekProgress(plan: MealPlan | undefined): WeekProgress {
  if (!plan) return { cooked: 0, total: 0 };
  return {
    cooked: plan.entries.filter((e) => e.state === 'cooked').length,
    total: plan.entries.length,
  };
}

export const SLOT_ORDER: MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack'];

/** Entries for one date, ordered by slot. */
export function entriesForDate(plan: MealPlan, date: string): MealPlanEntry[] {
  return plan.entries
    .filter((e) => e.date === date)
    .sort((a, b) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot));
}

/** Unique sorted dates covered by a plan. */
export function planDates(plan: MealPlan): string[] {
  return [...new Set(plan.entries.map((e) => e.date))].sort();
}
