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

export interface BentoRowCell {
  index: number;
  span: number;
}

export interface BentoLayoutCell extends BentoRowCell {
  width: number;
}

export interface BentoLayoutRow {
  cells: BentoLayoutCell[];
  fillerSpan: number;
  fillerWidth: number;
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

function normalizedSpan(span: TileSpan | number, columns: number): number {
  return Math.min(Math.max(1, Math.trunc(span)), columns);
}

function spanRows(
  spans: readonly TileSpan[],
  columns: number,
): { cells: BentoRowCell[]; used: number }[] {
  const rows: { cells: BentoRowCell[]; used: number }[] = [];
  let current: BentoRowCell[] = [];
  let used = 0;

  const flush = () => {
    if (current.length === 0) return;
    rows.push({ cells: current, used });
    current = [];
    used = 0;
  };

  spans.forEach((rawSpan, index) => {
    const span = normalizedSpan(rawSpan, columns);
    if (span === columns) {
      flush();
      rows.push({ cells: [{ index, span }], used: columns });
      return;
    }
    if (used + span > columns) flush();
    current.push({ index, span });
    used += span;
    if (used === columns) flush();
  });
  flush();
  return rows;
}

export function bentoCellWidth(
  containerWidth: number,
  span: TileSpan | number,
  variant: BentoVariant = 'tiles',
): number {
  const columns = bentoColumns(variant);
  const gap = bentoGap(variant);
  const safeSpan = normalizedSpan(span as TileSpan, columns);
  const columnWidth = (containerWidth - gap * (columns - 1)) / columns;
  return columnWidth * safeSpan + gap * (safeSpan - 1);
}

export function bentoRowLayout(
  spans: readonly TileSpan[],
  variant: BentoVariant = 'tiles',
  containerWidth = 0,
): BentoLayoutRow[] {
  const columns = bentoColumns(variant);
  return spanRows(spans, columns).map((row) => {
    const fillerSpan = Math.max(0, columns - row.used);
    return {
      cells: row.cells.map((cell) => ({
        ...cell,
        width: bentoCellWidth(containerWidth, cell.span, variant),
      })),
      fillerSpan,
      fillerWidth: fillerSpan > 0 ? bentoCellWidth(containerWidth, fillerSpan, variant) : 0,
    };
  });
}

export function bentoRows(spans: readonly TileSpan[], columns = BENTO_TILE_COLUMNS): BentoRow[] {
  return spanRows(spans, columns).map((row) => ({
    indices: row.cells.map((cell) => cell.index),
    filler: row.used < columns,
  }));
}
