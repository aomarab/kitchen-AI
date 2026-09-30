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

  it('lets a packed row opt into uneven cell weights without changing the default', () => {
    const source = readFileSync(join(__dirname, 'Tile.tsx'), 'utf8');

    expect(source).toContain('weight?: number;');
    expect(source).toContain('const flex = items[index]?.props.weight ?? 1;');
    expect(source).toContain('style={{ flex, flexBasis: 0, minWidth: 0 }}');
    expect(source).toContain(
      'row.filler ? <View style={{ flex: 1, flexBasis: 0, minWidth: 0 }} />',
    );
  });

  it('keeps photo scrims by default while allowing an explicit opt-out', () => {
    const source = readFileSync(join(__dirname, 'Tile.tsx'), 'utf8');

    expect(source).toContain('scrim?: boolean;');
    expect(source).toContain('scrim = true');
    expect(source).toContain('scrim ? (');
    expect(source).toContain('<LinearGradient {...scrimGradient(scrimToken)}');
  });

  it('wraps photo images in a full-tile frame so percentages ignore tile padding', () => {
    const source = readFileSync(join(__dirname, 'Tile.tsx'), 'utf8');

    expect(source).toContain('const photoImageStyle: ImageStyle = {');
    expect(source).toContain("width: '100%'");
    expect(source).toContain("height: '100%'");
    expect(source).toMatch(
      /<View pointerEvents="none" style=\{StyleSheet\.absoluteFill\}>\s*<Image[\s\S]*?style=\{photoImageStyle\}/,
    );
  });
});
