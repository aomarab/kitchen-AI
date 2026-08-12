import { describe, expect, it, vi } from 'vitest';
import { assertOwnedKey, householdPrefix } from '../../storage/storage.service.js';
import { RecipesService } from '../recipes/recipes.service.js';

/**
 * Cross-household *write* isolation for the two AI inputs that arrive as
 * opaque client strings rather than as guarded path params:
 *
 *   - `markCooked`'s `mealPlanEntryId`, which is stamped onto inventory events
 *     and flipped to `cooked`;
 *   - `photoKeys` on recognize / receipt-parse, which name S3 objects the
 *     server then fetches on the caller's behalf.
 *
 * `HouseholdGuard` proves membership of the header household; it cannot know
 * whether a body field belongs to it. Each of these needs its own check.
 */
describe('markCooked refuses a meal-plan entry from another household', () => {
  const recipeRow = {
    id: 'r1',
    householdId: null,
    titleEn: 'Shakshuka',
    titleAr: 'شكشوكة',
    servings: 2,
    ingredients: [],
    videos: [],
  };

  /** `ownedEntries` is what the ownership join returns — empty means foreign. */
  function fakeDb(ownedEntries: unknown[]) {
    const update = vi.fn(() => ({ set: () => ({ where: async () => undefined }) }));
    const tx = {
      update,
      insert: () => ({ values: async () => undefined }),
      select: () => ({
        from: () => ({ where: () => ({ orderBy: () => ({ for: async () => [] }) }) }),
      }),
    };
    return {
      db: {
        query: { recipes: { findFirst: async () => recipeRow } },
        select: () => ({
          from: () => ({
            innerJoin: () => ({ where: () => ({ limit: async () => ownedEntries }) }),
          }),
        }),
        update,
        transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
      update,
    };
  }

  it('throws NOT_FOUND when the entry belongs to another household', async () => {
    const { db, update } = fakeDb([]);
    const service = new RecipesService(db, {} as never, {} as never);

    await expect(
      service.markCooked('hh-x', 'user-x', 'r1', {
        mealPlanEntryId: 'entry-owned-by-hh-y',
        deductInventory: false,
      } as never),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });

    // The check has to happen before the write, not alongside it.
    expect(update).not.toHaveBeenCalled();
  });

  it('marks the entry cooked when it belongs to the caller', async () => {
    const { db, update } = fakeDb([{ id: 'entry-owned-by-hh-x' }]);
    const service = new RecipesService(db, {} as never, {} as never);

    await service.markCooked('hh-x', 'user-x', 'r1', {
      mealPlanEntryId: 'entry-owned-by-hh-x',
      deductInventory: false,
    } as never);

    expect(update).toHaveBeenCalledTimes(1);
  });
});

describe('assertOwnedKey scopes object keys to the household', () => {
  const hh = '11111111-1111-4111-8111-111111111111';
  const other = '22222222-2222-4222-8222-222222222222';

  it('accepts a key under the household prefix', () => {
    expect(() =>
      assertOwnedKey(hh, `${householdPrefix(hh)}inventory_photo/a.jpg`),
    ).not.toThrow();
  });

  it.each([
    ["another household's object", `households/22222222-2222-4222-8222-222222222222/receipt/a.jpg`],
    ['a traversal out of the prefix', `households/11111111-1111-4111-8111-111111111111/../${other}/a.jpg`],
    ['an absolute URL that would make the model fetch anything', 'https://evil.test/a.jpg'],
    ['a bare relative key', 'a.jpg'],
    ['a prefix-collision on a longer id', `households/${hh}-extra/receipt/a.jpg`],
  ])('rejects %s', (_label, key) => {
    expect(() => assertOwnedKey(hh, key)).toThrowError(
      expect.objectContaining({ code: 'NOT_FOUND' }),
    );
  });
});
