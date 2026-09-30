import { describe, expect, it } from 'vitest';
import type { MealPlanEntry } from '@kitchen/contracts';
import { planEntryStatus } from './plan-entry-status';

function entry(
  state: MealPlanEntry['state'],
  fullyCovered: boolean,
): Pick<MealPlanEntry, 'state' | 'fullyCovered'> {
  return { state, fullyCovered };
}

describe('planEntryStatus', () => {
  it('shows cooked before every other status', () => {
    expect(planEntryStatus(entry('cooked', true))).toEqual({
      tone: 'success',
      labelKey: 'plans.cooked',
    });
  });

  it('shows skipped before the coverage fallback', () => {
    expect(planEntryStatus(entry('skipped', true))).toEqual({
      tone: 'neutral',
      labelKey: 'plans.skipped',
    });
  });

  it('shows fully covered for planned entries with pantry coverage', () => {
    expect(planEntryStatus(entry('planned', true))).toEqual({
      tone: 'info',
      labelKey: 'plans.fullyCovered',
    });
  });

  it('falls back to regenerate when a planned entry is not covered', () => {
    expect(planEntryStatus(entry('planned', false))).toEqual({
      tone: 'warn',
      labelKey: 'plans.regenerate',
    });
  });
});
