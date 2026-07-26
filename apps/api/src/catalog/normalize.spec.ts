import { describe, expect, it } from 'vitest';
import { bilingualNames, isArabicScript, normalizeArabic } from './normalize.js';

describe('isArabicScript', () => {
  it.each(['طماطم', 'بصل أحمر', 'زَيْت زَيْتُون'])('detects Arabic in %s', (value) => {
    expect(isArabicScript(value)).toBe(true);
  });

  it.each(['Tomato', 'Extra virgin olive oil', '2% milk'])('does not flag %s', (value) => {
    expect(isArabicScript(value)).toBe(false);
  });
});

/**
 * `ingredients` is one global table shared by every household, so a name landing
 * in the wrong column is not a local display bug — it renames that food for
 * everyone. Recognition knows both names; the API has to keep them apart.
 */
describe('bilingualNames', () => {
  it('keeps each name in its own column when both are known', () => {
    expect(bilingualNames('Tomato', 'طماطم')).toEqual({
      en: 'Tomato',
      ar: 'طماطم',
      aliases: ['Tomato', 'طماطم'],
    });
  });

  it('trusts the script over the field name when the two are swapped', () => {
    // The manual-add path sends whatever the user typed as `rawName`, so in an
    // Arabic session the Arabic name arrives first.
    expect(bilingualNames('طماطم', 'Tomato')).toEqual({
      en: 'Tomato',
      ar: 'طماطم',
      aliases: ['Tomato', 'طماطم'],
    });
  });

  it('mirrors a lone English name', () => {
    expect(bilingualNames('Tomato')).toEqual({ en: 'Tomato', ar: 'Tomato', aliases: ['Tomato'] });
  });

  it('mirrors a lone Arabic name rather than dropping it', () => {
    expect(bilingualNames('طماطم')).toEqual({ en: 'طماطم', ar: 'طماطم', aliases: ['طماطم'] });
  });

  it('trims and collapses a duplicated name to a single alias', () => {
    expect(bilingualNames('  Tomato  ', 'Tomato')).toEqual({
      en: 'Tomato',
      ar: 'Tomato',
      aliases: ['Tomato'],
    });
  });

  it('treats a blank translation as absent', () => {
    expect(bilingualNames('Tomato', '   ')).toEqual({
      en: 'Tomato',
      ar: 'Tomato',
      aliases: ['Tomato'],
    });
  });

  it('keeps both aliases resolvable after Arabic normalization', () => {
    const { aliases } = bilingualNames('Avocado', 'أفوكادو');
    expect(aliases.map(normalizeArabic)).toContain(normalizeArabic('افوكادو'));
  });
});
