import type { Locale, Unit } from '@kitchen/contracts';

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
  brand: string | null;
  imageUrl: string | null;
  quantity: number | null;
  unit: Unit | null;
}

/** Barcode → product lookup against Open Food Facts (spec §5.2). */
export interface OpenFoodFactsClient {
  lookup(barcode: string): Promise<OpenFoodFactsProduct>;
}
