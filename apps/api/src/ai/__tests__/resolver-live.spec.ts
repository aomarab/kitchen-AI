import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { inArray, sql } from 'drizzle-orm';
import { createTestContext, type TestContext } from '../../testing/harness.js';
import { ingredients } from '../../db/schema.js';
import { DrizzleIngredientResolver } from '../catalog/drizzle-ingredient-resolver.js';
import { MockEmbeddings } from '../catalog/mock-embeddings.js';

/**
 * Exercises the real create/match path against the real database.
 *
 * The unit tests around `splitByScript` all passed while `create()` still wrote
 * Arabic into the English column, because they never called `create()`. This
 * spec is the one that actually fails against the old code.
 */
describe('DrizzleIngredientResolver (live DB)', () => {
  const ctx: TestContext = createTestContext();
  const resolver = new DrizzleIngredientResolver(ctx.db as never, new MockEmbeddings());
  let seededId: string;
  const tag = Math.random().toString(36).slice(2, 8);
  const seededEn = `Feta cheese ${tag}`;
  const seededAr = `جبن فيتا ${tag}`;

  beforeAll(async () => {
    const rows = await ctx.db
      .insert(ingredients)
      .values({
        canonicalNameEn: seededEn,
        canonicalNameAr: seededAr,
        aliases: [],
        category: 'dairy',
        defaultUnit: 'g',
        isStaple: false,
      })
      .returning({ id: ingredients.id });
    seededId = rows[0]!.id;
  });

  afterAll(async () => {
    // Deleted by tag, not by the ids this spec happened to collect: the catalog
    // is global, and a failing assertion is exactly when a row gets created
    // without being recorded. Cleaning up only the happy path leaves the
    // pollution behind precisely when the test caught pollution.
    await ctx.db
      .delete(ingredients)
      .where(
        sql`${ingredients.canonicalNameEn} LIKE ${'%' + tag} OR ${ingredients.canonicalNameAr} LIKE ${'%' + tag}`,
      );
    await ctx.client.end();
  });

  it('matches an existing English row via nameEn instead of minting a duplicate', async () => {
    // The real failure: an Arabic weekly plan asked for "جبن فيتا", missed the
    // English-seeded catalog, and created a second feta. The household's own
    // feta then no longer matched its own recipe, so coverage reported a
    // shortfall for cheese sitting in the fridge.
    const unseenArabic = `جبنة بيضاء ${tag}`;
    const [result] = await resolver.resolve([{ name: unseenArabic, nameEn: seededEn }], {
      createIfMissing: true,
    });

    expect(result!.ingredient?.id).toBe(seededId);
    expect(result!.strategy).toBe('exact');

    const dupes = await ctx.db
      .select({ id: ingredients.id })
      .from(ingredients)
      .where(sql`${ingredients.canonicalNameEn} = ${unseenArabic}`);
    expect(dupes).toHaveLength(0);
  });

  it('still prefers the locale name when it matches', async () => {
    const [result] = await resolver.resolve([{ name: seededAr, nameEn: 'Something else' }], {
      createIfMissing: false,
    });
    expect(result!.ingredient?.id).toBe(seededId);
  });

  it('creates a new row with the English name in the English column', async () => {
    const arabic = `مكون مخترع ${tag}`;
    const english = `Invented ingredient ${tag}`;
    const [result] = await resolver.resolve([{ name: arabic, nameEn: english }], {
      createIfMissing: true,
    });

    expect(result!.strategy).toBe('created');
    const id = result!.ingredient!.id;

    const [row] = await ctx.db
      .select({
        en: ingredients.canonicalNameEn,
        ar: ingredients.canonicalNameAr,
        aliases: ingredients.aliases,
      })
      .from(ingredients)
      .where(inArray(ingredients.id, [id]));

    expect(row!.en).not.toMatch(/[\u0600-\u06FF]/);
    expect(row!.en.toLowerCase()).toContain('invented ingredient');
    expect(row!.ar).toBe(arabic);
    // Both spellings become aliases, so the next plan matches this row rather
    // than creating a third.
    expect(row!.aliases.map((a) => a.toLowerCase())).toEqual(
      expect.arrayContaining([arabic.toLowerCase(), english.toLowerCase()]),
    );
  });

  it('matches the row it just created when the same Arabic name comes back', async () => {
    const arabic = `مكون متكرر ${tag}`;
    const english = `Repeat ingredient ${tag}`;
    const [first] = await resolver.resolve([{ name: arabic, nameEn: english }], {
      createIfMissing: true,
    });

    const [second] = await resolver.resolve([{ name: arabic }], { createIfMissing: true });
    expect(second!.ingredient?.id).toBe(first!.ingredient!.id);
    expect(second!.strategy).not.toBe('created');
  });
});
