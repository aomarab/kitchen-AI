import { describe, expect, it } from 'vitest';
import { RecipesService } from '../recipes/recipes.service.js';
import { InMemoryResponseCache } from '../cache/response-cache.js';
import { YoutubeUnavailableError, type YoutubeClient } from '../clients/clients.interface.js';

interface UpsertSpy {
  conflictUpdates: { set: Record<string, unknown> }[];
}

function fakeDb(recipeRow: unknown, freshVideos: unknown[] = [], spy?: UpsertSpy) {
  return {
    query: { recipes: { findFirst: async () => recipeRow } },
    select: () => ({
      from: () => ({ where: () => ({ orderBy: async () => freshVideos }) }),
    }),
    insert: () => ({
      values: () => ({
        onConflictDoNothing: async () => undefined,
        onConflictDoUpdate: async (arg: { set: Record<string, unknown> }) => {
          spy?.conflictUpdates.push(arg);
        },
      }),
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

function build(youtube: YoutubeClient, videos: unknown[] = [], spy?: UpsertSpy) {
  return new RecipesService(
    fakeDb(recipeRow, videos, spy),
    {} as never,
    youtube,
    new InMemoryResponseCache(),
  );
}

describe('RecipeVideos (spec §5.5 — quota exhaustion never dead-ends)', () => {
  it('returns [] when YouTube quota is exhausted and nothing is cached', async () => {
    const youtube: YoutubeClient = {
      async search() {
        throw new YoutubeUnavailableError('quota');
      },
    };

    const videos = await build(youtube).getVideos('hh', 'r1', 'en');
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
            categoryId: '26',
            defaultAudioLanguage: 'en',
            embeddable: true,
          },
        ];
      },
    };

    const videos = await build(youtube).getVideos('hh', 'r1', 'en');
    expect(videos).toHaveLength(1);
    expect(videos[0]?.youtubeId).toBe('API_ID_123');
    expect(videos[0]?.locale).toBe('en');
  });
});

describe('RecipeVideos quota spend', () => {
  it('does not re-search YouTube for a recipe it already found nothing for', async () => {
    let calls = 0;
    const youtube: YoutubeClient = {
      async search() {
        calls += 1;
        return [];
      },
    };
    // One service instance, so the two requests share a cache the way two
    // requests against one running API would.
    const service = build(youtube);

    expect(await service.getVideos('hh', 'r1', 'en')).toEqual([]);
    expect(await service.getVideos('hh', 'r1', 'en')).toEqual([]);

    // An empty result leaves no recipe_videos rows, so without a negative cache
    // every request costs another 100 quota units against a 10,000 daily cap.
    expect(calls).toBe(1);
  });

  it('caches the empty answer per locale, not per recipe', async () => {
    const asked: string[] = [];
    const youtube: YoutubeClient = {
      async search(_title, locale) {
        asked.push(locale);
        return [];
      },
    };
    const service = build(youtube);

    await service.getVideos('hh', 'r1', 'en');
    await service.getVideos('hh', 'r1', 'ar');
    await service.getVideos('hh', 'r1', 'en');

    expect(asked).toEqual(['en', 'ar']);
  });

  it('still searches when the failure was quota exhaustion rather than an empty result', async () => {
    let calls = 0;
    const youtube: YoutubeClient = {
      async search() {
        calls += 1;
        throw new YoutubeUnavailableError('quota');
      },
    };
    const service = build(youtube);

    await service.getVideos('hh', 'r1', 'en');
    await service.getVideos('hh', 'r1', 'en');

    // "YouTube was down" is not "YouTube has nothing" — caching it would keep
    // serving [] long after the quota window resets.
    expect(calls).toBe(2);
  });
});

describe('RecipeVideos freshness window', () => {
  it('renews fetchedAt when a search returns rows that are already stored', async () => {
    const youtube: YoutubeClient = {
      async search() {
        return [
          {
            youtubeId: 'API_ID_123',
            title: 'Shakshuka recipe',
            channel: 'Chef',
            thumbnailUrl: 'https://img/x.jpg',
            durationSeconds: 300,
            categoryId: '26',
            defaultAudioLanguage: 'en',
            embeddable: true,
          },
        ];
      },
    };

    // `fetchedAt` only defaults on insert. Skipping the write on conflict left
    // it frozen at the first search, so for a popular recipe whose top results
    // never change the freshness window could never reopen — and every request
    // after the TTL spent another 100 quota units, forever.
    const spy: UpsertSpy = { conflictUpdates: [] };
    await build(youtube, [], spy).getVideos('hh', 'r1', 'en');

    expect(spy.conflictUpdates).toHaveLength(1);
    expect(spy.conflictUpdates[0]?.set.fetchedAt).toBeInstanceOf(Date);
  });
});
