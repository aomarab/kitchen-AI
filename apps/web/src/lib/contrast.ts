/**
 * WCAG 2.1 relative-luminance contrast, plus a reader for the design tokens in
 * `app/globals.css`.
 *
 * The CSS stays the single source of truth: nothing here restates a colour
 * value, so the palette test cannot drift from what actually ships.
 */

export type Theme = 'light' | 'dark';

/** Splits `#rgb` or `#rrggbb` into 0-255 channels. */
export function channels(hex: string): [number, number, number] {
  const raw = hex.trim().replace('#', '');
  const full = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw;
  if (!/^[0-9a-f]{6}$/i.test(full)) throw new Error(`not a hex colour: ${hex}`);
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
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

/** WCAG contrast ratio, 1 (identical) to 21 (black on white). Order-independent. */
export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

const LIGHT_BLOCK = /:root\s*\{([^}]*)\}/;
const DARK_BLOCK = /prefers-color-scheme:\s*dark\s*\)\s*\{\s*:root\s*\{([^}]*)\}/;

/**
 * Pulls the hex custom properties out of one theme block. Non-colour
 * declarations in the same block (`line-height`, the `--track-*` family) are
 * skipped by the hex pattern. `:root:lang(ar)` cannot match either block
 * because both require `{` to follow `:root` directly.
 */
export function readTokens(css: string, theme: Theme): Record<string, string> {
  const block = (theme === 'light' ? LIGHT_BLOCK : DARK_BLOCK).exec(css);
  if (!block?.[1]) throw new Error(`no ${theme} :root block found in globals.css`);
  const tokens: Record<string, string> = {};
  for (const match of block[1].matchAll(/--([a-z-]+):\s*(#[0-9a-f]{3,8})\s*;/gi)) {
    tokens[match[1]!] = match[2]!;
  }
  return tokens;
}
