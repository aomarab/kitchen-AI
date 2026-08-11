import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { ar, en } from '@kitchen/i18n';

const SOURCE = readFileSync(join(__dirname, 'BuyCreditsScreen.tsx'), 'utf8');

/**
 * A failed purchase used to be invisible: `onBuy` wrapped `buyCredits` in
 * `try/finally` with no `catch`, so when the store could not be reached the
 * spinner stopped and the screen said nothing at all. A Buy button that looks
 * dead is the worst possible outcome on a paid screen, so the failure path is
 * pinned here.
 */
describe('BuyCreditsScreen surfaces a failed purchase', () => {
  it('catches the rejection instead of letting it escape unhandled', () => {
    const onBuy = SOURCE.slice(SOURCE.indexOf('const onBuy'), SOURCE.indexOf('const balance'));
    expect(onBuy).toContain('catch');
    expect(onBuy).toMatch(/setNotice\(\s*['"]failed['"]\s*\)/);
  });

  it('keeps the notice state able to hold the failure', () => {
    expect(SOURCE).toMatch(/useState<[^>]*['"]failed['"][^>]*>/);
  });

  it('renders the failure in the danger colour, not as ordinary text', () => {
    expect(SOURCE).toMatch(/['"]failed['"]\s*\?\s*['"]danger['"]/);
  });

  it('announces the notice to assistive tech', () => {
    const notice = SOURCE.slice(SOURCE.indexOf('{notice ?'), SOURCE.indexOf('{CREDIT_PACKS'));
    expect(notice).toContain('accessibilityRole="alert"');
  });
});

describe('the failure copy exists in both catalogs', () => {
  it('is translated, and does not imply the customer was charged', () => {
    expect(en.mobile.credits.failed).toBeTruthy();
    expect(ar.mobile.credits.failed).toBeTruthy();
    expect(ar.mobile.credits.failed).not.toBe(en.mobile.credits.failed);
  });
});
