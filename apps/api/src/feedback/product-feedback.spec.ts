import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import {
  cleanup,
  createTestContext,
  seedHousehold,
  seedIngredients,
  seedUser,
} from '../testing/harness.js';
import { inventoryItems, productFeedback, storageLocations } from '../db/schema.js';
import { ProductFeedbackService } from './product-feedback.service.js';

const ctx = createTestContext();
const households: string[] = [];
const users: string[] = [];
const ingredients: string[] = [];

let service: ProductFeedbackService;
let userId: string;
let householdId: string;
let locationId: string;
let milk: string;
let rice: string;

/** An item in the household's kitchen, which is the only thing you can review. */
async function seedItem(ingredientId: string, brand: string | null, household = householdId) {
  const place =
    household === householdId
      ? locationId
      : ((
          await ctx.db
            .insert(storageLocations)
            .values({ householdId: household, name: 'Fridge', type: 'fridge' })
            .returning({ id: storageLocations.id })
        )[0]?.id ?? '');
  const [row] = await ctx.db
    .insert(inventoryItems)
    .values({
      householdId: household,
      ingredientId,
      locationId: place,
      quantity: '1',
      unit: 'piece',
      brand,
      source: 'manual',
    })
    .returning({ id: inventoryItems.id });
  if (!row) throw new Error('failed to seed item');
  return row.id;
}

/*
 * A fresh pair of products per test, not per file.
 *
 * The average and the vendor report count every household deliberately — that
 * is the feature. So a product shared between tests accumulates their reviews,
 * and an assertion of "2 reviews" starts passing or failing depending on which
 * tests ran first. Isolation has to come from the product, not the household.
 */
beforeEach(async () => {
  const seeded = await seedIngredients(ctx.db, 2);
  milk = seeded[0]!;
  rice = seeded[1]!;
  ingredients.push(...seeded);
  userId = await seedUser(ctx.db);
  householdId = await seedHousehold(ctx.db, userId);
  users.push(userId);
  households.push(householdId);
  const [place] = await ctx.db
    .insert(storageLocations)
    .values({ householdId, name: 'Fridge', type: 'fridge' })
    .returning({ id: storageLocations.id });
  locationId = place!.id;
  service = new ProductFeedbackService(ctx.db);
});

afterAll(async () => {
  await cleanup(ctx.db, { households, users, ingredients });
  await ctx.client.end();
});

describe('ProductFeedbackService', () => {
  describe('submit', () => {
    it('snapshots the product from the item, not from the client', async () => {
      const item = await seedItem(milk, 'Almarai');

      const saved = await service.submit(householdId, userId, item, {
        rating: 2,
        message: 'Soured before the date on the carton.',
        locale: 'en',
      });

      expect(saved.ingredientId).toBe(milk);
      expect(saved.brand).toBe('Almarai');
      expect(saved.rating).toBe(2);
    });

    it('survives the item being eaten', async () => {
      const item = await seedItem(milk, 'Almarai');
      await service.submit(householdId, userId, item, { rating: 2, locale: 'en' });

      // The jar goes; the opinion about the product does not.
      await ctx.db.delete(inventoryItems).where(eq(inventoryItems.id, item));

      const rows = await ctx.db
        .select()
        .from(productFeedback)
        .where(eq(productFeedback.userId, userId));
      expect(rows).toHaveLength(1);
      expect(rows[0]?.brand).toBe('Almarai');
    });

    it('replaces a review rather than stacking a second one', async () => {
      const item = await seedItem(milk, 'Almarai');
      const first = await service.submit(householdId, userId, item, { rating: 2, locale: 'en' });
      const second = await service.submit(householdId, userId, item, {
        rating: 5,
        message: 'The next carton was fine.',
        locale: 'en',
      });

      expect(second.id).toBe(first.id);
      const rows = await ctx.db
        .select()
        .from(productFeedback)
        .where(eq(productFeedback.userId, userId));
      expect(rows).toHaveLength(1);
      expect(rows[0]?.rating).toBe(5);
      expect(rows[0]?.message).toBe('The next carton was fine.');
    });

    it('clears the message when a re-review drops it', async () => {
      const item = await seedItem(milk, 'Almarai');
      await service.submit(householdId, userId, item, { rating: 2, message: 'Bad', locale: 'en' });
      await service.submit(householdId, userId, item, { rating: 4, locale: 'en' });

      const [row] = await ctx.db
        .select()
        .from(productFeedback)
        .where(eq(productFeedback.userId, userId));
      // Leaving the old text under a new rating would attribute "Bad" to 4★.
      expect(row?.message).toBeNull();
    });

    it('treats two brands of the same ingredient as different products', async () => {
      // Two brands in the same place would pool into one slot with a null
      // brand (inventory_unique_slot), so they have to be shelved separately
      // for there to be two products to review at all.
      const [pantry] = await ctx.db
        .insert(storageLocations)
        .values({ householdId, name: 'Pantry', type: 'pantry' })
        .returning({ id: storageLocations.id });
      const a = await seedItem(milk, 'Almarai');
      const [b] = await ctx.db
        .insert(inventoryItems)
        .values({
          householdId,
          ingredientId: milk,
          locationId: pantry!.id,
          quantity: '1',
          unit: 'piece',
          brand: 'Nadec',
          source: 'manual',
        })
        .returning({ id: inventoryItems.id });
      await service.submit(householdId, userId, a, { rating: 1, locale: 'en' });
      await service.submit(householdId, userId, b!.id, { rating: 5, locale: 'en' });

      const rows = await ctx.db
        .select()
        .from(productFeedback)
        .where(eq(productFeedback.userId, userId));
      expect(rows).toHaveLength(2);
    });

    it('refuses an item from another household', async () => {
      const strangerUser = await seedUser(ctx.db);
      const stranger = await seedHousehold(ctx.db, strangerUser);
      users.push(strangerUser);
      households.push(stranger);
      const theirs = await seedItem(milk, 'Almarai', stranger);

      await expect(
        service.submit(householdId, userId, theirs, { rating: 1, locale: 'en' }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });

    it('refuses an item that does not exist', async () => {
      await expect(
        service.submit(householdId, userId, '00000000-0000-4000-8000-000000000000', {
          rating: 1,
          locale: 'en',
        }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });
  });

  describe('forItem', () => {
    it('returns nothing when the reader has not reviewed it', async () => {
      const item = await seedItem(milk, 'Almarai');
      const summary = await service.forItem(householdId, userId, item);

      expect(summary).toEqual({ mine: null, averageRating: null, count: 0 });
    });

    it('averages every household, not just the reader', async () => {
      const item = await seedItem(milk, 'Almarai');
      await service.submit(householdId, userId, item, { rating: 2, locale: 'en' });

      const otherUser = await seedUser(ctx.db);
      const otherHousehold = await seedHousehold(ctx.db, otherUser);
      users.push(otherUser);
      households.push(otherHousehold);
      const otherItem = await seedItem(milk, 'Almarai', otherHousehold);
      await service.submit(otherHousehold, otherUser, otherItem, { rating: 4, locale: 'en' });

      const summary = await service.forItem(householdId, userId, item);
      expect(summary.count).toBe(2);
      expect(summary.averageRating).toBe(3);
      expect(summary.mine?.rating).toBe(2);
    });

    it('does not count a different brand of the same ingredient', async () => {
      const mine = await seedItem(milk, 'Almarai');
      await service.submit(householdId, userId, mine, { rating: 5, locale: 'en' });

      const otherUser = await seedUser(ctx.db);
      const otherHousehold = await seedHousehold(ctx.db, otherUser);
      users.push(otherUser);
      households.push(otherHousehold);
      const rival = await seedItem(milk, 'Nadec', otherHousehold);
      await service.submit(otherHousehold, otherUser, rival, { rating: 1, locale: 'en' });

      const summary = await service.forItem(householdId, userId, mine);
      expect(summary.count).toBe(1);
      expect(summary.averageRating).toBe(5);
    });

    it('matches an unbranded product to other unbranded reviews', async () => {
      const mine = await seedItem(rice, null);
      await service.submit(householdId, userId, mine, { rating: 4, locale: 'en' });

      const otherUser = await seedUser(ctx.db);
      const otherHousehold = await seedHousehold(ctx.db, otherUser);
      users.push(otherUser);
      households.push(otherHousehold);
      const theirs = await seedItem(rice, null, otherHousehold);
      await service.submit(otherHousehold, otherUser, theirs, { rating: 2, locale: 'en' });

      const summary = await service.forItem(householdId, userId, mine);
      expect(summary.count).toBe(2);
      expect(summary.averageRating).toBe(3);
    });
  });

  describe('admin report', () => {
    it('groups reviews by product and brand', async () => {
      const item = await seedItem(milk, 'Almarai');
      await service.submit(householdId, userId, item, { rating: 1, message: 'Sour', locale: 'en' });

      const otherUser = await seedUser(ctx.db);
      const otherHousehold = await seedHousehold(ctx.db, otherUser);
      users.push(otherUser);
      households.push(otherHousehold);
      const theirs = await seedItem(milk, 'Almarai', otherHousehold);
      await service.submit(otherHousehold, otherUser, theirs, { rating: 3, locale: 'en' });

      const page = await service.list({ limit: 20, brand: 'Almarai' });
      const row = page.items.find((r) => r.ingredientId === milk);
      expect(row?.count).toBe(2);
      expect(row?.averageRating).toBe(2);
      expect(row?.byRating).toMatchObject({ '1': 1, '3': 1 });
      // Only one of the two left words for the vendor to read.
      expect(row?.commentCount).toBe(1);
    });

    it('matches a brand however the barcode source cased it', async () => {
      const item = await seedItem(milk, 'Almarai');
      await service.submit(householdId, userId, item, { rating: 1, locale: 'en' });

      const page = await service.list({ limit: 20, brand: 'ALMARAI' });
      expect(page.items.some((r) => r.ingredientId === milk)).toBe(true);
    });

    it('surfaces only the products worth acting on when asked', async () => {
      const bad = await seedItem(milk, 'Almarai');
      const good = await seedItem(rice, 'Almarai');
      await service.submit(householdId, userId, bad, { rating: 1, locale: 'en' });
      await service.submit(householdId, userId, good, { rating: 5, locale: 'en' });

      const page = await service.list({ limit: 20, brand: 'Almarai', maxAverage: 2 });
      const ids = page.items.map((r) => r.ingredientId);
      expect(ids).toContain(milk);
      expect(ids).not.toContain(rice);
    });

    it('judges a divisive product by its average, not its worst review', async () => {
      // 1★ and 5★ average 3, so this is not a product to act on — but any
      // filter that tests one review at a time sees the 1★ and pulls it in.
      const divisive = await seedItem(rice, 'Divisive');
      await service.submit(householdId, userId, divisive, { rating: 1, locale: 'en' });

      const otherUser = await seedUser(ctx.db);
      const otherHousehold = await seedHousehold(ctx.db, otherUser);
      users.push(otherUser);
      households.push(otherHousehold);
      const theirs = await seedItem(rice, 'Divisive', otherHousehold);
      await service.submit(otherHousehold, otherUser, theirs, { rating: 5, locale: 'en' });

      const page = await service.list({ limit: 20, brand: 'Divisive', maxAverage: 2 });
      expect(page.items.map((r) => r.ingredientId)).not.toContain(rice);

      const unfiltered = await service.list({ limit: 20, brand: 'Divisive' });
      expect(unfiltered.items.find((r) => r.ingredientId === rice)?.averageRating).toBe(3);
    });

    it('sends the vendor the words but never the customer', async () => {
      const item = await seedItem(milk, 'Almarai');
      await service.submit(householdId, userId, item, {
        rating: 1,
        message: 'Soured early',
        locale: 'en',
      });

      const page = await service.comments({ limit: 20, brand: 'Almarai' });
      const row = page.items.find((c) => c.message === 'Soured early');
      expect(row).toBeDefined();
      expect(JSON.stringify(row)).not.toContain('@');
      expect(row).not.toHaveProperty('userId');
    });

    it('omits ratings that carry no comment', async () => {
      const item = await seedItem(rice, 'Silent');
      await service.submit(householdId, userId, item, { rating: 3, locale: 'en' });

      const page = await service.comments({ limit: 20, brand: 'Silent' });
      // A vendor list of blank rows is noise; the count lives in the report.
      expect(page.items).toHaveLength(0);
    });
  });
});
