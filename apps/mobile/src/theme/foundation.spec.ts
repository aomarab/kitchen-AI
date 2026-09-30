import { describe, expect, it } from 'vitest';
import { radius, shadowFor, spacing } from './index';
import { palettes } from './palettes';

describe('Coral foundation tokens', () => {
  it('keeps only the square radius and camera shutter exception', () => {
    expect(radius).toEqual({ none: 0, shutter: 999 });
  });

  it('adds the J page gutter without changing the existing spacing ladder', () => {
    expect(spacing).toMatchObject({
      xs: 4,
      sm: 8,
      md: 12,
      lg: 16,
      gutter: 20,
      xl: 24,
      xxl: 32,
    });
  });

  it('exposes the three J elevations in light mode', () => {
    expect(shadowFor(palettes.coral.light)).toEqual({
      card: {
        shadowColor: expect.any(String),
        shadowOpacity: 0.07,
        shadowRadius: 20,
        shadowOffset: { width: 0, height: 6 },
        elevation: 2,
      },
      raised: {
        shadowColor: expect.any(String),
        shadowOpacity: 0.16,
        shadowRadius: 28,
        shadowOffset: { width: 0, height: 10 },
        elevation: 8,
      },
      sheet: {
        shadowColor: expect.any(String),
        shadowOpacity: 0.1,
        shadowRadius: 30,
        shadowOffset: { width: 0, height: -8 },
        elevation: 12,
      },
    });
  });
});
