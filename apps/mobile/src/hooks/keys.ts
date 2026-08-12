import type { Locale } from '@kitchen/i18n';
import type { ListInventoryQuery, ListPlansQuery } from '@kitchen/contracts';

/** Central query-key factory so invalidations stay consistent across hooks. */
export const qk = {
  me: ['me'] as const,
  households: ['households'] as const,
  profile: ['profile'] as const,
  locations: ['locations'] as const,
  inventory: ['inventory'] as const,
  inventoryList: (query: Partial<ListInventoryQuery>) => ['inventory', 'list', query] as const,
  inventoryItem: (id: string) => ['inventory', 'item', id] as const,
  ingredients: (term: string) => ['ingredients', term] as const,
  plans: (query?: ListPlansQuery) => ['plans', query ?? null] as const,
  plan: (id: string, locale: Locale) => ['plan', id, locale] as const,
  planCoverage: (id: string) => ['plan', id, 'coverage'] as const,
  recipe: (id: string, locale: Locale) => ['recipe', id, locale] as const,
  recipeVideos: (id: string) => ['recipe', id, 'videos'] as const,
  shopping: ['shopping'] as const,
  job: (id: string) => ['job', id] as const,
  recognition: (id: string) => ['recognition', id] as const,
  aiUsage: ['aiUsage'] as const,
  credits: ['credits'] as const,
  creditPackPrices: ['credits', 'pack-prices'] as const,
} as const;
