import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BENTO_QUICK_ACTION_COLUMNS,
  BENTO_QUICK_ACTION_GAP,
  BENTO_TILE_COLUMNS,
  BENTO_TILE_GAP,
  bentoCellWidth,
  bentoColumnWidth,
  bentoGap,
  bentoRowLayout,
  bentoRows,
} from './tile-layout';

describe('bento grid (spec §8)', () => {
  it('uses the J tile and quick-action grid gaps', () => {
    expect(BENTO_TILE_COLUMNS).toBe(2);
    expect(BENTO_TILE_GAP).toBe(16);
    expect(BENTO_QUICK_ACTION_COLUMNS).toBe(3);
    expect(BENTO_QUICK_ACTION_GAP).toBe(10);
    expect(bentoGap('tiles')).toBe(16);
    expect(bentoGap('quickActions')).toBe(10);
    expect(bentoColumnWidth(350, 'tiles')).toBe(167);
    expect(bentoColumnWidth(350, 'quickActions')).toBe(110);
    expect(bentoCellWidth(350, 2, 'quickActions')).toBe(230);
    expect(bentoCellWidth(350, 3, 'quickActions')).toBe(350);
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

  it('closes a partial row before a full tile, preserving order', () => {
    expect(bentoRows([1, 2, 1])).toEqual([
      { indices: [0], filler: true },
      { indices: [1], filler: false },
      { indices: [2], filler: true },
    ]);
  });

  it('packs quick actions in rows of three', () => {
    expect(bentoRows([1, 1, 1, 1], 3)).toEqual([
      { indices: [0, 1, 2], filler: false },
      { indices: [3], filler: true },
    ]);
  });

  it('computes span-aware quick-action cell and filler widths', () => {
    expect(bentoRowLayout([2, 1, 1], 'quickActions', 350)).toEqual([
      {
        cells: [
          { index: 0, span: 2, layout: { width: 230 } },
          { index: 1, span: 1, layout: { width: 110 } },
        ],
        fillerSpan: 0,
        fillers: [],
      },
      {
        cells: [{ index: 2, span: 1, layout: { width: 110 } }],
        fillerSpan: 2,
        fillers: [{ width: 230 }],
      },
    ]);
  });

  it('computes span-aware tile cell and filler widths', () => {
    expect(bentoRowLayout([1, 2, 1], 'tiles', 350)).toEqual([
      {
        cells: [{ index: 0, span: 1, layout: { width: 167 } }],
        fillerSpan: 1,
        fillers: [{ width: 167 }],
      },
      {
        cells: [{ index: 1, span: 2, layout: { width: 350 } }],
        fillerSpan: 0,
        fillers: [],
      },
      {
        cells: [{ index: 2, span: 1, layout: { width: 167 } }],
        fillerSpan: 1,
        fillers: [{ width: 167 }],
      },
    ]);
  });

  it('uses base flex semantics for weighted tile rows without fillers', () => {
    const [row] = bentoRowLayout([1, 1], 'tiles', 350, [3, 2]);

    expect(row?.fillerSpan).toBe(0);
    expect(row?.fillers).toEqual([]);
    expect(row?.cells[0]).toEqual({ index: 0, span: 1, layout: { flex: 3 } });
    expect(row?.cells[1]).toEqual({ index: 1, span: 1, layout: { flex: 2 } });
  });

  it('uses base flex semantics for a single weighted tile plus filler', () => {
    const [row] = bentoRowLayout([1], 'tiles', 350, [1.4]);

    expect(row?.fillerSpan).toBe(1);
    expect(row?.cells[0]).toEqual({ index: 0, span: 1, layout: { flex: 1.4 } });
    expect(row?.fillers).toEqual([{ flex: 1 }]);
  });

  it('uses base flex semantics for weighted quick-action rows without fillers', () => {
    const [row] = bentoRowLayout([1, 1, 1], 'quickActions', 350, [1, 2, 1]);

    expect(row?.fillerSpan).toBe(0);
    expect(row?.fillers).toEqual([]);
    expect(row?.cells[0]).toEqual({ index: 0, span: 1, layout: { flex: 1 } });
    expect(row?.cells[1]).toEqual({ index: 1, span: 1, layout: { flex: 2 } });
    expect(row?.cells[2]).toEqual({ index: 2, span: 1, layout: { flex: 1 } });
  });

  it('uses span fallback for unweighted cells inside a weighted quick-action row', () => {
    const [row] = bentoRowLayout([2, 1], 'quickActions', 350, [undefined, 1]);

    expect(row?.fillerSpan).toBe(0);
    expect(row?.fillers).toEqual([]);
    expect(row?.cells[0]).toEqual({ index: 0, span: 2, layout: { flex: 2 } });
    expect(row?.cells[1]).toEqual({ index: 1, span: 1, layout: { flex: 1 } });
  });

  it('lays out nothing for no tiles', () => {
    expect(bentoRows([])).toEqual([]);
  });

  it('keeps row-layout callbacks inside the shared Bento primitive', () => {
    const source = readFileSync(join(__dirname, 'Tile.tsx'), 'utf8');

    expect(source).toContain('onRowLayout?:');
    expect(source).toContain('relative to the Bento container');
    expect(source).toContain('const indices = row.cells.map((cell) => cell.index)');
    expect(source).toContain('onRowLayout?.(indices, event.nativeEvent.layout.y)');
  });

  it('keeps cells equal-width regardless of intrinsic content', () => {
    const source = readFileSync(join(__dirname, 'Tile.tsx'), 'utf8');

    expect(source).toContain('flexBasis: 0');
    expect(source).toContain('minWidth: 0');
    expect(source).toContain(
      'const pressableStyle: ViewStyle | undefined = inBento ? { flex: 1 } : undefined',
    );
    expect(source).toContain('style={pressableStyle}');
  });

  it('keeps place tiles fixed-height and top-aligned inside bento rows', () => {
    const source = readFileSync(join(__dirname, 'Tile.tsx'), 'utf8');

    expect(source).toContain('const PLACE_TILE_MIN_HEIGHT = 158');
    expect(source).toContain('const baseHeight = height ?? tileMinHeight(variant)');
    expect(source).toContain('quickAction ? { minHeight: baseHeight } : { height: baseHeight }');
    expect(source).toContain('gap: spacing.sm');
    expect(source).not.toContain('<View style={{ flex: 1 }} />');
  });

  it('renders rows from the span-aware layout helper instead of item count', () => {
    const source = readFileSync(join(__dirname, 'Tile.tsx'), 'utf8');

    expect(source).toContain('weight?: number;');
    expect(source).toContain('bentoRowLayout(');
    expect(source).toContain('items.map((item) => item.props.weight)');
    expect(source).toContain('style={bentoLayoutStyle(cell.layout)}');
    expect(source).toContain('row.fillers.map((filler, index)');
    expect(source).toContain('style={bentoLayoutStyle(filler)}');
    expect(source).not.toContain('columns - row.indices.length');
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

    expect(source).toContain(
      "const photoImageStyle: ImageStyle = { width: '100%', height: '100%' };",
    );
    expect(source).toMatch(
      /<View pointerEvents="none" style=\{StyleSheet\.absoluteFill\}>\s*<Image[\s\S]*?style=\{photoImageStyle\}/,
    );
  });
});
