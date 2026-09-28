import { describe, expect, it } from 'vitest';
import { usageCreditsFromUsd } from './usage-summary';

describe('usageCreditsFromUsd', () => {
  it('keeps zero spend at zero credits', () => {
    expect(usageCreditsFromUsd(0)).toBe(0);
  });

  it('expresses measured vendor spend against the credit basis', () => {
    expect(usageCreditsFromUsd(0.0996)).toBe(22.13);
  });

  it('rounds to two decimal places for localized quantity formatting', () => {
    expect(usageCreditsFromUsd(0.42)).toBe(93.33);
  });
});
