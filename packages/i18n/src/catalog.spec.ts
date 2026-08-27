import { describe, expect, it } from 'vitest';
import {
  cuisineSchema,
  dietaryPreferenceSchema,
  healthGoalSchema,
  ingredientCategorySchema,
  unitSchema,
} from '@kitchen/contracts';
import { ar, en, translate } from './index.js';
import { webAr } from './web.ar.js';
import { mobileAr } from './mobile.ar.js';
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
  const next = after
    .trim()
    .split(/\s+/)[0]
    ?.replace(/[.,:،؛!؟]/g, '');
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

/**
 * Three rules about the *characters* Arabic strings may contain. Each was
 * written after a defect that the whole test suite missed and a simulator run
 * caught in seconds.
 *
 * None of them carries an allowlist. A sweep of every Arabic string for Latin
 * letters was tried first and rejected: it flags every `{placeholder}` and
 * every brand name, and a rule maintained by exemptions is not a rule. What is
 * below instead names three narrow domains, each of which has an independent
 * reason to be free of the characters in question, and each of which is
 * therefore exemption-free.
 */
const AR_ONLY_CATALOGS = { ar, 'web.ar': webAr, 'mobile.ar': mobileAr };

/** Every `key.path` → string in a catalog, plural variants included. */
function* strings(node: unknown, path = ''): Generator<readonly [string, string]> {
  if (typeof node === 'string') {
    yield [path, node] as const;
    return;
  }
  if (isPluralMessage(node)) {
    for (const [form, value] of Object.entries(node.forms as Record<string, string>)) {
      yield [`${path}(${form})`, value] as const;
    }
    return;
  }
  if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      yield* strings(value, path ? `${path}.${key}` : key);
    }
  }
}

const ARABIC_INDIC_DIGIT = /[\u0660-\u0669\u06F0-\u06F9]/;
const LATIN_LETTERS = /[A-Za-z]/;
const PLACEHOLDER = /\{[a-zA-Z]+\}/;

const allArabicStrings = Object.entries(AR_ONLY_CATALOGS).flatMap(([catalog, node]) =>
  [...strings(node)].map(([path, value]) => [`${catalog}:${path}`, value] as const),
);

describe('Arabic reminder bodies', () => {
  /*
   * `reminders.stretch.body` shipped as "شو رأيك بدقيقتين Stretching؟" — an
   * English gerund in the middle of a Levantine sentence, read out by the
   * wellness nudge and the kiosk hero. Nothing caught it until it appeared on
   * a simulator, because a string being present and a string being translated
   * are different properties.
   *
   * The bodies take no interpolation and name no brands, so "no Latin letters"
   * is exactly right here and needs no exemption. They also carry no digits:
   * "five minutes" is spelled out, which sidesteps the numeral system entirely
   * in the one place the app cannot apply the user's numeral preference.
   */
  for (const [type, message] of Object.entries(ar.reminders)) {
    it(`${type} is written in Arabic, with no Latin left in it`, () => {
      expect(message.body).not.toMatch(LATIN_LETTERS);
    });

    it(`${type} spells its numbers rather than picking a numeral system`, () => {
      expect(message.body).not.toMatch(ARABIC_INDIC_DIGIT);
      expect(message.body).not.toMatch(/[0-9]/);
    });
  }
});

describe('Arabic numerals inside interpolated strings', () => {
  /*
   * A string that interpolates a number *and* hard-codes one renders both
   * numeral systems side by side: "قيّم 4 من ٥" is what `star` produced,
   * because the interpolated value follows the household's numeral preference
   * and the literal cannot.
   *
   * Strings with no placeholder are outside this rule for a real reason, not as
   * an exemption: `settings.numerals.eastern` is *supposed* to read
   * "عربية شرقية (١٢٣)" — showing the glyphs is the whole point of the option.
   */
  const interpolated = allArabicStrings.filter(([, value]) => PLACEHOLDER.test(value));

  it('sweeps a meaningful number of strings', () => {
    // Without this the rule below could pass by matching nothing at all.
    expect(interpolated.length).toBeGreaterThan(50);
  });

  it('never mixes an interpolated numeral with a hard-coded Arabic-Indic one', () => {
    const offenders = interpolated
      .filter(([, value]) => ARABIC_INDIC_DIGIT.test(value))
      .map(([path, value]) => `${path} → ${value}`);
    expect(offenders).toEqual([]);
  });
});

describe('Arabic error messages', () => {
  /*
   * Errors quote limits — "12 hours", "10 characters" — and those numbers are
   * read next to the app's own numerals, which are Latin unless the household
   * opts in. `errors.*` interpolates nothing, so spelling the numbers out is
   * both possible and unambiguous, and the rule has no exemptions.
   */
  it('spells limits out rather than hard-coding Arabic-Indic digits', () => {
    const offenders = [...strings(ar.errors)]
      .filter(([, value]) => ARABIC_INDIC_DIGIT.test(value))
      .map(([path, value]) => `errors.${path} → ${value}`);
    expect(offenders).toEqual([]);
  });
});
