import { describe, expect, it } from 'vitest';
import { createTranslator, directionFor, isRtl } from '@kitchen/i18n';
import { ApiError } from '@kitchen/api-client';
import { errorMessageKey } from '../lib/errors';
import { unitSchema, storageLocationTypeSchema, type Unit } from '@kitchen/contracts';
import {
  formatExpiryLabel,
  ingredientName,
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

  it('ignores the server-supplied name', () => {
    const t = createTranslator('ar');
    expect(locationLabel(t, { type: 'fridge', name: 'Fridge' } as never)).toBe(
      locationLabel(t, { type: 'fridge' }),
    );
  });
});
