/**
 * The bento grid (spec §6.7): two columns with a 12pt gutter. Kept free of
 * React Native so the row packing is testable on its own.
 */
export const BENTO_GUTTER = 12;

export type TileSpan = 1 | 2;

export interface BentoRow {
  /** Indices into the children, in reading order. */
  indices: number[];
  /** True when a half tile stands alone and an empty half keeps its width. */
  filler: boolean;
}

/**
 * Packs spans into rows: a full tile takes a row alone and half tiles pair up.
 * A half tile with no partner keeps its half rather than stretching, so the
 * grid never shows a lone tile twice the width of the one above it.
 */
export function bentoRows(spans: readonly TileSpan[]): BentoRow[] {
  const rows: BentoRow[] = [];
  let pending: number | null = null;
  spans.forEach((span, index) => {
    if (span === 2) {
      if (pending !== null) rows.push({ indices: [pending], filler: true });
      pending = null;
      rows.push({ indices: [index], filler: false });
    } else if (pending === null) {
      pending = index;
    } else {
      rows.push({ indices: [pending, index], filler: false });
      pending = null;
    }
  });
  if (pending !== null) rows.push({ indices: [pending], filler: true });
  return rows;
}
