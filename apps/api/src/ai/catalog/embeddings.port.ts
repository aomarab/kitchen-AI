/**
 * Text embeddings for catalog matching.
 *
 * Split from {@link AiProvider} on purpose: embeddings are a different model,
 * a different price, and are called in bulk from a backfill rather than one
 * request at a time.
 */
export interface EmbeddingsPort {
  /** Vector dimensions produced. Must match the `vector(n)` column. */
  readonly dimensions: number;
  /** Embeds in input order. Returns one vector per input. */
  embed(texts: string[]): Promise<number[][]>;
}

/**
 * The text an ingredient is indexed by. Both scripts and the aliases go in, so
 * "زبدة" and "unsalted butter" land near "Butter". Kept here so the backfill
 * and any future re-index cannot drift apart.
 */
export function ingredientEmbeddingText(row: {
  canonicalNameEn: string;
  canonicalNameAr: string;
  aliases?: string[] | null;
}): string {
  return [row.canonicalNameEn, row.canonicalNameAr, ...(row.aliases ?? [])]
    .map((v) => v.trim())
    .filter((v) => v.length > 0)
    .join(' | ');
}
