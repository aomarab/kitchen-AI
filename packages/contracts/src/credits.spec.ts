import { describe, expect, it } from 'vitest';
import {
  CREDIT_COSTS,
  CREDIT_PACKS,
  FREE_MONTHLY_GRANT,
  creditActionSchema,
  creditBalanceSchema,
} from './credits.js';
import { ERROR_STATUS, errorCodeSchema } from './common.js';

describe('credit contracts', () => {
  it('prices every action', () => {
    for (const action of creditActionSchema.options) {
      expect(CREDIT_COSTS[action]).toBeGreaterThan(0);
    }
  });

  it('uses the exact prices from the spec', () => {
    expect(CREDIT_COSTS).toEqual({
      'pantry.scan': 1,
      'receipt.scan': 2,
      'plan.daily': 4,
      'plan.weekly': 20,
      'plan.monthly': 50,
      'plan.regenerateEntry': 2,
      'assistant.session': 25,
    });
  });

  it('grants 150 free credits a month', () => {
    expect(FREE_MONTHLY_GRANT).toBe(150);
  });

  it('sells 300 credits for $4.99', () => {
    const pack = CREDIT_PACKS.find((p) => p.productId === 'credits_300');
    expect(pack).toEqual({
      productId: 'credits_300',
      credits: 300,
      priceUsd: 4.99,
    });
  });

  it('keeps the monthly plan the most expensive action', () => {
    const costs = Object.values(CREDIT_COSTS);
    expect(Math.max(...costs)).toBe(CREDIT_COSTS['plan.monthly']);
  });

  it('registers INSUFFICIENT_CREDITS as a 402', () => {
    expect(errorCodeSchema.options).toContain('INSUFFICIENT_CREDITS');
    expect(ERROR_STATUS.INSUFFICIENT_CREDITS).toBe(402);
  });

  it('parses a balance', () => {
    const parsed = creditBalanceSchema.parse({
      householdId: '00000000-0000-4000-8000-000000000000',
      freeBalance: 150,
      paidBalance: 0,
      grantPeriod: '2026-08',
      freeGrant: 150,
    });
    expect(parsed.freeBalance).toBe(150);
  });

  it('rejects a malformed grant period', () => {
    expect(() =>
      creditBalanceSchema.parse({
        householdId: '00000000-0000-4000-8000-000000000000',
        freeBalance: 1,
        paidBalance: 0,
        grantPeriod: 'August 2026',
        freeGrant: 150,
      }),
    ).toThrow();
  });
});
