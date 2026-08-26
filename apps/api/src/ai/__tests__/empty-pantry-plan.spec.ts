import { describe, expect, it, vi } from 'vitest';
import { PlanService } from '../plan/plan.service.js';
import { PlanController } from '../plan/plan.controller.js';
import type { Database } from '../../db/index.js';
import type { PantryPort } from '../planner/pantry-snapshot.js';
import type { JobsService } from '../jobs/jobs.service.js';
import { AppError } from '../../common/errors.js';
import { cat, snapshotOf } from './helpers.js';

const RICE = cat({ canonicalNameEn: 'Basmati rice', category: 'grain', defaultUnit: 'g' });
const SALT = cat({
  canonicalNameEn: 'Salt',
  category: 'other',
  defaultUnit: 'g',
  isStaple: true,
});

function serviceFor(pantry: PantryPort): PlanService {
  const unreachable = new Proxy(
    {},
    {
      get() {
        throw new Error('generation must not be reached');
      },
    },
  );
  return new PlanService(
    unreachable as unknown as Database,
    pantry,
    unreachable as never,
    unreachable as never,
    unreachable as never,
  );
}

const empty: PantryPort = { snapshot: async () => snapshotOf([]) };
const stocked: PantryPort = {
  snapshot: async () => snapshotOf([{ ref: RICE, quantity: 500, unit: 'g' }]),
};

/**
 * Generating from an empty kitchen used to succeed: every candidate failed
 * stage C, so a weekly plan came back fully generated and zero percent covered
 * — a shopping list wearing a meal plan's clothes, already paid for in credits.
 */
describe('assertPantryStocked', () => {
  it('rejects an empty pantry with an actionable, translatable error', async () => {
    const error = await serviceFor(empty)
      .assertPantryStocked('hh-1')
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe('PLAN_INFEASIBLE');
    expect((error as AppError).messageKey).toBe('errors.emptyPantry');
  });

  it('allows a pantry with real items', async () => {
    await expect(serviceFor(stocked).assertPantryStocked('hh-1')).resolves.toBeUndefined();
  });

  // Staples are assumed present unless explicitly out of stock, so counting
  // them would let a kitchen holding nothing but implicit salt plan a week of
  // meals it cannot cook.
  it('does not count implicit staples as stock', async () => {
    const staplesOnly: PantryPort = { snapshot: async () => snapshotOf([], [SALT.id]) };
    await expect(serviceFor(staplesOnly).assertPantryStocked('hh-1')).rejects.toBeInstanceOf(
      AppError,
    );
  });
});

describe('POST /meal-plans checks feasibility before spending credits', () => {
  function controllerFor(pantry: PantryPort) {
    const enqueuePlan = vi.fn(async () => ({ jobId: 'job-1' }));
    const jobs = { enqueuePlan } as unknown as JobsService;
    return { controller: new PlanController(serviceFor(pantry), jobs), enqueuePlan };
  }

  const household = { id: 'hh-1' } as never;
  const user = { userId: 'u-1' } as never;
  const body = { scope: 'weekly' } as never;

  it('never enqueues (and so never charges) when the pantry is empty', async () => {
    const { controller, enqueuePlan } = controllerFor(empty);

    await expect(controller.generate(household, user, 'key-1', body)).rejects.toMatchObject({
      code: 'PLAN_INFEASIBLE',
    });
    expect(enqueuePlan).not.toHaveBeenCalled();
  });

  it('enqueues normally once there is something to plan around', async () => {
    const { controller, enqueuePlan } = controllerFor(stocked);

    await expect(controller.generate(household, user, 'key-1', body)).resolves.toEqual({
      jobId: 'job-1',
    });
    expect(enqueuePlan).toHaveBeenCalledTimes(1);
  });
});
