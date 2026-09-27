import type { Scrim } from './palettes';

export interface ScrimGradient {
  colors: readonly [string, string, ...string[]];
  locations: readonly [number, number, ...number[]];
}

/**
 * Turns the palette's scrim into `LinearGradient` props, stop for stop, so the
 * ramp on screen is exactly the one `palette.spec.ts` measured text against.
 */
export function scrimGradient(scrim: Scrim): ScrimGradient {
  const channels = [1, 3, 5].map((i) => parseInt(scrim.rgb.slice(i, i + 2), 16)).join(',');
  const colors = scrim.stops.map(([, alpha]) => `rgba(${channels},${alpha})`);
  const locations = scrim.stops.map(([position]) => position);
  return {
    colors: colors as unknown as ScrimGradient['colors'],
    locations: locations as unknown as ScrimGradient['locations'],
  };
}
