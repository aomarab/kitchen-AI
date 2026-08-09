import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CatalogService } from './catalog.service.js';
import { createTestContext, type TestContext } from '../testing/harness.js';

describe('CatalogService bilingual search (live seeded catalog)', () => {
  let ctx: TestContext;
  let service: CatalogService;

  beforeAll(() => {
    ctx = createTestContext();
    service = new CatalogService(ctx.db);
  });

  afterAll(async () => {
    await ctx.client.end({ timeout: 5 });
  });

  it('matches an English canonical name', async () => {
    const page = await service.search({ q: 'tomato', limit: 50 });
    expect(page.items.some((i) => /tomato/i.test(i.canonicalNameEn))).toBe(true);
  });

  it('matches an Arabic term against canonical names and aliases', async () => {
    const page = await service.search({ q: 'طماطم', limit: 50 });
    expect(page.items.length).toBeGreaterThan(0);
    expect(page.items.some((i) => /tomato/i.test(i.canonicalNameEn))).toBe(true);
  });

  it('is diacritic-insensitive (tashkeel is stripped)', async () => {
    const withTashkeel = await service.search({ q: 'طَمَاطِم', limit: 50 });
    expect(withTashkeel.items.some((i) => /tomato/i.test(i.canonicalNameEn))).toBe(true);
  });

  it('unifies alef forms (bare alef matches hamza-alef)', async () => {
    // Seeded canonical is "أفوكادو"; querying with a bare alef must still match.
    const page = await service.search({ q: 'افوكادو', limit: 50 });
    expect(page.items.some((i) => i.canonicalNameEn === 'Avocado')).toBe(true);
  });
});
