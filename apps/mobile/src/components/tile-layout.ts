/** The J place-tile grid: two columns with a 16pt gutter. */
export const BENTO_TILE_COLUMNS = 2;
export const BENTO_TILE_GAP = 16;
/** The J quick-action grid: three columns with a 10pt gutter. */
export const BENTO_QUICK_ACTION_COLUMNS = 3;
export const BENTO_QUICK_ACTION_GAP = 10;
/** @deprecated J: removed in C16. Use `bentoGap('tiles')`. */
export const BENTO_GUTTER = BENTO_TILE_GAP;

export type BentoVariant = 'tiles' | 'quickActions';
export type TileSpan = 1 | 2 | 3;

export interface BentoRow {
  /** Indices into the children, in reading order. */
  indices: number[];
  /** True when a partial row keeps empty columns rather than stretching. */
  filler: boolean;
}

export function bentoColumns(variant: BentoVariant = 'tiles'): number {
  return variant === 'quickActions' ? BENTO_QUICK_ACTION_COLUMNS : BENTO_TILE_COLUMNS;
}

export function bentoGap(variant: BentoVariant = 'tiles'): number {
  return variant === 'quickActions' ? BENTO_QUICK_ACTION_GAP : BENTO_TILE_GAP;
}

export function bentoColumnWidth(containerWidth: number, variant: BentoVariant = 'tiles'): number {
  const columns = bentoColumns(variant);
  const gap = bentoGap(variant);
  return Math.floor((containerWidth - gap * (columns - 1)) / columns);
}

export function bentoRows(spans: readonly TileSpan[], columns = BENTO_TILE_COLUMNS): BentoRow[] {
  const rows: BentoRow[] = [];
  let current: number[] = [];
  let used = 0;

  const flush = () => {
    if (current.length === 0) return;
    rows.push({ indices: current, filler: used < columns });
    current = [];
    used = 0;
  };

  spans.forEach((rawSpan, index) => {
    const span = Math.min(Math.max(1, rawSpan), columns);
    if (span === columns) {
      flush();
      rows.push({ indices: [index], filler: false });
      return;
    }
    if (used + span > columns) flush();
    current.push(index);
    used += span;
    if (used === columns) flush();
  });
  flush();
  return rows;
}
