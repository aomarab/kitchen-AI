import type { MealPlanEntry } from '@kitchen/contracts';
import type { MessageKey } from '@kitchen/i18n';

export type PlanEntryStatusTone = 'success' | 'neutral' | 'info' | 'warn';

export interface PlanEntryStatus {
  tone: PlanEntryStatusTone;
  labelKey: MessageKey;
}

export function planEntryStatus(
  entry: Pick<MealPlanEntry, 'state' | 'fullyCovered'>,
): PlanEntryStatus {
  if (entry.state === 'cooked') return { tone: 'success', labelKey: 'plans.cooked' };
  if (entry.state === 'skipped') return { tone: 'neutral', labelKey: 'plans.skipped' };
  if (entry.fullyCovered) return { tone: 'info', labelKey: 'plans.fullyCovered' };
  return { tone: 'warn', labelKey: 'plans.regenerate' };
}
