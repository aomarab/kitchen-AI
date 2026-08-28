import { describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as contracts from '@kitchen/contracts';
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

/**
 * A contract enum and its Postgres enum are two independent lists of strings
 * that nothing forces to agree. Drift is invisible to `tsc`: the contract
 * accepts the value, zod validates it, the service passes it through, and
 * Postgres rejects the INSERT — a 500 on a write path, discovered in
 * production. `inventory_source` nearly shipped that way when the live
 * assistant needed an `assistant` provenance.
 *
 * Every pair below must hold the same values in the same order.
 */
describe('postgres enums match their contracts', () => {
  const pairs: ReadonlyArray<readonly [string, readonly string[], readonly string[]]> = [
    ['locale', schema.localeEnum.enumValues, contracts.localeSchema.options],
    ['user_role', schema.userRoleEnum.enumValues, contracts.userRoleSchema.options],
    [
      'reminder_channel',
      schema.reminderChannelEnum.enumValues,
      contracts.reminderChannelSchema.options,
    ],
    ['household_role', schema.householdRoleEnum.enumValues, contracts.householdRoleSchema.options],
    ['timer_status', schema.timerStatusEnum.enumValues, contracts.timerStatusSchema.options],
    ['reminder_type', schema.reminderTypeEnum.enumValues, contracts.reminderTypeSchema.options],
    [
      'feedback_status',
      schema.feedbackStatusEnum.enumValues,
      contracts.feedbackStatusSchema.options,
    ],
    [
      'feedback_platform',
      schema.feedbackPlatformEnum.enumValues,
      contracts.feedbackPlatformSchema.options,
    ],
    ['oauth_provider', schema.oauthProviderEnum.enumValues, contracts.oauthProviderSchema.options],
    [
      'storage_location_type',
      schema.storageLocationTypeEnum.enumValues,
      contracts.storageLocationTypeSchema.options,
    ],
    [
      'ingredient_category',
      schema.ingredientCategoryEnum.enumValues,
      contracts.ingredientCategorySchema.options,
    ],
    ['unit', schema.unitEnum.enumValues, contracts.unitSchema.options],
    [
      'inventory_source',
      schema.inventorySourceEnum.enumValues,
      contracts.inventorySourceSchema.options,
    ],
    [
      'inventory_event_reason',
      schema.inventoryEventReasonEnum.enumValues,
      contracts.inventoryEventReasonSchema.options,
    ],
    ['meal_slot', schema.mealSlotEnum.enumValues, contracts.mealSlotSchema.options],
    ['plan_scope', schema.planScopeEnum.enumValues, contracts.planScopeSchema.options],
    ['plan_status', schema.planStatusEnum.enumValues, contracts.planStatusSchema.options],
    ['entry_state', schema.entryStateEnum.enumValues, contracts.mealPlanEntryStateSchema.options],
    ['difficulty', schema.difficultyEnum.enumValues, contracts.difficultySchema.options],
    ['job_type', schema.jobTypeEnum.enumValues, contracts.jobTypeSchema.options],
    ['job_status', schema.jobStatusEnum.enumValues, contracts.jobStatusSchema.options],
    [
      'generated_by',
      schema.generatedByEnum.enumValues,
      contracts.recipeSchema.shape.generatedBy.options,
    ],
    // `dish_media_status` is deliberately absent: it is server-internal state
    // that never crosses the wire, so it has no contract to drift from.
  ];

  it.each(pairs)('%s', (_name, columnValues, contractValues) => {
    expect(columnValues).toEqual(contractValues);
  });
});
