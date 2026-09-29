export interface PlanEntryHaveBadgeEntry {
  readonly id: string;
  readonly fullyCovered: boolean;
}

export interface PlanEntryHaveBadgeCoverage {
  readonly coveredEntryIds: readonly string[];
  readonly uncoveredEntryIds: readonly string[];
  readonly shortfalls: readonly unknown[];
}

export type PlanEntryHaveBadge =
  | { readonly tone: 'success'; readonly labelKey: 'mobile.home.allInKitchen' }
  | { readonly tone: 'warn'; readonly labelKey: 'plans.missingItems'; readonly count: number };

export function planEntryHaveBadge(
  entry: PlanEntryHaveBadgeEntry,
  coverage?: PlanEntryHaveBadgeCoverage | null,
): PlanEntryHaveBadge | null {
  if (entry.fullyCovered || coverage?.coveredEntryIds.includes(entry.id)) {
    return { tone: 'success', labelKey: 'mobile.home.allInKitchen' };
  }
  if (!coverage?.uncoveredEntryIds.includes(entry.id)) return null;

  const count = coverage.shortfalls.length;
  return count > 0 ? { tone: 'warn', labelKey: 'plans.missingItems', count } : null;
}
