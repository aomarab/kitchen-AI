import { describe, expect, it } from 'vitest';
import { planEntryHaveBadge } from './plan-entry-have-badge';

const coverage = {
  coveredEntryIds: ['covered'],
  uncoveredEntryIds: ['missing'],
  shortfalls: [{ ingredientId: 'tomato' }, { ingredientId: 'rice' }],
};

describe('planEntryHaveBadge', () => {
  it('shows the in-kitchen badge when the entry is fully covered', () => {
    expect(planEntryHaveBadge({ id: 'entry', fullyCovered: true }, undefined)).toEqual({
      tone: 'success',
      labelKey: 'mobile.home.allInKitchen',
    });
  });

  it('shows missing count from coverage for uncovered entries', () => {
    expect(planEntryHaveBadge({ id: 'missing', fullyCovered: false }, coverage)).toEqual({
      tone: 'warn',
      labelKey: 'plans.missingItems',
      count: 2,
    });
  });

  it('shows no badge rather than a status word when coverage is unavailable', () => {
    expect(planEntryHaveBadge({ id: 'entry', fullyCovered: false }, undefined)).toBeNull();
  });

  it('shows no badge when coverage does not identify this entry as uncovered', () => {
    expect(planEntryHaveBadge({ id: 'other', fullyCovered: false }, coverage)).toBeNull();
  });
});
