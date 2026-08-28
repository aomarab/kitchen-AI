import type { IngredientCategory, Locale, Unit } from '@kitchen/contracts';

export interface YoutubeVideo {
  youtubeId: string;
  title: string;
  channel: string;
  thumbnailUrl: string;
  durationSeconds: number;
  categoryId: string | null;
  defaultAudioLanguage: string | null;
  embeddable: boolean;
}

/**
 * Recipe video search. Video ids ALWAYS come from this API — never from the LLM
 * (spec §5.5). Implementations throw {@link YoutubeUnavailableError} when the
 * quota is exhausted or the API errors, so callers degrade to a recipe with no
 * video and retry later rather than dead-ending.
 */
export interface YoutubeClient {
  search(query: string, locale: Locale, max?: number): Promise<YoutubeVideo[]>;
}

export class YoutubeUnavailableError extends Error {
  constructor(readonly reason: 'quota' | 'error') {
    super(`YouTube unavailable: ${reason}`);
    this.name = 'YoutubeUnavailableError';
  }
}

/** Locale-appropriate query suffix so Arabic titles fetch Arabic videos. */
export const YOUTUBE_QUERY_SUFFIX: Record<Locale, string> = {
  en: 'recipe how to make',
  ar: 'طريقة عمل وصفة',
};

export interface OpenFoodFactsProduct {
  found: boolean;
  productName: string | null;
  /**
   * The product's Arabic name, when the record carries one. Kept separate from
   * {@link productName} rather than collapsed into it: a scan that adds an
   * unmatched product writes a row to the global `ingredients` table, and a
   * single name there is filed under both languages for every household.
   */
  productNameAr: string | null;
  brand: string | null;
  imageUrl: string | null;
  quantity: number | null;
  unit: Unit | null;
  /**
   * The product's kind, mapped from the Open Food Facts taxonomy. Same reason
   * as the Arabic name: without it an unmatched scan is filed as `other` in a
   * catalog every household reads, permanently.
   */
  category: IngredientCategory | null;
}

/** Barcode → product lookup against Open Food Facts (spec §5.2). */
export interface OpenFoodFactsClient {
  lookup(barcode: string): Promise<OpenFoodFactsProduct>;
}
