import { weekBars } from './home-stats';

export type DayPart = 'morning' | 'afternoon' | 'evening' | 'night';

export function dayPart(date: Date): DayPart {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 22) return 'evening';
  return 'night';
}

export function firstName(displayName?: string | null): string | null {
  const trimmed = displayName?.trim();
  if (!trimmed) return null;
  return trimmed.split(/\s+/)[0] ?? null;
}

export interface HomePlanEntry {
  readonly date: string;
  readonly slot: string;
}

export function tonightEntry<T extends HomePlanEntry>(
  entries: readonly T[],
  today: string,
): T | undefined {
  const todays = entries.filter((entry) => entry.date === today);
  return todays.find((entry) => entry.slot === 'dinner') ?? todays[0];
}

export interface PantryRecipe {
  readonly ingredients: readonly {
    readonly optional?: boolean;
    readonly inStock?: boolean;
  }[];
}

export type PantryLine = { key: 'usesYourItems'; count: number } | { key: 'allInKitchen' } | null;

export function pantryLine(recipe: PantryRecipe | undefined, fullyCovered: boolean): PantryLine {
  if (recipe) {
    return {
      key: 'usesYourItems',
      count: recipe.ingredients.filter(
        (ingredient) => ingredient.optional !== true && ingredient.inStock === true,
      ).length,
    };
  }
  return fullyCovered ? { key: 'allInKitchen' } : null;
}

export function tonightLabel({
  chip,
  title,
  minutes,
  pantryLine: pantry,
}: {
  chip: string;
  title: string;
  minutes: string;
  pantryLine?: string | null;
}): string {
  return [chip, title, minutes, pantry].filter(Boolean).join(', ');
}

export function useSoonPreview<T>(items: readonly T[]): T[] {
  return items.slice(0, 3);
}

export interface UseSoonLabelItem {
  readonly name: string;
  readonly expiryLabel: string | null;
}

export function useSoonLabel({
  heading,
  countLabel,
  emptyLabel,
  items,
}: {
  heading: string;
  countLabel?: string | null;
  emptyLabel?: string | null;
  items: readonly UseSoonLabelItem[];
}): string {
  if (items.length === 0) return emptyLabel ? `${heading}, ${emptyLabel}` : heading;
  const list = items
    .map((item) => (item.expiryLabel ? `${item.name}, ${item.expiryLabel}` : item.name))
    .join('; ');
  return countLabel ? `${heading}, ${countLabel}: ${list}` : `${heading}: ${list}`;
}

export interface WeekProgressPlan {
  readonly startsOn: string;
  readonly entries: readonly {
    readonly date: string;
    readonly state: 'planned' | 'cooked' | 'skipped';
  }[];
}

export interface WeekProgress {
  readonly cooked: number;
  readonly total: number;
}

export function weekProgress(plan: WeekProgressPlan | null | undefined): WeekProgress | null {
  if (!plan) return null;
  const bars = weekBars(plan.entries, plan.startsOn);
  const total = bars.reduce((sum, bar) => sum + bar.planned, 0);
  if (total === 0) return null;
  return {
    cooked: bars.reduce((sum, bar) => sum + bar.cooked, 0),
    total,
  };
}
