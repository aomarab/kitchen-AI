import { describe, expect, it, vi } from 'vitest';
import { FREE_MONTHLY_GRANT } from '@kitchen/contracts';
import type { HouseholdContext } from '../common/request-context.js';
import { CreditsController } from './credits.controller.js';

const household: HouseholdContext = { id: '00000000-0000-4000-8000-000000000000', role: 'owner' };

describe('CreditsController', () => {
  it('returns the household balance', async () => {
    const service = {
      balance: vi.fn().mockResolvedValue({
        householdId: household.id,
        freeBalance: FREE_MONTHLY_GRANT,
        paidBalance: 0,
        grantPeriod: '2026-08',
        freeGrant: FREE_MONTHLY_GRANT,
      }),
    };
    const controller = new CreditsController(service as never, {} as never);

    const result = await controller.balance(household);

    expect(result.freeBalance).toBe(FREE_MONTHLY_GRANT);
    expect(service.balance).toHaveBeenCalledWith(household.id);
  });
});
