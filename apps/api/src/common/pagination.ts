/**
 * Opaque offset cursors for the `paginatedSchema` responses. The cursor is just
 * a base64url-encoded row offset — enough for the catalog and inventory lists,
 * and cheap to make opaque so clients never depend on its shape.
 */

export function decodeCursor(cursor: string | undefined): number {
  if (!cursor) return 0;
  try {
    const value = Number(Buffer.from(cursor, 'base64url').toString('utf8'));
    return Number.isInteger(value) && value >= 0 ? value : 0;
  } catch {
    return 0;
  }
}

export function encodeCursor(offset: number): string {
  return Buffer.from(String(offset)).toString('base64url');
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

/**
 * Given `limit + 1` rows fetched at `offset`, slice to the page and compute the
 * next cursor.
 */
export function toPage<T>(rows: T[], offset: number, limit: number): Page<T> {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  return { items, nextCursor: hasMore ? encodeCursor(offset + limit) : null };
}
