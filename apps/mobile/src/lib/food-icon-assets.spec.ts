import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { allIconKeys } from './food-icon';

/**
 * The asset map cannot be imported here: it `require`s PNGs, which only Metro
 * can resolve. So this reads it as source, the same way the palette guards do.
 * A missing entry would otherwise ship as a blank square on a real shelf.
 */
const SOURCE = readFileSync(join(__dirname, 'food-icon-assets.ts'), 'utf8');
const ASSET_DIR = join(__dirname, '../../assets/emoji');

describe('bundled food icons', () => {
  it('has an asset entry for every key the mapping can produce', () => {
    const missing = allIconKeys().filter((key) => !new RegExp(`^  ${key},$`, 'm').test(SOURCE));
    expect(missing).toEqual([]);
  });

  it('has a real file behind every entry, so nothing renders blank', () => {
    const referenced = [...SOURCE.matchAll(/emoji\/([a-z]+)\.png/g)].map((m) => m[1]!);
    expect(referenced.length).toBeGreaterThan(0);
    const absent = referenced.filter((name) => !existsSync(join(ASSET_DIR, `${name}.png`)));
    expect(absent).toEqual([]);
  });

  it('ships no artwork the mapping can never reach', () => {
    const referenced = [...SOURCE.matchAll(/emoji\/([a-z]+)\.png/g)].map((m) => m[1]!);
    const reachable = new Set<string>(allIconKeys());
    expect(referenced.filter((name) => !reachable.has(name))).toEqual([]);
  });
});
