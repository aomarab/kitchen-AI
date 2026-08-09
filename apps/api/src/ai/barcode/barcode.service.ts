import { Inject, Injectable } from '@nestjs/common';
import type { BarcodeLookupResponse } from '@kitchen/contracts';
import { CATALOG_PORT, OPEN_FOOD_FACTS_CLIENT } from '../ai.constants.js';
import type { IngredientResolverPort } from '../catalog/ingredient-resolver.port.js';
import type { OpenFoodFactsClient } from '../clients/clients.interface.js';

/**
 * Barcode lookup via Open Food Facts (spec §5.2). A found product is resolved to
 * the catalog and the barcode is cached as an alias on the matched ingredient so
 * the next scan is instant. An unknown barcode returns `found:false`, and the
 * client falls back to manual entry.
 */
@Injectable()
export class BarcodeService {
  constructor(
    @Inject(OPEN_FOOD_FACTS_CLIENT) private readonly off: OpenFoodFactsClient,
    @Inject(CATALOG_PORT) private readonly catalog: IngredientResolverPort,
  ) {}

  async lookup(barcode: string): Promise<BarcodeLookupResponse> {
    const product = await this.off.lookup(barcode);

    if (!product.found || !product.productName) {
      return {
        found: false,
        productName: null,
        brand: null,
        imageUrl: null,
        match: null,
        suggestedQuantity: null,
        suggestedUnit: null,
      };
    }

    const [resolved] = await this.catalog.resolve([{ name: product.productName }], {
      createIfMissing: false,
    });

    if (resolved?.ingredient) {
      // Cache the barcode and product title as aliases for future instant scans.
      await this.catalog.addAliases(resolved.ingredient.id, [barcode, product.productName]);
    }

    return {
      found: true,
      productName: product.productName,
      brand: product.brand,
      imageUrl: product.imageUrl,
      match: {
        ingredientId: resolved?.ingredient?.id ?? null,
        strategy: resolved?.strategy ?? 'unresolved',
        confidence: resolved?.confidence ?? 0,
        rawName: product.productName,
      },
      suggestedQuantity: product.quantity,
      suggestedUnit: product.unit,
    };
  }
}
