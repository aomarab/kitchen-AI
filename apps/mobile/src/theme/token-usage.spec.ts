import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(__dirname, '..');

/**
 * Every TypeScript source file in the app except the tests themselves.
 */
function sourceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry) && !/\.spec\.tsx?$/.test(entry)) out.push(full);
    }
  };
  walk(SRC);
  return out;
}

/**
 * `theme/index.ts` computes the scaled line box; `AppText.tsx` is the single
 * primitive that applies it. Everywhere else, an absolute `lineHeight` opts
 * that text out of font scaling and clips it at large accessibility sizes.
 */
const LINE_HEIGHT_ALLOWED = [join('theme', 'index.ts'), join('components', 'AppText.tsx')];

describe('mobile source sweep', () => {
  /**
   * Apple requires a 44pt minimum touch target and Android 48dp. A regex sweep
   * over every file produces false positives — hairline dividers legitimately
   * set `height: 1`, and `shadowOffset` contains its own `height` — so each
   * interactive control is named with the property that carries its touch
   * dimension. Adding a control means adding a line here, which is the point:
   * it forces the size to be a decision rather than an accident.
   */
  const TOUCH_TARGETS: Record<string, RegExp> = {
    'Button.tsx': /minHeight:\s*(\d+)/,
    'Fab.tsx': /height:\s*(\d+)/,
    'Field.tsx': /minHeight:\s*(\d+)/,
    'Header.tsx': /minHeight:\s*(\d+)/,
    'QuantityStepper.tsx': /height:\s*(\d+)/,
    'StarRating.tsx': /minHeight:\s*(\d+)/,
  };

  it('keeps every interactive control at or above the 44pt minimum', () => {
    for (const [file, pattern] of Object.entries(TOUCH_TARGETS)) {
      const content = readFileSync(join(SRC, 'components', file), 'utf8');
      const match = content.match(pattern);
      expect(
        match,
        `${file} no longer declares the touch dimension this guard tracks. If ` +
          'the control was restyled, update the pattern; do not delete the entry.',
      ).not.toBeNull();
      expect(
        Number(match![1]),
        `${file} renders a touch target below the 44pt minimum Apple requires ` +
          '(Android asks for 48dp). Small targets are a rejection risk and a ' +
          'real barrier for anyone with a motor impairment.',
      ).toBeGreaterThanOrEqual(44);
    }
  });

  it('never sets a raw lineHeight outside the theme', () => {
    const offenders = sourceFiles()
      .filter((file) => !LINE_HEIGHT_ALLOWED.some((allowed) => file.endsWith(allowed)))
      .filter((file) => /lineHeight\s*:/.test(readFileSync(file, 'utf8')))
      .map((file) => relative(SRC, file));

    expect(
      offenders,
      'An absolute lineHeight outside theme/index.ts bypasses the font-scale ' +
        'maths, so React Native grows the text but not the box that holds it ' +
        'and the text clips at large Dynamic Type sizes. Use a typography ' +
        `variant instead. Offending files: ${offenders.join(', ')}`,
    ).toEqual([]);
  });
});
