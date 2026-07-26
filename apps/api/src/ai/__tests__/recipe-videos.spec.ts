import { describe, expect, it } from 'vitest';
import { RecipesService } from '../recipes/recipes.service.js';
import { YoutubeUnavailableError, type YoutubeClient } from '../clients/clients.interface.js';

function fakeDb(recipeRow: unknown, freshVideos: unknown[] = []) {
  return {
    query: { recipes: { findFirst: async () => recipeRow } },
    select: () => ({
      from: () => ({ where: () => ({ orderBy: async () => freshVideos }) }),
    }),
    insert: () => ({
      values: () => ({ onConflictDoNothing: async () => undefined }),
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

const recipeRow = {
  id: 'r1',
  householdId: null,
  titleEn: 'Shakshuka',
  titleAr: 'شكشوكة',
  ingredients: [],
  videos: [],
};

describe('RecipeVideos (spec §5.5 — quota exhaustion never dead-ends)', () => {
  it('returns [] when YouTube quota is exhausted and nothing is cached', async () => {
    const youtube: YoutubeClient = {
      async search() {
        throw new YoutubeUnavailableError('quota');
      },
    };
    const service = new RecipesService(fakeDb(recipeRow), {} as never, youtube);

    const videos = await service.getVideos('hh', 'r1', 'en');
    expect(videos).toEqual([]);
  });

  it('returns API-sourced video ids (never LLM-generated) on success', async () => {
    const youtube: YoutubeClient = {
      async search() {
        return [
          {
            youtubeId: 'API_ID_123',
            title: 'Shakshuka recipe',
            channel: 'Chef',
            thumbnailUrl: 'https://img/x.jpg',
            durationSeconds: 300,
          },
        ];
      },
    };
    const service = new RecipesService(fakeDb(recipeRow), {} as never, youtube);

    const videos = await service.getVideos('hh', 'r1', 'en');
    expect(videos).toHaveLength(1);
    expect(videos[0]?.youtubeId).toBe('API_ID_123');
    expect(videos[0]?.locale).toBe('en');
  });
});
