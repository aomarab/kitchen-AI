import { describe, it, expect, vi } from 'vitest';
import { DrizzleIngredientResolver } from '../catalog/drizzle-ingredient-resolver.js';
import type { EmbeddingsPort } from '../catalog/embeddings.port.js';

/**
 * A chainable stand-in for the drizzle query builder. Each call to `select`
 * pops the next queued result, so a test can say what the database returns for
 * the first vector query, the second, and the unranked fallback.
 */
function fakeDb(results: unknown[][]) {
  const calls: { orderBy: boolean; limit: number | null }[] = [];
  const db = {
    select() {
      const state = { orderBy: false, limit: null as number | null };
      calls.push(state);
      const rows = results.shift() ?? [];
      const chain: Record<string, unknown> = {};
      for (const key of ['from', 'where', 'orderBy'] as const) {
        chain[key] = () => {
          if (key === 'orderBy') state.orderBy = true;
          return chain;
        };
      }
      chain.limit = (n: number) => {
        state.limit = n;
        return Promise.resolve(rows);
      };
      return chain;
    },
  };
  return { db, calls };
}

function resolverWith(
  results: unknown[][],
  embed: EmbeddingsPort['embed'],
): { resolver: DrizzleIngredientResolver; calls: { orderBy: boolean; limit: number | null }[] } {
  const { db, calls } = fakeDb(results);
  const embeddings: EmbeddingsPort = { embed, dimensions: 1536 };
  return {
    resolver: new DrizzleIngredientResolver(db as never, embeddings),
    calls,
  };
}

const vec = (n: number) => Array.from({ length: 4 }, () => n);

describe('candidateNamesFor', () => {
  it('ranks candidates by distance and merges across queries, best first', async () => {
    // The whole point: the model used to be handed an arbitrary, unordered 200
    // of 509 catalog rows, so the right answer was often not on the menu.
    const { resolver } = resolverWith(
      [
        [
          { name: 'Chicken breast', distance: 0.41 },
          { name: 'Chicken thigh', distance: 0.52 },
        ],
        [
          { name: 'Eggplant', distance: 0.12 },
          { name: 'Chicken breast', distance: 0.9 },
        ],
      ],
      async (texts) => texts.map(() => vec(1)),
    );

    const names = await resolver.candidateNamesFor(['chicken breasts', 'aubergine'], 10);

    // Eggplant is nearest overall; 'Chicken breast' keeps its *best* distance
    // (0.41) rather than the 0.9 it scored against the other query.
    expect(names).toEqual(['Eggplant', 'Chicken breast', 'Chicken thigh']);
  });

  it('deduplicates a name that is near several queries', async () => {
    const { resolver } = resolverWith(
      [
        [{ name: 'Olive oil', distance: 0.3 }],
        [{ name: 'Olive oil', distance: 0.2 }],
        [{ name: 'Olive oil', distance: 0.4 }],
      ],
      async (texts) => texts.map(() => vec(1)),
    );

    expect(await resolver.candidateNamesFor(['zeit', 'oil', 'زيت زيتون'], 10)).toEqual([
      'Olive oil',
    ]);
  });

  it('honours the limit', async () => {
    const { resolver } = resolverWith(
      [
        [
          { name: 'A', distance: 0.1 },
          { name: 'B', distance: 0.2 },
          { name: 'C', distance: 0.3 },
        ],
      ],
      async (texts) => texts.map(() => vec(1)),
    );

    expect(await resolver.candidateNamesFor(['x'], 2)).toEqual(['A', 'B']);
  });

  it('falls back to the unranked catalog when embedding fails, instead of throwing', async () => {
    // Receipt scanning must not die because the embeddings endpoint is down;
    // degrading to the old unranked list is worse but still works.
    const { resolver } = resolverWith(
      [[{ name: 'Milk' }, { name: 'Rice' }]],
      async () => {
        throw new Error('embeddings endpoint down');
      },
    );

    expect(await resolver.candidateNamesFor(['milk'], 2)).toEqual(['Milk', 'Rice']);
  });

  it('falls back when the vector query itself fails (e.g. pgvector missing)', async () => {
    const { db, calls } = fakeDb([]);
    let call = 0;
    const failingDb = {
      select() {
        call++;
        if (call === 1) {
          const chain: Record<string, unknown> = {};
          for (const key of ['from', 'where', 'orderBy'] as const) chain[key] = () => chain;
          chain.limit = () => Promise.reject(new Error('operator <=> does not exist'));
          return chain;
        }
        return (db.select as () => unknown)();
      },
    };
    void calls;
    const resolver = new DrizzleIngredientResolver(failingDb as never, {
      embed: async (t) => t.map(() => vec(1)),
      dimensions: 1536,
    });
    // second select() -> fallback, which the fakeDb returns [] for
    await expect(resolver.candidateNamesFor(['milk'], 5)).resolves.toEqual([]);
  });

  it('falls back when nothing in the catalog has an embedding yet', async () => {
    // True on a fresh database until `db:embed` has run.
    const { resolver } = resolverWith(
      [[], [{ name: 'Milk' }]],
      async (texts) => texts.map(() => vec(1)),
    );

    expect(await resolver.candidateNamesFor(['milk'], 3)).toEqual(['Milk']);
  });

  it('skips the embedding call entirely for empty input', async () => {
    const embed = vi.fn(async (texts: string[]) => texts.map(() => vec(1)));
    const { resolver } = resolverWith([[{ name: 'Milk' }]], embed);

    expect(await resolver.candidateNamesFor(['', '   '], 5)).toEqual(['Milk']);
    expect(embed).not.toHaveBeenCalled();
  });

  it('asks for at least three neighbours per query even when the limit is tiny', async () => {
    // With one nearest row per query a single bad match is the whole menu.
    const { resolver, calls } = resolverWith(
      [[{ name: 'A', distance: 0.1 }]],
      async (texts) => texts.map(() => vec(1)),
    );

    await resolver.candidateNamesFor(['x'], 1);
    expect(calls[0]?.limit).toBeGreaterThanOrEqual(3);
    expect(calls[0]?.orderBy).toBe(true);
  });
});
