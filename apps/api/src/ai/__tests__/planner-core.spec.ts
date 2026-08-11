import { describe, expect, it, vi } from 'vitest';
import { runPlanner, type StageBGenerate } from '../planner/planner-core.js';
import { cat, genPlan, genRecipe, resolverFor } from './helpers.js';
import { snapshotOf } from './helpers.js';

const chicken = cat({ canonicalNameEn: 'Chicken breast', category: 'poultry', defaultUnit: 'g' });
const resolve = resolverFor([chicken]);

describe('runPlanner — daily scope (spec §5.4 Stage C)', () => {
  it('accepts a fully-covered day with a single generation', async () => {
    const generate = vi.fn<StageBGenerate>(async ({ dates, slots }) =>
      genPlan([
        {
          date: dates[0]!,
          slot: slots[0]!,
          recipe: genRecipe('Grilled chicken', [{ name: 'Chicken breast', quantity: 200, unit: 'g' }]),
        },
      ]),
    );

    const result = await runPlanner({
      scope: 'daily',
      weeks: [['2026-08-01']],
      slots: ['lunch'],
      constraints: { allergies: [], halal: false },
      maxDailyRetries: 2,
      baseSnapshot: snapshotOf([{ ref: chicken, quantity: 500, unit: 'g' }]),
      generate,
      resolve,
    });

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]?.validation.fullyCovered).toBe(true);
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it('stops after one attempt when the pantry covers nothing, and names what is missing', async () => {
    // A day nothing can be cooked from. Retrying re-samples the same model
    // against the same shelves, so the extra calls only cost the household
    // money and minutes — this is the case that used to burn three
    // generations before failing.
    const generate = vi.fn<StageBGenerate>(async ({ dates, slots }) =>
      genPlan([
        {
          date: dates[0]!,
          slot: slots[0]!,
          recipe: genRecipe('Big roast', [{ name: 'Chicken breast', quantity: 500, unit: 'g' }]),
        },
      ]),
    );

    await expect(
      runPlanner({
        scope: 'daily',
        weeks: [['2026-08-01']],
        slots: ['lunch'],
        constraints: { allergies: [], halal: false },
        maxDailyRetries: 2,
        baseSnapshot: snapshotOf([{ ref: chicken, quantity: 200, unit: 'g' }]),
        generate,
        resolve,
      }),
    ).rejects.toMatchObject({
      code: 'PLAN_INFEASIBLE',
      details: { missing: [{ nameEn: 'Chicken breast', shortfall: 300, unit: 'g' }] },
    });

    expect(generate).toHaveBeenCalledTimes(1);
  });

  it('still retries a day that came partly together, then throws', async () => {
    // Lunch fits, dinner does not. The model may simply have spent the stock
    // early, so another arrangement is worth paying for — unlike the case
    // above, these retries can succeed.
    const generate = vi.fn<StageBGenerate>(async ({ dates, slots }) =>
      genPlan(
        slots.map((slot, i) => ({
          date: dates[0]!,
          slot,
          recipe: genRecipe(`Meal ${slot}`, [
            { name: 'Chicken breast', quantity: i === 0 ? 200 : 500, unit: 'g' },
          ]),
        })),
      ),
    );

    await expect(
      runPlanner({
        scope: 'daily',
        weeks: [['2026-08-01']],
        slots: ['lunch', 'dinner'],
        constraints: { allergies: [], halal: false },
        maxDailyRetries: 2,
        baseSnapshot: snapshotOf([{ ref: chicken, quantity: 500, unit: 'g' }]),
        generate,
        resolve,
      }),
    ).rejects.toMatchObject({ code: 'PLAN_INFEASIBLE' });

    // attempt 0 + 2 retries = 3 generations
    expect(generate).toHaveBeenCalledTimes(3);
  });

  it('accepts a day that only comes together on a later attempt', async () => {
    const generate = vi.fn<StageBGenerate>(async ({ dates, slots, attempt }) =>
      genPlan(
        slots.map((slot, i) => ({
          date: dates[0]!,
          slot,
          recipe: genRecipe(`Meal ${slot} ${attempt}`, [
            { name: 'Chicken breast', quantity: attempt === 0 && i === 1 ? 500 : 200, unit: 'g' },
          ]),
        })),
      ),
    );

    const result = await runPlanner({
      scope: 'daily',
      weeks: [['2026-08-01']],
      slots: ['lunch', 'dinner'],
      constraints: { allergies: [], halal: false },
      maxDailyRetries: 2,
      baseSnapshot: snapshotOf([{ ref: chicken, quantity: 500, unit: 'g' }]),
      generate,
      resolve,
    });

    expect(result.entries).toHaveLength(2);
    expect(generate).toHaveBeenCalledTimes(2);
  });
});

describe('runPlanner — weekly scope converts shortfalls to shopping items', () => {
  it('accepts entries and aggregates the shortfall for the shopping list', async () => {
    const generate: StageBGenerate = async ({ dates, slots }) =>
      genPlan(
        dates.map((date) => ({
          date,
          slot: slots[0]!,
          recipe: genRecipe(`Chicken ${date}`, [{ name: 'Chicken breast', quantity: 300, unit: 'g' }]),
        })),
      );

    const result = await runPlanner({
      scope: 'weekly',
      weeks: [['2026-08-01', '2026-08-02']],
      slots: ['lunch'],
      constraints: { allergies: [], halal: false },
      maxDailyRetries: 2,
      baseSnapshot: snapshotOf([{ ref: chicken, quantity: 500, unit: 'g' }]),
      generate,
      resolve,
    });

    expect(result.entries).toHaveLength(2);
    // Day 1 covered (500 → 200 left), day 2 short by 100g.
    expect(result.shoppingShortfalls).toHaveLength(1);
    expect(result.shoppingShortfalls[0]?.ingredientId).toBe(chicken.id);
    expect(result.shoppingShortfalls[0]?.shortfall).toBeCloseTo(100, 3);
  });
});

describe('runPlanner — monthly forward-simulation', () => {
  it('week 2 sees stock consumed by week 1 and produces a shortfall', async () => {
    const rice = cat({ canonicalNameEn: 'Basmati rice', category: 'grain', defaultUnit: 'g' });
    const generate: StageBGenerate = async ({ dates, slots }) =>
      genPlan([
        {
          date: dates[0]!,
          slot: slots[0]!,
          recipe: genRecipe(`Rice ${dates[0]}`, [{ name: 'Basmati rice', quantity: 100, unit: 'g' }]),
        },
      ]);

    const result = await runPlanner({
      scope: 'monthly',
      // two week-groups, one date each, so forward-sim must carry across weeks
      weeks: [['2026-08-01'], ['2026-08-08']],
      slots: ['lunch'],
      constraints: { allergies: [], halal: false },
      maxDailyRetries: 2,
      baseSnapshot: snapshotOf([{ ref: rice, quantity: 150, unit: 'g' }]),
      generate,
      resolve: resolverFor([rice]),
    });

    expect(result.entries).toHaveLength(2);
    expect(result.entries[0]?.validation.fullyCovered).toBe(true);
    expect(result.entries[1]?.validation.fullyCovered).toBe(false);
    expect(result.shoppingShortfalls[0]?.shortfall).toBeCloseTo(50, 3);
  });
});

describe('runPlanner — unsafe recipes are never surfaced', () => {
  it('drops a halal-violating recipe from a weekly plan', async () => {
    const pork = cat({ canonicalNameEn: 'Pork belly', canonicalNameAr: 'لحم خنزير', category: 'meat' });
    const generate: StageBGenerate = async ({ dates, slots }) =>
      genPlan([
        {
          date: dates[0]!,
          slot: slots[0]!,
          recipe: genRecipe('Pork stew', [{ name: 'Pork belly', quantity: 100, unit: 'g' }]),
        },
        {
          date: dates[1]!,
          slot: slots[0]!,
          recipe: genRecipe('Chicken stew', [{ name: 'Chicken breast', quantity: 100, unit: 'g' }]),
        },
      ]);

    const result = await runPlanner({
      scope: 'weekly',
      weeks: [['2026-08-01', '2026-08-02']],
      slots: ['lunch'],
      constraints: { allergies: [], halal: true },
      maxDailyRetries: 2,
      baseSnapshot: snapshotOf([{ ref: chicken, quantity: 500, unit: 'g' }]),
      generate,
      resolve: resolverFor([chicken, pork]),
    });

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]?.recipe.title).toBe('Chicken stew');
  });
});
