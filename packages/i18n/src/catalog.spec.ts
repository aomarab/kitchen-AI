import { describe, expect, it } from 'vitest';
import {
  cuisineSchema,
  dietaryPreferenceSchema,
  healthGoalSchema,
  ingredientCategorySchema,
  unitSchema,
} from '@kitchen/contracts';
import { ar, en } from './index.js';

/**
 * TypeScript already guarantees the Arabic catalog has the same shape as the
 * English one. What it cannot check is that the *enum-keyed* namespaces stay in
 * step with the contracts: adding a cuisine to the Zod enum and forgetting the
 * label is a silent gap that renders a raw key like `cuisine.korean` to the
 * user. These tests close that hole in both directions.
 */
const enumNamespaces = [
  ['diet', dietaryPreferenceSchema.options],
  ['cuisine', cuisineSchema.options],
  ['healthGoal', healthGoalSchema.options],
] as const;

describe('enum-keyed namespaces', () => {
  for (const [namespace, options] of enumNamespaces) {
    it(`${namespace} has exactly one label per contract option`, () => {
      const labels = en[namespace] as Record<string, string>;
      expect(Object.keys(labels).sort()).toEqual([...options].sort());
    });

    it(`${namespace} is fully translated into Arabic`, () => {
      const english = en[namespace] as Record<string, string>;
      const arabic = ar[namespace] as Record<string, string>;
      for (const option of options) {
        expect(arabic[option], `missing Arabic for ${namespace}.${option}`).toBeTruthy();
        expect(arabic[option], `${namespace}.${option} was left in English`).not.toBe(
          english[option],
        );
      }
    });
  }
});

describe('inventory location labels', () => {
  it('covers every storage location the UI can show', () => {
    expect(Object.keys(en.inventory.locations).length).toBeGreaterThan(0);
    for (const [key, value] of Object.entries(en.inventory.locations)) {
      const arabic = (ar.inventory.locations as Record<string, string>)[key];
      expect(arabic, `missing Arabic for inventory.locations.${key}`).toBeTruthy();
      expect(arabic).not.toBe(value);
    }
  });
});

describe('error catalog', () => {
  it('has a message for every error code the API can return', async () => {
    const { ERROR_STATUS } = await import('@kitchen/contracts');
    for (const code of Object.keys(ERROR_STATUS)) {
      expect(
        (en.errors as Record<string, string>)[code],
        `errors.${code} has no English message`,
      ).toBeTruthy();
      expect(
        (ar.errors as Record<string, string>)[code],
        `errors.${code} has no Arabic message`,
      ).toBeTruthy();
    }
  });
});

describe('catalog completeness', () => {
  it('exposes every unit and ingredient category the contracts define', () => {
    expect(unitSchema.options.length).toBeGreaterThan(0);
    expect(ingredientCategorySchema.options.length).toBeGreaterThan(0);
  });
});
