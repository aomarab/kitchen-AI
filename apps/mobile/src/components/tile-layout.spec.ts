import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BENTO_GUTTER, bentoRows } from './tile-layout';

describe('bento grid (spec §6.7)', () => {
  it('uses a 12pt gutter', () => {
    expect(BENTO_GUTTER).toBe(12);
  });

  it('pairs half tiles and gives a full tile its own row', () => {
    expect(bentoRows([2, 1, 1, 2])).toEqual([
      { indices: [0], filler: false },
      { indices: [1, 2], filler: false },
      { indices: [3], filler: false },
    ]);
  });

  it('keeps a lone half tile at half width instead of stretching it', () => {
    expect(bentoRows([1, 1, 1])).toEqual([
      { indices: [0, 1], filler: false },
      { indices: [2], filler: true },
    ]);
  });

  it('closes a half row before a full tile, preserving order', () => {
    expect(bentoRows([1, 2, 1])).toEqual([
      { indices: [0], filler: true },
      { indices: [1], filler: false },
      { indices: [2], filler: true },
    ]);
  });

  it('lays out nothing for no tiles', () => {
    expect(bentoRows([])).toEqual([]);
  });

  it('keeps row-layout callbacks inside the shared Bento primitive', () => {
    const source = readFileSync(join(__dirname, 'Tile.tsx'), 'utf8');

    expect(source).toContain('onRowLayout?:');
    expect(source).toContain('relative to the Bento container');
    expect(source).toContain('onRowLayout?.(row.indices, event.nativeEvent.layout.y)');
  });

  it('keeps half cells equal-width regardless of intrinsic content', () => {
    const source = readFileSync(join(__dirname, 'Tile.tsx'), 'utf8');

    expect(source).toContain('flexBasis: 0');
    expect(source).toContain('minWidth: 0');
  });
});
