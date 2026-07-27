/**
 * WCAG 2.1 contrast, for the palette spec next door.
 *
 * Deliberately a copy of the web helper rather than a shared package: this is
 * standard arithmetic, the apps share no UI code, and mobile's Vitest runs in a
 * node environment that cannot resolve web's module aliases.
 */

function channels(hex: string): [number, number, number] {
  const raw = hex.trim().replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(raw)) throw new Error(`not a hex colour: ${hex}`);
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(raw.slice(i, i + 2), 16));
  return [r!, g!, b!];
}

function linearise(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map(linearise);
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
