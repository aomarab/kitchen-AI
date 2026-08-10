import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(__dirname, '..');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return entry === 'mocks' ? [] : sourceFiles(full);
    return /\.(ts|tsx)$/.test(entry) && !/\.spec\.tsx?$/.test(entry) ? [full] : [];
  });
}

/**
 * Apple Guideline 1.1.7 and Google's In-App Review policy both forbid using a
 * collected sentiment to decide who is shown the native store-review prompt.
 * Now that the app collects a star rating, wiring it to `StoreReview` is a
 * plausible-looking one-line change that would make the app rejectable.
 *
 * This is a grep, not a type check, on purpose: the violation is the presence
 * of the capability near the rating, and no type system expresses that.
 */
describe('store review policy', () => {
  const files = sourceFiles(SRC);

  it('finds source files to check, or this test proves nothing', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it('never imports a store-review API', () => {
    const offenders = files.filter((file) => {
      const source = readFileSync(file, 'utf8');
      return /expo-store-review|StoreReview|requestReview/.test(source);
    });

    expect(offenders).toEqual([]);
  });
});
