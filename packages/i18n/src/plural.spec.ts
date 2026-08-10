import { describe, expect, it } from 'vitest';
import { catalogs, plural, translate } from './index.js';
import { isPluralMessage, type PluralMessage } from './plural.js';

/**
 * `Expires in 1 days` shipped to a real screen, which is what these tests exist
 * to prevent. The interesting case is Arabic: it distinguishes six categories,
 * and two of them (`one`, `two`) do not splice the number in at all.
 */
describe('plural messages', () => {
  it('picks singular and plural wording in English', () => {
    expect(translate('en', 'inventory.expiresIn', { days: 1 })).toBe('Expires in 1 day');
    expect(translate('en', 'inventory.expiresIn', { days: 2 })).toBe('Expires in 2 days');
    expect(translate('en', 'inventory.expiresIn', { days: 12 })).toBe('Expires in 12 days');
  });

  it('uses every Arabic category, including the dual', () => {
    expect(translate('ar', 'inventory.expiresIn', { days: 1 })).toBe('ينتهي خلال يوم واحد');
    expect(translate('ar', 'inventory.expiresIn', { days: 2 })).toBe('ينتهي خلال يومين');
    expect(translate('ar', 'inventory.expiresIn', { days: 5 })).toBe('ينتهي خلال 5 أيام');
    expect(translate('ar', 'inventory.expiresIn', { days: 15 })).toBe('ينتهي خلال 15 يومًا');
    expect(translate('ar', 'inventory.expiresIn', { days: 100 })).toBe('ينتهي خلال 100 يوم');
  });

  /**
   * Arabic must not borrow English's category set. If `ar` only ever answered
   * with `one`/`other`, the dual above would silently read `ينتهي خلال 2 يوم`.
   */
  it('gives Arabic more forms than English for the same key', () => {
    const arEntry = catalogs.ar.inventory.expiresIn as unknown as PluralMessage;
    const enEntry = catalogs.en.inventory.expiresIn as unknown as PluralMessage;
    expect(Object.keys(arEntry.forms).length).toBeGreaterThan(Object.keys(enEntry.forms).length);
  });

  it('falls back to the locale’s own `other` rather than to English', () => {
    const sparse = plural('n', { other: 'ثابت {n}' });
    expect(isPluralMessage(sparse)).toBe(true);
    // 1 selects `one`, which this entry does not define.
    expect(sparse.forms.one).toBeUndefined();
  });

  it('treats a missing or non-numeric count as `other`', () => {
    expect(translate('en', 'inventory.expiresIn')).toBe('Expires in {days} days');
    expect(translate('en', 'inventory.expiresIn', { days: 'many' })).toBe('Expires in many days');
  });

  it('leaves plain string messages untouched', () => {
    expect(isPluralMessage('Expires today')).toBe(false);
    expect(translate('en', 'inventory.expiresToday')).toBe('Expires today');
  });

  /**
   * The category boundaries are the whole game, and they are not obvious: 100
   * is `other` rather than `many`, while 111 is `many` again because the rule
   * reads the last two digits. Hermes has no `Intl.PluralRules`, so these rules
   * are hand-written and need pinning at every edge.
   */
  describe('Arabic category boundaries', () => {
    const cases: Array<[number, string]> = [
      [1, 'ينتهي خلال يوم واحد'],
      [2, 'ينتهي خلال يومين'],
      [3, 'ينتهي خلال 3 أيام'],
      [10, 'ينتهي خلال 10 أيام'],
      [11, 'ينتهي خلال 11 يومًا'],
      [99, 'ينتهي خلال 99 يومًا'],
      [100, 'ينتهي خلال 100 يوم'],
      [101, 'ينتهي خلال 101 يوم'],
      [102, 'ينتهي خلال 102 يوم'],
      [103, 'ينتهي خلال 103 أيام'],
      [111, 'ينتهي خلال 111 يومًا'],
    ];

    for (const [days, expected] of cases) {
      it(`renders ${days} as “${expected}”`, () => {
        expect(translate('ar', 'inventory.expiresIn', { days })).toBe(expected);
      });
    }
  });

  it('does not depend on Intl.PluralRules', () => {
    const original = (Intl as { PluralRules?: unknown }).PluralRules;
    // Hermes simply has no such property; simulate that engine exactly.
    delete (Intl as { PluralRules?: unknown }).PluralRules;
    try {
      expect(translate('ar', 'inventory.expiresIn', { days: 2 })).toBe('ينتهي خلال يومين');
      expect(translate('en', 'inventory.expiresIn', { days: 1 })).toBe('Expires in 1 day');
    } finally {
      (Intl as { PluralRules?: unknown }).PluralRules = original;
    }
  });

  it('conjugates inventory.itemCount across every Arabic category', () => {
    expect(translate('en', 'inventory.itemCount', { count: 1 })).toBe('1 item');
    expect(translate('en', 'inventory.itemCount', { count: 5 })).toBe('5 items');
    expect(translate('ar', 'inventory.itemCount', { count: 1 })).toBe('صنف واحد');
    expect(translate('ar', 'inventory.itemCount', { count: 2 })).toBe('صنفان');
    expect(translate('ar', 'inventory.itemCount', { count: 5 })).toBe('5 أصناف');
    expect(translate('ar', 'inventory.itemCount', { count: 15 })).toBe('15 صنفًا');
    expect(translate('ar', 'inventory.itemCount', { count: 100 })).toBe('100 صنف');
  });

  /**
   * `recipe.servings` is invariant in English ("Serves 1", "Serves 4" — no
   * noun to inflect) but Arabic still distinguishes every category, which is
   * exactly the case rule 1 exists for: a sparse English entry does not force
   * a sparse Arabic one.
   */
  it('lets Arabic inflect a key that English never does', () => {
    expect(translate('en', 'recipe.servings', { count: 1 })).toBe('Serves 1');
    expect(translate('en', 'recipe.servings', { count: 4 })).toBe('Serves 4');
    expect(translate('ar', 'recipe.servings', { count: 1 })).toBe('تكفي شخصًا واحدًا');
    expect(translate('ar', 'recipe.servings', { count: 2 })).toBe('تكفي شخصين');
    expect(translate('ar', 'recipe.servings', { count: 15 })).toBe('تكفي 15 شخصًا');
  });

  /**
   * `web.capture.emptyPhotos` used to read `{count} photo(s) had nothing we
   * could recognise.` — the `(s)` hack this whole mechanism replaces.
   */
  it('removes the photo(s) hack from web.capture.emptyPhotos', () => {
    expect(translate('en', 'web.capture.emptyPhotos', { count: 1 })).toBe(
      '1 photo had nothing we could recognise.',
    );
    expect(translate('en', 'web.capture.emptyPhotos', { count: 3 })).toBe(
      '3 photos had nothing we could recognise.',
    );
    expect(translate('ar', 'web.capture.emptyPhotos', { count: 1 })).toBe(
      'صورة واحدة لم نتعرّف على أي شيء فيها.',
    );
    expect(translate('ar', 'web.capture.emptyPhotos', { count: 2 })).toBe(
      'صورتان لم نتعرّف على أي شيء فيهما.',
    );
    expect(translate('ar', 'web.capture.emptyPhotos', { count: 20 })).toBe(
      '20 صورةً لم نتعرّف على أي شيء فيها.',
    );
  });
});
