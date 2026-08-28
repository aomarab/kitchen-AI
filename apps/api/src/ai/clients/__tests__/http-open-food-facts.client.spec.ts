import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  HttpOpenFoodFactsClient,
  categoryFromOffTags,
  parseOffQuantity,
} from '../http-open-food-facts.client.js';

const BASE_URL = 'https://off.test';

/** The real payload shape, trimmed to the fields we read. */
function product(overrides: Record<string, unknown> = {}) {
  return {
    status: 1,
    product: {
      product_name: 'Pomegranate Molasses',
      product_name_ar: 'دبس الرمان',
      brands: 'Cortas',
      image_front_url: 'https://img.test/molasses.jpg',
      quantity: '600 ml',
      categories_tags: ['en:groceries', 'en:sauces', 'en:condiments'],
      ...overrides,
    },
  };
}

describe('parseOffQuantity', () => {
  it('reads a value and a unit, and converts centilitres', () => {
    expect(parseOffQuantity('750 ml')).toEqual({ quantity: 750, unit: 'ml' });
    expect(parseOffQuantity('75 cl')).toEqual({ quantity: 750, unit: 'ml' });
    expect(parseOffQuantity('1,5 L')).toEqual({ quantity: 1.5, unit: 'l' });
  });

  it('gives up rather than guessing on an unparseable quantity', () => {
    expect(parseOffQuantity(undefined)).toEqual({ quantity: null, unit: null });
    expect(parseOffQuantity('family size')).toEqual({ quantity: null, unit: null });
    expect(parseOffQuantity('12 pieces')).toEqual({ quantity: null, unit: null });
  });
});

describe('categoryFromOffTags', () => {
  it('prefers the most specific tag, which Open Food Facts lists last', () => {
    // General to specific. "breakfasts" would map to nothing, but "sweet-spreads"
    // is a condiment — reading the list forwards would return the wrong answer
    // for any product whose broad category also happens to match a rule.
    expect(
      categoryFromOffTags(['en:plant-based-foods', 'en:cereals-and-potatoes', 'en:pastas']),
    ).toBe('pasta');
  });

  it('is unbothered by the translated display names mixed into the list', () => {
    // Real payloads carry the translations alongside the taxonomy, all
    // en:-prefixed. They are translations of the same categories, so they
    // cannot change the answer — this pins that they do not.
    expect(categoryFromOffTags(['en:dairies', 'en:Produits laitiers', 'en:Pâtes à tartiner'])).toBe(
      'dairy',
    );
  });

  it('reads the head noun, not any word in the slug', () => {
    // Real OFF slugs are head-final compounds. "breaded-cheeses" is a cheese;
    // anything that matches "bread" anywhere in the slug files it as bread.
    expect(categoryFromOffTags(['en:breaded-cheeses'])).toBe('dairy');
    expect(categoryFromOffTags(['en:pasta-sauces'])).toBe('condiment');
    expect(categoryFromOffTags(['en:sweet-spreads'])).toBe('condiment');
  });

  it('resolves chicken to poultry rather than meat, which OFF files it under too', () => {
    expect(categoryFromOffTags(['en:meats', 'en:poultry', 'en:chickens'])).toBe('poultry');
  });

  it('returns null for a taxonomy it does not recognise, so the item keeps today\u2019s default', () => {
    expect(categoryFromOffTags(['en:snacks', 'en:biscuits', 'en:filled-biscuits'])).toBeNull();
    expect(categoryFromOffTags(undefined)).toBeNull();
    expect(categoryFromOffTags([])).toBeNull();
  });
});

describe('HttpOpenFoodFactsClient', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function respond(body: unknown, ok = true) {
    fetchMock.mockResolvedValue({ ok, json: async () => body });
  }

  it('keeps the Arabic name and the category the record carried', async () => {
    respond(product());
    const result = await new HttpOpenFoodFactsClient(BASE_URL).lookup('6281000099999');

    expect(result).toEqual({
      found: true,
      productName: 'Pomegranate Molasses',
      productNameAr: 'دبس الرمان',
      brand: 'Cortas',
      imageUrl: 'https://img.test/molasses.jpg',
      quantity: 600,
      unit: 'ml',
      category: 'condiment',
    });
  });

  it('asks for the fields it reads, including the category tags', async () => {
    respond(product());
    await new HttpOpenFoodFactsClient(BASE_URL).lookup('123456');

    const url = String(fetchMock.mock.calls[0]![0]);
    expect(url).toContain('/api/v2/product/123456.json');
    for (const field of ['product_name', 'product_name_ar', 'categories_tags', 'quantity']) {
      expect(url).toContain(field);
    }
  });

  it('does not put an Arabic-only name in the English slot alone', async () => {
    // Some records have no Latin name at all. The Arabic name is still the
    // product's name, so it fills both — but it must not arrive as English
    // only, or the catalog row it creates is labelled Arabic-as-English.
    respond(product({ product_name: undefined }));
    const result = await new HttpOpenFoodFactsClient(BASE_URL).lookup('6281000099999');

    expect(result.productName).toBe('دبس الرمان');
    expect(result.productNameAr).toBe('دبس الرمان');
  });

  it('reports a record with no Arabic name or category as null, not as a guess', async () => {
    respond(product({ product_name_ar: undefined, categories_tags: undefined }));
    const result = await new HttpOpenFoodFactsClient(BASE_URL).lookup('6281000099999');

    expect(result.found).toBe(true);
    expect(result.productNameAr).toBeNull();
    expect(result.category).toBeNull();
  });

  it('falls back to manual entry on an unknown code, a bad status or a dead network', async () => {
    const client = new HttpOpenFoodFactsClient(BASE_URL);
    const notFound = {
      found: false,
      productName: null,
      productNameAr: null,
      brand: null,
      imageUrl: null,
      quantity: null,
      unit: null,
      category: null,
    };

    respond({ status: 0 });
    expect(await client.lookup('000')).toEqual(notFound);

    respond({}, false);
    expect(await client.lookup('000')).toEqual(notFound);

    fetchMock.mockRejectedValue(new Error('offline'));
    expect(await client.lookup('000')).toEqual(notFound);
  });
});
