import { describe, expect, it } from 'vitest';
import { estimateChipWidth } from './ar-pins';
import { buildArPinLabel } from './ar-pin-labels';

const t = (key: string, params?: Record<string, unknown>) => {
  if (key === 'mobile.capture.pinUnsure') return `${params?.name}, not sure`;
  if (key === 'mobile.capture.pinLabel') return `${params?.name}, ${params?.quantity}`;
  return key;
};

describe('buildArPinLabel', () => {
  it('builds the visible label, accessibility label and chip width for confident items', () => {
    expect(
      buildArPinLabel({
        name: 'Vine tomatoes',
        quantity: '6 pc',
        lowConfidence: false,
        locale: 'en',
        t,
      }),
    ).toEqual({
      text: 'Vine tomatoes · 6 pc',
      accessibilityLabel: 'Vine tomatoes, 6 pc',
      width: estimateChipWidth('Vine tomatoes · 6 pc'),
    });
  });

  it('marks low-confidence items as unsure instead of pretending the quantity is certain', () => {
    expect(
      buildArPinLabel({
        name: 'Olive oil',
        quantity: '1 bottle',
        lowConfidence: true,
        locale: 'en',
        t,
      }),
    ).toEqual({
      text: 'Olive oil?',
      accessibilityLabel: 'Olive oil, not sure',
      width: estimateChipWidth('Olive oil?'),
    });
  });

  it('uses native Arabic punctuation for unsure Arabic labels', () => {
    expect(
      buildArPinLabel({
        name: 'بقدونس',
        quantity: 'حزمة واحدة',
        lowConfidence: true,
        locale: 'ar',
        t,
      }),
    ).toEqual({
      text: 'بقدونس؟',
      accessibilityLabel: 'بقدونس, not sure',
      width: estimateChipWidth('بقدونس؟'),
    });
  });
});
