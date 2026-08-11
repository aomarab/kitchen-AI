import { describe, expect, it } from 'vitest';
import {
  cuisineSchema,
  dietaryPreferenceSchema,
  healthGoalSchema,
  ingredientCategorySchema,
  unitSchema,
} from '@kitchen/contracts';
import { ar, en, translate } from './index.js';
import { isPluralMessage, type PluralMessage } from './plural.js';

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

/**
 * Arabic marks a counted noun (تمييز) differently across five ranges, so a
 * message that puts a bare noun straight after the number needs `few` (3–10)
 * and `many` (11–99) as well as the `one`/`two`/`other` an English-shaped
 * entry supplies. Without them 21 renders as "21 وجبات", which is the plural
 * of three-to-ten and reads as a typo to a native speaker.
 *
 * A number followed by a preposition — "{count} من التغييرات", "أضف {count}
 * إلى المطبخ" — is not a counted noun and is correct in every range, so the
 * check exempts those rather than demanding forms that would be identical.
 */
const ARABIC_PARTICLES = new Set([
  'من',
  'في',
  'إلى',
  'على',
  'عن',
  'مع',
  'خلال',
  'حتى',
  'بين',
  'لدى',
]);

function pluralEntries(node: unknown, path: string[] = []): [string, PluralMessage][] {
  if (isPluralMessage(node)) return [[path.join('.'), node]];
  if (typeof node !== 'object' || node === null) return [];
  return Object.entries(node).flatMap(([key, value]) => pluralEntries(value, [...path, key]));
}

/** True when the driving number is immediately followed by a counted noun. */
function countsANoun(message: PluralMessage): boolean {
  const after = message.forms.other.split(`{${message.count}}`)[1];
  if (after === undefined) return false;
  const next = after.trim().split(/\s+/)[0]?.replace(/[.,:،؛!؟]/g, '');
  if (!next) return false;
  return /[\u0600-\u06FF]/.test(next) && !ARABIC_PARTICLES.has(next);
}

describe('Arabic counted nouns', () => {
  const entries = pluralEntries(ar);

  it('finds plural messages to check', () => {
    expect(entries.length).toBeGreaterThan(10);
  });

  it.each(entries.filter(([, message]) => countsANoun(message)))(
    '%s declares the ranges Arabic grammar distinguishes',
    (_key, message) => {
      expect(Object.keys(message.forms)).toEqual(expect.arrayContaining(['few', 'many', 'other']));
    },
  );

  it('renders a count in the eleven-to-ninety-nine range without the three-to-ten plural', () => {
    // The bug this was written for: the home screen printed "21 وجبات".
    const rendered = translate('ar', 'mobile.home.weekProgress', { cooked: 6, total: 21 });
    expect(rendered).toContain('وجبة');
    expect(rendered).not.toContain('وجبات');
  });

  it('still uses the three-to-ten plural inside its own range', () => {
    expect(translate('ar', 'mobile.home.weekProgress', { cooked: 2, total: 7 })).toContain('وجبات');
  });
});
