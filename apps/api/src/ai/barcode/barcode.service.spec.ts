import { describe, expect, it, vi } from 'vitest';
import type { OpenFoodFactsClient, OpenFoodFactsProduct } from '../clients/clients.interface.js';
import type { IngredientResolverPort } from '../catalog/ingredient-resolver.port.js';
import { BarcodeService } from './barcode.service.js';

function offProduct(overrides: Partial<OpenFoodFactsProduct> = {}): OpenFoodFactsProduct {
  return {
    found: true,
    productName: 'Pomegranate Molasses',
    productNameAr: 'دبس الرمان',
    brand: 'Cortas',
    imageUrl: 'https://img.test/molasses.jpg',
    quantity: 600,
    unit: 'ml',
    category: 'condiment',
    ...overrides,
  };
}

const NOT_FOUND: OpenFoodFactsProduct = {
  found: false,
  productName: null,
  productNameAr: null,
  brand: null,
  imageUrl: null,
  quantity: null,
  unit: null,
  category: null,
};

/** Resolver that either finds a catalog row or does not, with the calls recorded. */
function fakeCatalog(ingredient: { id: string } | null) {
  const addAliases = vi.fn().mockResolvedValue(undefined);
  const resolve = vi
    .fn()
    .mockResolvedValue([
      ingredient
        ? { rawName: 'x', ingredient, strategy: 'alias', confidence: 0.88 }
        : { rawName: 'x', ingredient: null, strategy: 'unresolved', confidence: 0 },
    ]);
  return { resolve, addAliases } as unknown as IngredientResolverPort & {
    resolve: typeof resolve;
    addAliases: typeof addAliases;
  };
}

function service(product: OpenFoodFactsProduct, ingredient: { id: string } | null) {
  const off = { lookup: vi.fn().mockResolvedValue(product) } as unknown as OpenFoodFactsClient;
  const catalog = fakeCatalog(ingredient);
  return { service: new BarcodeService(off, catalog), catalog, off };
}

describe('BarcodeService', () => {
  it('carries the Arabic name and the category of an unmatched product', async () => {
    // This is the case that creates a row in the global `ingredients` table
    // when the user confirms. Anything dropped here is dropped permanently,
    // for every household, not just the one that scanned it.
    const { service: svc } = service(offProduct(), null);
    const result = await svc.lookup('6281000099999');

    expect(result.match?.ingredientId).toBeNull();
    expect(result.productName).toBe('Pomegranate Molasses');
    expect(result.productNameAr).toBe('دبس الرمان');
    expect(result.category).toBe('condiment');
  });

  it('does not invent a category the source did not give', async () => {
    const { service: svc } = service(offProduct({ productNameAr: null, category: null }), null);
    const result = await svc.lookup('6281000099999');

    expect(result.productNameAr).toBeNull();
    expect(result.category).toBeNull();
  });

  it('reports the matched ingredient and caches the barcode as an alias', async () => {
    const { service: svc, catalog } = service(offProduct(), { id: 'ing-7' });
    const result = await svc.lookup('6281000012345');

    expect(result.match).toEqual({
      ingredientId: 'ing-7',
      strategy: 'alias',
      confidence: 0.88,
      rawName: 'Pomegranate Molasses',
    });
    expect(catalog.addAliases).toHaveBeenCalledWith('ing-7', [
      '6281000012345',
      'Pomegranate Molasses',
    ]);
  });

  it('does not resolve against the catalog for an unknown barcode', async () => {
    const { service: svc, catalog } = service(NOT_FOUND, null);
    const result = await svc.lookup('0000000000');

    expect(result).toEqual({
      found: false,
      productName: null,
      productNameAr: null,
      brand: null,
      imageUrl: null,
      match: null,
      category: null,
      suggestedQuantity: null,
      suggestedUnit: null,
    });
    expect(catalog.resolve).not.toHaveBeenCalled();
  });

  it('never creates a catalog row from a lookup alone', async () => {
    // Scanning is not confirming. A row appears only when the user commits the
    // add, through the inventory path.
    const { service: svc, catalog } = service(offProduct(), null);
    await svc.lookup('6281000099999');

    expect(catalog.resolve).toHaveBeenCalledWith(expect.anything(), { createIfMissing: false });
  });
});
