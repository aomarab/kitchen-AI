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

describe('CatalogService.resolveOrCreate categorisation', () => {
  let ctx: TestContext;
  let service: CatalogService;
  const created: string[] = [];

  beforeAll(() => {
    ctx = createTestContext();
    service = new CatalogService(ctx.db);
  });

  afterAll(async () => {
    if (created.length) {
      await ctx.client`delete from ingredients where id = any(${created})`;
    }
    await ctx.client.end({ timeout: 5 });
  });

  async function categoryOf(id: string): Promise<{ category: string; defaultUnit: string }> {
    const [row] = await ctx.client<{ category: string; default_unit: string }[]>`
      select category, default_unit from ingredients where id = ${id}`;
    return { category: row!.category, defaultUnit: row!.default_unit };
  }

  it('files a new row under the category the scan identified', async () => {
    const name = `Test Butter Block ${Date.now()}`;
    const id = await service.resolveOrCreate(name, undefined, { category: 'dairy', unit: 'g' });
    created.push(id);
    expect(await categoryOf(id)).toEqual({ category: 'dairy', defaultUnit: 'g' });
  });

  it("falls back to 'other' when the caller knows no category", async () => {
    const name = `Test Mystery Thing ${Date.now()}`;
    const id = await service.resolveOrCreate(name);
    created.push(id);
    expect((await categoryOf(id)).category).toBe('other');
  });
});
