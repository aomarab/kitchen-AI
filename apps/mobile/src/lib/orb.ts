/**
 * Geometry and timing for Mama's orb (spec §8.3). Pure, so the proportions
 * are specified by `orb.spec.ts` rather than by eye.
 */
export type OrbState = 'idle' | 'looking' | 'listening' | 'speaking';

/** The body PNG is this many times the orb, so its glow fits inside it. */
export const ORB_IMAGE_SCALE = 2.4;

export const ORB_MOTION = {
  blink: { close: 80, open: 120, squash: 0.1 },
  /** How far the eyes travel each way while `looking`, as a share of the orb. */
  glance: { travel: 0.06, move: 420, hold: 280 },
  breathe: { peak: 1.04, period: 1600 },
  pulse: { peak: 1.06, period: 520 },
} as const;

export interface OrbGeometry {
  /** The body image: its side, and its offset from the orb's top and start. */
  image: { size: number; offset: number };
  eye: { width: number; height: number };
  /** `gap` is between the eyes' inner edges; `top` is from the orb's top. */
  eyes: { gap: number; top: number };
}

/** Where the eyes' centre sits, as a share of the orb from its top. */
const EYE_CENTRE = 0.44;

export function orbGeometry(size: number, state: OrbState): OrbGeometry {
  const imageSize = size * ORB_IMAGE_SCALE;
  const height = size * (state === 'listening' ? 0.26 : 0.22);
  return {
    image: { size: imageSize, offset: (size - imageSize) / 2 },
    eye: { width: size * 0.11, height },
    eyes: { gap: size * 0.14, top: size * EYE_CENTRE - height / 2 },
  };
}

/** Milliseconds until the next idle blink: somewhere in 4–6s, so it never ticks. */
export function nextBlinkDelay(random: () => number = Math.random): number {
  return 4000 + Math.floor(random() * 2000);
}
