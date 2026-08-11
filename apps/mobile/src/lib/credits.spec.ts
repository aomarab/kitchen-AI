import { describe, expect, it } from 'vitest';
import { CREDIT_COSTS } from '@kitchen/contracts';
import { canAfford, costOf, creditsShort, totalCredits } from './credits';

const balance = {
  freeBalance: 10,
  paidBalance: 5,
  grantPeriod: '2026-08',
  freeGrant: 150,
};

describe('totalCredits', () => {
  it('sums free and paid credits', () => {
    expect(totalCredits(balance)).toBe(15);
  });

  it('lets a negative paid balance drag the total below the free balance', () => {
    // A refund of already-consumed credits can push paid negative; the total
    // must reflect that rather than treating paid as clamped at zero.
    expect(totalCredits({ freeBalance: 10, paidBalance: -8 })).toBe(2);
  });
});

describe('costOf', () => {
  it('returns the exact contract price for an action', () => {
    expect(costOf('plan.monthly')).toBe(CREDIT_COSTS['plan.monthly']);
    expect(costOf('pantry.scan')).toBe(1);
  });
});

describe('canAfford', () => {
  it('affords an action within the combined balance', () => {
    expect(canAfford(balance, 'plan.daily')).toBe(true);
  });

  it('affords an action priced exactly at the balance', () => {
    // 15 total === a hypothetical boundary: daily (4) is well under, but prove
    // the `>=` by matching the total to the price via free+paid.
    expect(canAfford({ freeBalance: 15, paidBalance: 5 }, 'plan.monthly')).toBe(false);
    expect(canAfford({ freeBalance: 50, paidBalance: 0 }, 'plan.monthly')).toBe(true);
  });

  it('does not afford an action beyond it', () => {
    expect(canAfford(balance, 'plan.monthly')).toBe(false);
  });

  it('treats a negative paid balance as reducing what is affordable', () => {
    expect(canAfford({ ...balance, paidBalance: -8 }, 'plan.daily')).toBe(false);
  });
});

describe('creditsShort', () => {
  it('reports how many credits are missing', () => {
    expect(creditsShort(balance, 'plan.monthly')).toBe(35);
  });

  it('reports zero short when affordable', () => {
    expect(creditsShort(balance, 'pantry.scan')).toBe(0);
  });

  it('never reports a negative shortfall', () => {
    expect(creditsShort({ freeBalance: 500, paidBalance: 0 }, 'plan.monthly')).toBe(0);
  });

  it('counts a negative paid balance against the shortfall', () => {
    // free 10, paid -8 → total 2; a 4-credit daily plan is 2 short.
    expect(creditsShort({ freeBalance: 10, paidBalance: -8 }, 'plan.daily')).toBe(2);
  });
});
