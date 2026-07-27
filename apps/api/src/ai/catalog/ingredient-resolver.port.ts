import type { IngredientCategory, Unit } from '@kitchen/contracts';
import type { CatalogIngredientRef } from '../planner/types.js';

export type ResolveStrategy = 'exact' | 'alias' | 'embedding' | 'created' | 'unresolved';

export interface ResolveNameInput {
  name: string;
  /**
   * Canonical English name when the caller knows one. Tried after `name`
   * fails, and used for the English column when a row must be created.
   */
  nameEn?: string;
  /** Hints used only when a new catalog row must be created. */
  category?: IngredientCategory;
  defaultUnit?: Unit;
  nameAr?: string;
}

export interface ResolvedName {
  rawName: string;
  ingredient: CatalogIngredientRef | null;
  strategy: ResolveStrategy;
  confidence: number;
}

/**
 * Resolves free-text ingredient names (from vision, receipts, barcodes or
 * generated recipes) to canonical catalog rows. See spec §4.2 and §5.1. The
 * resolution ladder is exact → alias → embedding → create; embedding similarity
 * degrades gracefully to a no-op until embeddings are backfilled.
 */
export interface IngredientResolverPort {
  resolve(inputs: ResolveNameInput[], opts?: { createIfMissing?: boolean }): Promise<ResolvedName[]>;
  findByIds(ids: string[]): Promise<Map<string, CatalogIngredientRef>>;
  /** A sample of catalog names to supply as candidates in resolution prompts. */
  candidateNames(limit: number): Promise<string[]>;
  /**
   * Catalog names ranked by embedding proximity to `texts`, best first. Falls
   * back to `candidateNames` when embeddings are unavailable, so callers never
   * need to branch.
   */
  candidateNamesFor(texts: string[], limit: number): Promise<string[]>;
  /** Cache extra names/barcodes onto an existing catalog row (spec §5.2). */
  addAliases(ingredientId: string, aliases: string[]): Promise<void>;
}
