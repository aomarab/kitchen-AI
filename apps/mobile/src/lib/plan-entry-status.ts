import type { MealPlanEntry } from '@kitchen/contracts';
import type { MessageKey } from '@kitchen/i18n';

export type PlanEntryStatusTone = 'success' | 'muted' | 'primary' | 'warn';

export interface PlanEntryStatus {
  tone: PlanEntryStatusTone;
  labelKey: MessageKey;
}

export function planEntryStatus(
  entry: Pick<MealPlanEntry, 'state' | 'fullyCovered'>,
): PlanEntryStatus {
  if (entry.state === 'cooked') return { tone: 'success', labelKey: 'plans.cooked' };
  if (entry.state === 'skipped') return { tone: 'muted', labelKey: 'plans.skipped' };
  if (entry.fullyCovered) return { tone: 'primary', labelKey: 'plans.fullyCovered' };
  return { tone: 'warn', labelKey: 'plans.regenerate' };
}
