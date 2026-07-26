import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, type SQL } from 'drizzle-orm';
import type {
  CreateIngredientRequest,
  Ingredient,
  SearchIngredientsQuery,
} from '@kitchen/contracts';
import { DB, type Database } from '../db/index.js';
import { ingredients } from '../db/schema.js';
import { AppError } from '../common/errors.js';
import { decodeCursor, toPage, type Page } from '../common/pagination.js';
import { bilingualNames, ingredientNameEquals, ingredientNameMatches } from './normalize.js';
import { toIngredient, type IngredientRow } from './catalog.serializer.js';

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: string }).code === '23505'
  );
}

@Injectable()
export class CatalogService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async search(query: SearchIngredientsQuery): Promise<Page<Ingredient>> {
    const offset = decodeCursor(query.cursor);
    const conditions: SQL[] = [ingredientNameMatches(query.q)];
    if (query.category) conditions.push(eq(ingredients.category, query.category));

    const rows = await this.db
      .select()
      .from(ingredients)
      .where(and(...conditions))
      .orderBy(asc(ingredients.canonicalNameEn))
      .limit(query.limit + 1)
      .offset(offset);

    const page = toPage(rows as IngredientRow[], offset, query.limit);
    return { items: page.items.map(toIngredient), nextCursor: page.nextCursor };
  }

  async create(dto: CreateIngredientRequest): Promise<Ingredient> {
    try {
      const [row] = await this.db
        .insert(ingredients)
        .values({
          canonicalNameEn: dto.canonicalNameEn,
          canonicalNameAr: dto.canonicalNameAr,
          category: dto.category,
          defaultUnit: dto.defaultUnit,
          aliases: dto.aliases,
          isStaple: dto.isStaple,
        })
        .returning();
      if (!row) throw new AppError('INTERNAL_ERROR');
      return toIngredient(row as IngredientRow);
    } catch (error) {
      if (isUniqueViolation(error)) throw AppError.conflict();
      throw error;
    }
  }

  /**
   * Resolve a free-text name (from a review submission) to a catalog id,
   * creating a minimal catalog row when nothing matches. Vision/receipt
   * resolution with embeddings lives in Agent B's AI module; this is the
   * deterministic fallback the inventory writes rely on.
   *
   * `ingredients` is global — shared by every household — so which column a
   * name lands in matters. When only one name is known it is filed under the
   * script it is actually written in, and mirrored into the other column as a
   * display fallback (both columns are NOT NULL, and showing the one name we
   * have beats showing none). Passing `nameAr` avoids the mirroring entirely,
   * which is why recognition threads both names through.
   */
  async resolveOrCreate(rawName: string, rawNameAr?: string): Promise<string> {
    const [existing] = await this.db
      .select({ id: ingredients.id })
      .from(ingredients)
      .where(ingredientNameEquals(rawName))
      .limit(1);
    if (existing) return existing.id;

    const { en, ar, aliases } = bilingualNames(rawName, rawNameAr);
    try {
      const [row] = await this.db
        .insert(ingredients)
        .values({
          canonicalNameEn: en,
          canonicalNameAr: ar,
          category: 'other',
          defaultUnit: 'piece',
          // Every spelling we were given is kept as an alias so
          // `ingredientNameEquals` resolves this row from either script later.
          aliases,
          isStaple: false,
        })
        .returning({ id: ingredients.id });
      if (row) return row.id;
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
    }

    // Lost a race (or the English name already existed) — re-resolve.
    const [row] = await this.db
      .select({ id: ingredients.id })
      .from(ingredients)
      .where(ingredientNameEquals(rawName))
      .limit(1);
    if (!row) throw new AppError('INTERNAL_ERROR');
    return row.id;
  }
}
