import { describe, expect, it } from 'vitest';
import { iconStrokeWidth, illustrationStrokeWidth } from './stroke';

describe('J Coral stroke scaling', () => {
  it('keeps icons visually heavy enough at small sizes', () => {
    expect(iconStrokeWidth(16)).toBe(2.25);
    expect(iconStrokeWidth(18)).toBe(2);
    expect(iconStrokeWidth(24)).toBe(1.75);
    expect(iconStrokeWidth(32)).toBe(1.75);
  });

  it('uses the illustration visual stroke tiers from the spec', () => {
    expect(illustrationStrokeWidth(39)).toBe(1.5);
    expect(illustrationStrokeWidth(40)).toBe(1.75);
    expect(illustrationStrokeWidth(55)).toBe(1.75);
    expect(illustrationStrokeWidth(56)).toBe(2);
    expect(illustrationStrokeWidth(72)).toBe(2);
  });
});
