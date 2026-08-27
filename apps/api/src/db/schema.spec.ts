import { describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema.js';

/**
 * Drizzle only resolves a `many()` relation if the referenced table declares the
 * matching `one()` inverse. A missing inverse is invisible to `tsc` and to any
 * test that mocks the database — it surfaces only as a runtime 500 the first
 * time someone queries that relation. `GET /recipes/:id` shipped broken exactly
 * this way, so every declared relation is exercised here.
 */
describe('drizzle relational schema', () => {
  const db = drizzle.mock({ schema });
  const tables: Record<string, { relations: Record<string, unknown> }> = db._.schema ?? {};

  type RelationalQuery = {
    findFirst: (config: { with: Record<string, true> }) => { toSQL: () => unknown };
  };
  const queries = db.query as unknown as Record<string, RelationalQuery | undefined>;

  const relations = Object.entries(tables).flatMap(([tableKey, config]) =>
    Object.keys(config.relations).map((relation) => [tableKey, relation] as const),
  );

  it('declares at least one relation', () => {
    expect(relations.length).toBeGreaterThan(0);
  });

  it.each(relations)('%s.%s resolves to SQL', (tableKey, relation) => {
    const query = queries[tableKey];
    expect(query).toBeDefined();
    expect(() => query?.findFirst({ with: { [relation]: true } }).toSQL()).not.toThrow();
  });
});

describe('reminderSettings table', () => {
  it('is keyed by household and carries every wellness setting column', async () => {
    const { reminderSettings } = await import('./schema.js');
    const columns = Object.keys(reminderSettings);
    expect(columns).toEqual(
      expect.arrayContaining([
        'householdId',
        'breakEnabled',
        'stretchEnabled',
        'morningEnabled',
        'hydrationEnabled',
        'breakCadenceMinutes',
        'stretchCadenceMinutes',
        'hydrationGoalCups',
        'quietHoursStart',
        'quietHoursEnd',
        'updatedAt',
      ]),
    );
  });
});
