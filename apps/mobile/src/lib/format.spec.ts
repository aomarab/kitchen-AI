import { describe, expect, it } from 'vitest';
import { createTranslator, directionFor, isRtl } from '@kitchen/i18n';
import { ApiError } from '@kitchen/api-client';
import { errorMessageKey } from '../lib/errors';
import { unitSchema, storageLocationTypeSchema, type Unit } from '@kitchen/contracts';
import {
  formatDaysLeft,
  formatExpiryLabel,
  formatDateWithHijri,
  formatMeasure,
  formatWeekday,
  hijriCaption,
  ingredientName,
  itemName,
  localizedName,
  locationLabel,
  unitLabel,
} from '../lib/format';

const NOW = new Date('2026-07-26T12:00:00');

describe('direction selection', () => {
  it('is rtl for Arabic and ltr for English', () => {
    expect(directionFor('ar')).toBe('rtl');
    expect(directionFor('en')).toBe('ltr');
    expect(isRtl('ar')).toBe(true);
    expect(isRtl('en')).toBe(false);
  });
});

describe('bilingual name selection', () => {
  it('picks the language-appropriate string', () => {
    expect(localizedName('en', 'Onion', 'بصل')).toBe('Onion');
    expect(localizedName('ar', 'Onion', 'بصل')).toBe('بصل');
  });

  it('reads the catalog name in the active language', () => {
    const ingredient = { canonicalNameEn: 'Garlic', canonicalNameAr: 'ثوم' };
    expect(ingredientName('en', ingredient)).toBe('Garlic');
    expect(ingredientName('ar', ingredient)).toBe('ثوم');
  });
});

describe('formatExpiryLabel', () => {
  const t = createTranslator('en');

  it('is null without a date', () => {
    expect(formatExpiryLabel(t, 'en', null, {}, NOW)).toBeNull();
  });

  it('renders expired / today / future through i18n', () => {
    expect(formatExpiryLabel(t, 'en', '2026-07-24', {}, NOW)).toBe('Expired');
    expect(formatExpiryLabel(t, 'en', '2026-07-26', {}, NOW)).toBe('Expires today');
    expect(formatExpiryLabel(t, 'en', '2026-07-29', {}, NOW)).toBe('Expires in 3 days');
  });

  it('uses Eastern Arabic numerals when requested', () => {
    const ar = createTranslator('ar');
    const label = formatExpiryLabel(ar, 'ar', '2026-07-29', { easternNumerals: true }, NOW);
    expect(label).toContain('٣');
  });
});

describe('formatDaysLeft', () => {
  const en = createTranslator('en');
  const ar = createTranslator('ar');

  it('is null without a date', () => {
    expect(formatDaysLeft(en, 'en', null, {}, NOW)).toBeNull();
    expect(formatDaysLeft(ar, 'ar', null, {}, NOW)).toBeNull();
  });

  it('renders expired and today through the short kitchen copy', () => {
    expect(formatDaysLeft(en, 'en', '2026-07-24', {}, NOW)).toBe('Expired');
    expect(formatDaysLeft(en, 'en', '2026-07-26', {}, NOW)).toBe('Today');
    expect(formatDaysLeft(ar, 'ar', '2026-07-24', {}, NOW)).toBe('منتهي الصلاحية');
    expect(formatDaysLeft(ar, 'ar', '2026-07-26', {}, NOW)).toBe('اليوم');
  });

  it('renders compact English day counts', () => {
    expect(formatDaysLeft(en, 'en', '2026-07-27', {}, NOW)).toBe('1 day left');
    expect(formatDaysLeft(en, 'en', '2026-07-28', {}, NOW)).toBe('2 days left');
    expect(formatDaysLeft(en, 'en', '2026-07-31', {}, NOW)).toBe('5 days left');
    expect(formatDaysLeft(en, 'en', '2026-08-10', {}, NOW)).toBe('15 days left');
  });

  it('renders compact Arabic day counts with requested numerals', () => {
    const prefs = { easternNumerals: true };
    expect(formatDaysLeft(ar, 'ar', '2026-07-27', prefs, NOW)).toBe('يوم واحد');
    expect(formatDaysLeft(ar, 'ar', '2026-07-28', prefs, NOW)).toBe('يومان');
    expect(formatDaysLeft(ar, 'ar', '2026-07-31', prefs, NOW)).toBe('٥ أيام');
    expect(formatDaysLeft(ar, 'ar', '2026-08-10', prefs, NOW)).toBe('١٥ يومًا');
  });
});

describe('formatWeekday', () => {
  it('formats the weekday through the shared date formatter', () => {
    expect(formatWeekday('en', new Date('2026-09-24T12:00:00'))).toBe('Thursday');
    expect(formatWeekday('ar', new Date('2026-09-24T12:00:00'))).toBe('الخميس');
  });
});

describe('hijriCaption', () => {
  const iso = '2026-09-28T00:00:00';

  it('is null for English even when the Hijri setting is on', () => {
    expect(hijriCaption('en', iso, true)).toBeNull();
  });

  it('returns the Hijri companion date for Arabic when the setting is on', () => {
    expect(hijriCaption('ar', iso, true)).toContain('هـ');
  });

  it('is null for Arabic when the Hijri setting is off', () => {
    expect(hijriCaption('ar', iso, false)).toBeNull();
  });

  it('keeps formatDateWithHijri on the same Hijri eligibility rule', () => {
    expect(formatDateWithHijri('en', iso, true, { month: 'short', day: 'numeric' })).not.toContain(
      'هـ',
    );
    expect(formatDateWithHijri('ar', iso, true, { month: 'short', day: 'numeric' })).toContain(
      'هـ',
    );
  });
});

describe('error-envelope rendering', () => {
  it('turns a server error code into a translated message', () => {
    const t = createTranslator('en');
    const error = new ApiError(429, { code: 'RATE_LIMITED', messageKey: 'errors.RATE_LIMITED' });
    const rendered = t(errorMessageKey(error));
    expect(rendered).toBeTruthy();
    expect(rendered).not.toBe('errors.RATE_LIMITED');
  });
});

describe('unit labels', () => {
  // The unit catalog moved out of the mobile-owned namespace so the web app
  // could share it; mobile must still resolve every unit through the new keys.
  it('resolves every contract unit in both languages', () => {
    const en = createTranslator('en');
    const ar = createTranslator('ar');
    for (const unit of unitSchema.options as readonly Unit[]) {
      expect(unitLabel(en, unit), unit).not.toBe(`units.${unit}`);
      expect(unitLabel(ar, unit), unit).not.toBe(`units.${unit}`);
      expect(unitLabel(ar, unit), unit).not.toBe(unitLabel(en, unit));
    }
  });
});

describe('formatMeasure', () => {
  const en = createTranslator('en');
  const ar = createTranslator('ar');

  it('uses kitchen fraction glyphs for counted and word units', () => {
    expect(formatMeasure(en, 'en', 2.5, 'piece')).toBe('2½ pc');
    expect(formatMeasure(en, 'en', 1.25, 'bunch')).toBe('1¼ bunches');
  });

  it('pluralises English word units by count', () => {
    expect(formatMeasure(en, 'en', 5, 'clove')).toBe('5 cloves');
    expect(formatMeasure(en, 'en', 1, 'clove')).toBe('1 clove');
  });

  it('keeps mass and volume abbreviations decimal', () => {
    expect(formatMeasure(en, 'en', 1.5, 'kg')).toBe('1.5 kg');
  });

  it('uses native Arabic CLDR forms for word units', () => {
    expect(formatMeasure(ar, 'ar', 1, 'clove')).toBe('فص واحد');
    expect(formatMeasure(ar, 'ar', 2, 'clove')).toBe('فصان');
    expect(formatMeasure(ar, 'ar', 3, 'clove')).toBe('3 فصوص');
    expect(formatMeasure(ar, 'ar', 11, 'clove')).toBe('11 فصًا');
  });

  it('keeps Arabic numeral preferences when rendering fractions', () => {
    expect(formatMeasure(ar, 'ar', 1.25, 'bunch', { easternNumerals: true })).toBe('١¼ حزمة');
  });
});

describe('storage location labels', () => {
  // The server stores a location's `name` as seeded English prose. Mobile used to
  // render it raw, so Arabic users saw "Fridge" next to Arabic item names.
  it('translates every contract location type in both languages', () => {
    const en = createTranslator('en');
    const ar = createTranslator('ar');
    for (const type of storageLocationTypeSchema.options) {
      const location = { type };
      expect(locationLabel(en, location), type).not.toBe(`inventory.locations.${type}`);
      expect(locationLabel(ar, location), type).not.toBe(`inventory.locations.${type}`);
      expect(locationLabel(ar, location), type).not.toBe(locationLabel(en, location));
    }
  });

  it('ignores a seeded English name so Arabic does not read "Fridge"', () => {
    const t = createTranslator('ar');
    expect(locationLabel(t, { type: 'fridge', name: 'Fridge' })).toBe(
      locationLabel(t, { type: 'fridge' }),
    );
  });

  // A place the household added is named in the user's own words, in whichever
  // language they typed. Translating that to "Other" loses the only thing that
  // told them which shelf it was.
  it('shows a name the household chose itself', () => {
    const ar = createTranslator('ar');
    const en = createTranslator('en');
    expect(locationLabel(ar, { type: 'other', name: 'رف فوق الفرن' })).toBe('رف فوق الفرن');
    expect(locationLabel(en, { type: 'fridge', name: 'Garage fridge' })).toBe('Garage fridge');
  });

  it('falls back to the type when the chosen name is blank', () => {
    const t = createTranslator('en');
    expect(locationLabel(t, { type: 'pantry', name: '   ' })).toBe(
      locationLabel(t, { type: 'pantry' }),
    );
  });
});

describe('itemName', () => {
  const ingredient = { canonicalNameEn: 'Tomato', canonicalNameAr: 'طماطم' } as never;

  it('uses the catalog name in the reader language when the item is not renamed', () => {
    expect(itemName('en', { label: null, ingredient })).toBe('Tomato');
    expect(itemName('ar', { label: null, ingredient })).toBe('طماطم');
  });

  it("prefers the household's own name for the item", () => {
    expect(itemName('en', { label: 'Cherry toms', ingredient })).toBe('Cherry toms');
  });

  it('keeps that name in both languages, because the household wrote it once', () => {
    expect(itemName('ar', { label: 'Cherry toms', ingredient })).toBe('Cherry toms');
  });
});
