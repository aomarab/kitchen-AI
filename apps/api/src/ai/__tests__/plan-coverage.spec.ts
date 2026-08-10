import { describe, expect, it } from 'vitest';
import type { Unit } from '@kitchen/contracts';
import { PlanService } from '../plan/plan.service.js';
import type { Database } from '../../db/index.js';
import type { PantryPort } from '../planner/pantry-snapshot.js';
import type { CatalogIngredientRef } from '../planner/types.js';
import { cat, snapshotOf, uuid } from './helpers.js';

const RICE: CatalogIngredientRef = cat({ canonicalNameEn: 'Basmati rice', category: 'grain', defaultUnit: 'g' });

/** Shapes a recipe ingredient row the way the drizzle `with` query returns it. */
function recipeIngredient(ref: CatalogIngredientRef, quantity: number, unit: Unit) {
  return { quantity: String(quantity), unit, optional: false, ingredient: { ...ref, aliases: [] } };
}

function entry(id: string, position: number, ingredients: ReturnType<typeof recipeIngredient>[]) {
  return {
    id,
    date: '2026-08-01',
    position,
    recipe: { titleEn: `Meal ${position}`, titleAr: null, ingredients },
  };
}

/**
 * A `PlanService` wired to a fixed plan and pantry, with everything else
 * unreachable — `coverage` only reads.
 */
function serviceFor(entries: ReturnType<typeof entry>[], pantry: PantryPort): PlanService {
  const db = {
    query: {
      mealPlans: {
        findFirst: async () => ({
          id: 'plan-1',
          householdId: 'hh-1',
          endsOn: '2026-08-07',
          entries,
        }),
      },
    },
  } as unknown as Database;
  return new PlanService(db, pantry, undefined as never, { resolveMany: async () => new Map() } as never);
}

/**
 * Coverage has to spend the pantry as it walks the plan, the same way the
 * planner did when it built it.
 *
 * Against a single pristine snapshot, every meal is measured against stock its
 * predecessors already ate. A week of identical dinners would report 100%
 * covered off one bag of rice, and the shopping list — which is derived from
 * the same shortfalls — would tell the user to buy nothing.
 */
describe('PlanService.coverage — forward-simulated pantry', () => {
  const pantryWith = (grams: number): PantryPort => ({
    snapshot: async () => snapshotOf([{ ref: RICE, quantity: grams, unit: 'g' }]),
  });

  it('covers only as many meals as the pantry can actually cook', async () => {
    const a = uuid();
    const b = uuid();
    const service = serviceFor(
      [
        entry(a, 0, [recipeIngredient(RICE, 500, 'g')]),
        entry(b, 1, [recipeIngredient(RICE, 500, 'g')]),
      ],
      pantryWith(600),
    );

    const result = await service.coverage('hh-1', 'plan-1');

    expect(result.coveredEntryIds).toEqual([a]);
    expect(result.uncoveredEntryIds).toEqual([b]);
    expect(result.coverageRatio).toBe(0.5);
  });

  it('reports the shortfall the second meal actually has, not zero', async () => {
    const service = serviceFor(
      [
        entry(uuid(), 0, [recipeIngredient(RICE, 500, 'g')]),
        entry(uuid(), 1, [recipeIngredient(RICE, 500, 'g')]),
      ],
      pantryWith(600),
    );

    const result = await service.coverage('hh-1', 'plan-1');

    expect(result.shortfalls).toHaveLength(1);
    expect(result.shortfalls[0]).toMatchObject({
      ingredientId: RICE.id,
      required: 500,
      available: 100,
      shortfall: 400,
      unit: 'g',
    });
  });

  it('still reports full coverage when there is genuinely enough for every meal', async () => {
    const service = serviceFor(
      [
        entry(uuid(), 0, [recipeIngredient(RICE, 500, 'g')]),
        entry(uuid(), 1, [recipeIngredient(RICE, 500, 'g')]),
      ],
      pantryWith(1000),
    );

    const result = await service.coverage('hh-1', 'plan-1');

    expect(result.coverageRatio).toBe(1);
    expect(result.shortfalls).toEqual([]);
  });

  it('spends the pantry in the order the planner committed the entries', async () => {
    const first = uuid();
    const second = uuid();
    // Deliberately out of order: `position`, not array order, is authoritative.
    const service = serviceFor(
      [
        entry(second, 1, [recipeIngredient(RICE, 500, 'g')]),
        entry(first, 0, [recipeIngredient(RICE, 500, 'g')]),
      ],
      pantryWith(600),
    );

    const result = await service.coverage('hh-1', 'plan-1');

    expect(result.coveredEntryIds).toEqual([first]);
  });

  it('does not mutate the caller’s snapshot', async () => {
    const snapshot = snapshotOf([{ ref: RICE, quantity: 600, unit: 'g' }]);
    const service = serviceFor([entry(uuid(), 0, [recipeIngredient(RICE, 500, 'g')])], {
      snapshot: async () => snapshot,
    });

    await service.coverage('hh-1', 'plan-1');

    expect(snapshot.byIngredientId.get(RICE.id)?.baseQuantity).toBe(600);
  });
});
