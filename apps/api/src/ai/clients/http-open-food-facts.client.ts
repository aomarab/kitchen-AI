import type { Unit } from '@kitchen/contracts';
import type { OpenFoodFactsClient, OpenFoodFactsProduct } from './clients.interface.js';

interface OffResponse {
  status?: number;
  product?: {
    product_name?: string;
    product_name_ar?: string;
    brands?: string;
    image_url?: string;
    image_front_url?: string;
    quantity?: string;
  };
}

const UNIT_WORDS: Record<string, Unit> = {
  g: 'g',
  gr: 'g',
  gram: 'g',
  grams: 'g',
  kg: 'kg',
  ml: 'ml',
  cl: 'ml',
  l: 'l',
  ltr: 'l',
  liter: 'l',
  litre: 'l',
};

/** Best-effort parse of an Open Food Facts quantity string like "750 ml". */
export function parseOffQuantity(raw: string | undefined): { quantity: number | null; unit: Unit | null } {
  if (!raw) return { quantity: null, unit: null };
  const match = raw.trim().toLowerCase().match(/([\d.,]+)\s*([a-z]+)/);
  if (!match) return { quantity: null, unit: null };
  const value = Number(match[1]!.replace(',', '.'));
  const unitWord = match[2]!;
  const unit = UNIT_WORDS[unitWord] ?? null;
  if (!Number.isFinite(value) || unit == null) return { quantity: null, unit: null };
  const quantity = unitWord === 'cl' ? value * 10 : value;
  return { quantity, unit };
}

/**
 * Real Open Food Facts client (free, no key; spec §5.2). A missing product or
 * any transport error resolves to `found:false` so the client falls back to
 * manual entry rather than erroring.
 */
export class HttpOpenFoodFactsClient implements OpenFoodFactsClient {
  constructor(private readonly baseUrl: string) {}

  async lookup(barcode: string): Promise<OpenFoodFactsProduct> {
    const notFound: OpenFoodFactsProduct = {
      found: false,
      productName: null,
      brand: null,
      imageUrl: null,
      quantity: null,
      unit: null,
    };

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/api/v2/product/${barcode}.json`);
    } catch {
      return notFound;
    }
    if (!response.ok) return notFound;

    const body = (await response.json().catch(() => ({}))) as OffResponse;
    if (body.status !== 1 || !body.product) return notFound;

    const { quantity, unit } = parseOffQuantity(body.product.quantity);
    return {
      found: true,
      productName: body.product.product_name ?? body.product.product_name_ar ?? null,
      brand: body.product.brands ?? null,
      imageUrl: body.product.image_front_url ?? body.product.image_url ?? null,
      quantity,
      unit,
    };
  }
}
