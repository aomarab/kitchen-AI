import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, isNotNull, isNull, sql, type SQL } from 'drizzle-orm';
import type {
  ListProductCommentsQuery,
  ListProductFeedbackQuery,
  ProductComment,
  ProductFeedback,
  ProductFeedbackRow,
  ProductFeedbackSummary,
  SubmitProductFeedbackRequest,
} from '@kitchen/contracts';
import { DB, type Database } from '../db/index.js';
import { ingredients, inventoryItems, productFeedback } from '../db/schema.js';
import { AppError } from '../common/errors.js';
import { decodeCursor, toPage, type Page } from '../common/pagination.js';
import { toIso, toNumber } from '../common/serialization.js';

/**
 * A rating is an integer, so its average is exact to two decimals and the
 * extra digits `avg()` returns are noise that makes 2.0 render as 2.0000001.
 */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Two reviews are of the same product when the ingredient matches and the brand
 * matches case-insensitively — including "both unbranded", which plain SQL
 * equality would call *unknown* rather than true and quietly drop.
 */
function sameBrand(brand: string | null): SQL {
  return brand === null
    ? isNull(productFeedback.brand)
    : sql`lower(${productFeedback.brand}) = lower(${brand})`;
}

/**
 * Feedback about products, which is passed on to the brands that make them.
 *
 * The product identity is resolved from an inventory item on the way in and
 * then stored, never looked up again through the item: see the `product_feedback`
 * table comment for why an opinion has to outlive the jar it was written about.
 */
@Injectable()
export class ProductFeedbackService {
  constructor(@Inject(DB) private readonly db: Database) {}

  /**
   * Record what this household thinks of a product.
   *
   * Re-reviewing replaces the previous row rather than adding one — a vendor
   * report where a single account can file fifty ratings is not evidence. The
   * upsert targets the unique index directly, so two taps racing each other
   * settle in the database rather than in a read-then-write the second tap
   * would lose.
   */
  async submit(
    householdId: string,
    userId: string,
    itemId: string,
    body: SubmitProductFeedbackRequest,
  ): Promise<ProductFeedback> {
    const [item] = await this.db
      .select({ ingredientId: inventoryItems.ingredientId, brand: inventoryItems.brand })
      .from(inventoryItems)
      .where(and(eq(inventoryItems.id, itemId), eq(inventoryItems.householdId, householdId)));
    // Scoping the lookup to the household is the authorization: you can only
    // review food you actually have, and a stranger's item is simply not found.
    if (!item) throw AppError.notFound('errors.NOT_FOUND');

    /*
     * Raw SQL because the conflict target is a functional index
     * (`lower(coalesce(brand, ''))`) and drizzle 0.38's `onConflictDoUpdate`
     * can only name plain columns — handed an expression it emits
     * `on conflict ("undefined")`, which fails at runtime rather than at
     * compile time. Measured, not assumed: the generated SQL was printed.
     *
     * The upsert is one statement so two taps racing each other settle in the
     * database. A read-then-write would let the second tap lose its rating.
     */
    const rows = await this.db.execute<{
      id: string;
      ingredient_id: string;
      brand: string | null;
      rating: number;
      message: string | null;
      created_at: Date;
    }>(sql`
      insert into product_feedback (user_id, ingredient_id, brand, rating, message, locale)
      values (
        ${userId}::uuid,
        ${item.ingredientId}::uuid,
        ${item.brand},
        ${body.rating},
        ${body.message ?? null},
        ${body.locale}::locale
      )
      on conflict (user_id, ingredient_id, lower(coalesce(brand, '')))
      do update set
        rating = excluded.rating,
        -- Assigned rather than left alone: a second review that drops the text
        -- must not leave the old words attached to the new rating.
        message = excluded.message,
        locale = excluded.locale,
        updated_at = now()
      returning id, ingredient_id, brand, rating, message, created_at
    `);
    const row = rows[0];
    if (!row) throw new AppError('INTERNAL_ERROR', 'errors.INTERNAL_ERROR');

    return {
      id: row.id,
      ingredientId: row.ingredient_id,
      brand: row.brand,
      rating: row.rating,
      message: row.message,
      createdAt: toIso(row.created_at),
    };
  }

  /** The reader's own review of the product this item is, plus everyone else's. */
  async forItem(
    householdId: string,
    userId: string,
    itemId: string,
  ): Promise<ProductFeedbackSummary> {
    const [item] = await this.db
      .select({ ingredientId: inventoryItems.ingredientId, brand: inventoryItems.brand })
      .from(inventoryItems)
      .where(and(eq(inventoryItems.id, itemId), eq(inventoryItems.householdId, householdId)));
    if (!item) throw AppError.notFound('errors.NOT_FOUND');

    const product = and(
      eq(productFeedback.ingredientId, item.ingredientId),
      sameBrand(item.brand),
    )!;

    const [stats] = await this.db
      .select({
        count: sql<number>`count(*)::int`,
        average: sql<string | null>`avg(${productFeedback.rating})`,
      })
      .from(productFeedback)
      .where(product);

    const [mine] = await this.db
      .select()
      .from(productFeedback)
      .where(and(product, eq(productFeedback.userId, userId)));

    return {
      mine: mine
        ? {
            id: mine.id,
            ingredientId: mine.ingredientId,
            brand: mine.brand,
            rating: mine.rating,
            message: mine.message,
            createdAt: toIso(mine.createdAt),
          }
        : null,
      averageRating: stats?.average == null ? null : round2(toNumber(stats.average)),
      count: stats?.count ?? 0,
    };
  }

  /**
   * The vendor report: one row per product, worst first.
   *
   * Grouping is on `lower(brand)` because the barcode source returns "Almarai"
   * and "ALMARAI" for one company, and splitting a vendor across two rows
   * understates both. The displayed spelling is `min()` of the variants — an
   * arbitrary choice, but a stable one, so a report does not reshuffle its own
   * labels between runs.
   */
  async list(query: ListProductFeedbackQuery): Promise<Page<ProductFeedbackRow>> {
    const offset = decodeCursor(query.cursor);
    const filters: SQL[] = [];
    if (query.brand) filters.push(sql`lower(${productFeedback.brand}) = lower(${query.brand})`);
    if (query.ingredientId) filters.push(eq(productFeedback.ingredientId, query.ingredientId));

    const average = sql<string>`avg(${productFeedback.rating})`;
    const rows = await this.db
      .select({
        ingredientId: productFeedback.ingredientId,
        nameEn: ingredients.canonicalNameEn,
        nameAr: ingredients.canonicalNameAr,
        brand: sql<string | null>`min(${productFeedback.brand})`,
        count: sql<number>`count(*)::int`,
        average,
        commentCount: sql<number>`count(${productFeedback.message})::int`,
        r1: sql<number>`count(*) filter (where ${productFeedback.rating} = 1)::int`,
        r2: sql<number>`count(*) filter (where ${productFeedback.rating} = 2)::int`,
        r3: sql<number>`count(*) filter (where ${productFeedback.rating} = 3)::int`,
        r4: sql<number>`count(*) filter (where ${productFeedback.rating} = 4)::int`,
        r5: sql<number>`count(*) filter (where ${productFeedback.rating} = 5)::int`,
      })
      .from(productFeedback)
      .innerJoin(ingredients, eq(ingredients.id, productFeedback.ingredientId))
      .where(filters.length ? and(...filters) : undefined)
      .groupBy(
        productFeedback.ingredientId,
        ingredients.canonicalNameEn,
        ingredients.canonicalNameAr,
        sql`lower(${productFeedback.brand})`,
      )
      // `maxAverage` filters the aggregate, so it belongs in HAVING; a WHERE
      // would test one review at a time and let a 1★ drag in a product that
      // averages 4.
      .having(query.maxAverage === undefined ? undefined : sql`avg(${productFeedback.rating}) <= ${query.maxAverage}`)
      // Worst first: the report exists to find what to fix.
      .orderBy(average, desc(sql`count(*)`), productFeedback.ingredientId)
      .limit(query.limit + 1)
      .offset(offset);

    return toPage(
      rows.map((row) => {
        const byRating: Record<string, number> = {};
        for (const [key, value] of [
          ['1', row.r1],
          ['2', row.r2],
          ['3', row.r3],
          ['4', row.r4],
          ['5', row.r5],
        ] as const) {
          if (value > 0) byRating[key] = value;
        }
        return {
          ingredientId: row.ingredientId,
          nameEn: row.nameEn,
          nameAr: row.nameAr,
          brand: row.brand,
          count: row.count,
          averageRating: round2(toNumber(row.average)),
          byRating,
          commentCount: row.commentCount,
        };
      }),
      offset,
      query.limit,
    );
  }

  /**
   * The comments a vendor is actually sent.
   *
   * Ratings without words are excluded: they are already counted in the report,
   * and a page of blank rows buries the ones that say something. No submitter
   * identity is selected — the vendor gets the opinion, not the customer.
   */
  async comments(query: ListProductCommentsQuery): Promise<Page<ProductComment>> {
    const offset = decodeCursor(query.cursor);
    const filters: SQL[] = [isNotNull(productFeedback.message)];
    if (query.brand) filters.push(sql`lower(${productFeedback.brand}) = lower(${query.brand})`);
    if (query.ingredientId) filters.push(eq(productFeedback.ingredientId, query.ingredientId));
    if (query.rating !== undefined) filters.push(eq(productFeedback.rating, query.rating));

    const rows = await this.db
      .select({
        id: productFeedback.id,
        rating: productFeedback.rating,
        message: productFeedback.message,
        locale: productFeedback.locale,
        createdAt: productFeedback.createdAt,
        brand: productFeedback.brand,
        nameEn: ingredients.canonicalNameEn,
        nameAr: ingredients.canonicalNameAr,
      })
      .from(productFeedback)
      .innerJoin(ingredients, eq(ingredients.id, productFeedback.ingredientId))
      .where(and(...filters))
      // `id` breaks ties so two rows written in the same millisecond cannot swap
      // places between pages and drop one from the result.
      .orderBy(desc(productFeedback.createdAt), desc(productFeedback.id))
      .limit(query.limit + 1)
      .offset(offset);

    return toPage(
      rows.map((row) => ({
        id: row.id,
        rating: row.rating,
        message: row.message ?? '',
        locale: row.locale,
        createdAt: toIso(row.createdAt),
        brand: row.brand,
        nameEn: row.nameEn,
        nameAr: row.nameAr,
      })),
      offset,
      query.limit,
    );
  }
}
