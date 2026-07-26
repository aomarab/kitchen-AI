import { describe, it, expect } from 'vitest';
import { unitSchema, type Unit } from '@kitchen/contracts';
import { createTranslator } from '@kitchen/i18n';
import { unitKey } from './labels';

const UNITS = unitSchema.options as readonly Unit[];

/**
 * Units used to be rendered as the raw contract enum value (`piece`, `tbsp`),
 * which is unreadable in an Arabic UI, and the only translations that existed
 * lived under the mobile-owned `mobile.units.*` namespace where the web app
 * could not reach them.
 */
describe('unitKey', () => {
  it('resolves every contract unit in English', () => {
    const t = createTranslator('en');
    for (const unit of UNITS) {
      const label = t(unitKey(unit));
      expect(label, unit).not.toBe(unitKey(unit));
      expect(label.length, unit).toBeGreaterThan(0);
    }
  });

  it('resolves every contract unit in Arabic, and does not fall back to English', () => {
    const ar = createTranslator('ar');
    const en = createTranslator('en');
    for (const unit of UNITS) {
      const label = ar(unitKey(unit));
      expect(label, unit).not.toBe(unitKey(unit));
      // Every unit has a genuinely different Arabic form; an identical string
      // means the Arabic catalog silently fell through to the English one.
      expect(label, unit).not.toBe(en(unitKey(unit)));
      expect(/[\u0600-\u06FF]/.test(label), `${unit} -> ${label}`).toBe(true);
    }
  });

  it('never renders the bare enum value to the user', () => {
    const ar = createTranslator('ar');
    for (const unit of UNITS) {
      expect(ar(unitKey(unit)), unit).not.toBe(unit);
    }
  });
});
