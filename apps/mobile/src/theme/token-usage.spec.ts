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
