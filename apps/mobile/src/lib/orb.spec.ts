import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ORB_IMAGE_SCALE, ORB_MOTION, nextBlinkDelay, orbGeometry } from './orb';

const ASSETS = join(__dirname, '..', '..', 'assets', 'mama');

describe('orb geometry (spec §8.3)', () => {
  it('sizes the eyes from the orb', () => {
    const { eye, eyes } = orbGeometry(100, 'idle');
    expect(eye.width).toBeCloseTo(11);
    expect(eye.height).toBeCloseTo(22);
    expect(eyes.gap).toBeCloseTo(14);
  });

  it('grows the eyes to 0.26 while listening', () => {
    expect(orbGeometry(100, 'listening').eye.height).toBeCloseTo(26);
  });

  it('centres the eyes slightly above the middle', () => {
    for (const state of ['idle', 'listening'] as const) {
      const { eye, eyes } = orbGeometry(100, state);
      const centre = eyes.top + eye.height / 2;
      expect(centre, state).toBeLessThan(50);
      expect(centre, state).toBeGreaterThan(40);
    }
  });

  it('draws the body image centred, 2.4 times the orb, so the glow fits', () => {
    expect(ORB_IMAGE_SCALE).toBe(2.4);
    const { image } = orbGeometry(50, 'idle');
    expect(image.size).toBeCloseTo(120);
    expect(image.offset * 2 + image.size).toBeCloseTo(50);
  });
});

describe('orb motion (spec §8.3, §13)', () => {
  it('blinks every four to six seconds', () => {
    expect(nextBlinkDelay(() => 0)).toBe(4000);
    expect(nextBlinkDelay(() => 0.5)).toBe(5000);
    expect(nextBlinkDelay(() => 0.999999)).toBeLessThan(6000);
  });

  it('breathes between 1 and 1.04 over 1.6s while listening', () => {
    expect(ORB_MOTION.breathe).toEqual({ peak: 1.04, period: 1600 });
  });
});

describe('orb artwork', () => {
  it.each([
    ['orb.png', 288],
    ['orb@2x.png', 576],
    ['orb@3x.png', 864],
  ])('%s is a %ipx square RGBA PNG', (file, pixels) => {
    // 2.4 × 120pt at each scale: the largest orb stays sharp on a 3x screen.
    const header = readFileSync(join(ASSETS, file)).subarray(0, 26);
    expect(header.subarray(1, 4).toString('ascii')).toBe('PNG');
    expect(header.readUInt32BE(16)).toBe(pixels);
    expect(header.readUInt32BE(20)).toBe(pixels);
    expect(header[25], 'colour type 6 is RGBA, so the glow is transparent').toBe(6);
  });
});

describe('OrbMascot', () => {
  const source = readFileSync(join(__dirname, '..', 'components', 'OrbMascot.tsx'), 'utf8');

  it('is decorative to assistive technology', () => {
    expect(source).toMatch(/accessibilityElementsHidden/);
    expect(source).toMatch(/importantForAccessibility="no-hide-descendants"/);
  });

  it('stops under Reduce Motion, off screen and in the background', () => {
    expect(source).toMatch(/useReduceMotion\(\)/);
    expect(source).toMatch(/useIsFocused\(\)/);
    expect(source).toMatch(/useAppActive\(\)/);
  });

  it('animates with React Native Animated, not reanimated', () => {
    // Spec §13: reanimated 4 needs react-native-worklets, which is not a
    // declared dependency and so is not autolinked under pnpm.
    expect(source).not.toMatch(/react-native-reanimated/);
    expect(source).toMatch(/useNativeDriver: true/);
  });
});
