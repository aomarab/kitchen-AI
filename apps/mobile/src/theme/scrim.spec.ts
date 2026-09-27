import { describe, expect, it } from 'vitest';
import { scrimGradient } from './scrim';
import { palettes, type ThemeMode } from './palettes';

describe.each(['light', 'dark'] as ThemeMode[])('photo scrim gradient, apricot %s', (mode) => {
  const { scrim } = palettes.apricot[mode];
  const gradient = scrimGradient(scrim);

  it('keeps every stop the palette guard measured, in order', () => {
    // palette.spec proves text is legible over these exact stops; the
    // gradient has to render the same ramp, not an approximation of it.
    expect(gradient.locations).toEqual(scrim.stops.map(([position]) => position));
  });

  it('paints each stop in the scrim colour at its alpha', () => {
    const channels = [1, 3, 5].map((i) => parseInt(scrim.rgb.slice(i, i + 2), 16)).join(',');
    expect(gradient.colors).toEqual(scrim.stops.map(([, alpha]) => `rgba(${channels},${alpha})`));
  });
});
