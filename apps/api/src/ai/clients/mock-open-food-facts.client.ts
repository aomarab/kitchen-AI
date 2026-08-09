import type { OpenFoodFactsClient, OpenFoodFactsProduct } from './clients.interface.js';

/**
 * Fixture Open Food Facts client, selected under `AI_MOCK`. A small recorded set
 * of known barcodes plus a not-found default, so the barcode flow and its
 * manual-entry fallback (spec §5.2) can be tested with no network.
 */
const KNOWN: Record<string, OpenFoodFactsProduct> = {
  '6281006000000': {
    found: true,
    productName: 'Basmati Rice',
    brand: 'Abu Kass',
    imageUrl: 'https://images.openfoodfacts.org/basmati.jpg',
    quantity: 2000,
    unit: 'g',
  },
  '3017620422003': {
    found: true,
    productName: 'Olive Oil Extra Virgin',
    brand: 'Carrefour',
    imageUrl: 'https://images.openfoodfacts.org/oliveoil.jpg',
    quantity: 750,
    unit: 'ml',
  },
};

export class MockOpenFoodFactsClient implements OpenFoodFactsClient {
  async lookup(barcode: string): Promise<OpenFoodFactsProduct> {
    return (
      KNOWN[barcode] ?? {
        found: false,
        productName: null,
        brand: null,
        imageUrl: null,
        quantity: null,
        unit: null,
      }
    );
  }
}
