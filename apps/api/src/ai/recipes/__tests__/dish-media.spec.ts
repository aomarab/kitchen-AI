import { and, eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Locale } from '@kitchen/contracts';
import { createTestContext, type TestContext } from '../../../testing/harness.js';
import { dishMedia, dishVideos } from '../../../db/schema.js';
import { VIDEO_CACHE_TTL_DAYS } from '../../ai.constants.js';
import {
  YoutubeUnavailableError,
  type YoutubeClient,
  type YoutubeVideo,
} from '../../clients/clients.interface.js';
import { MediaService } from '../media.service.js';

const KEY = 'en:test-dish-media';

/**
 * One resolve issues two searches — the full title and the dish head word —
 * because a descriptive generated title often matches nothing on its own. The
 * caching assertions below count searches, so they compare against this rather
 * than a bare 1 and keep testing "did it search again", not "how many calls".
 */
const SEARCHES_PER_RESOLVE = 2;

function candidate(overrides: Partial<YoutubeVideo> = {}): YoutubeVideo {
  return {
    youtubeId: 'vid-1',
    title: 'Chicken kabsa the traditional way',
    channel: 'Chef',
    thumbnailUrl: 'https://i.ytimg.com/vi/vid-1/maxresdefault.jpg',
    durationSeconds: 600,
    categoryId: '26',
    defaultAudioLanguage: 'en',
    embeddable: true,
    ...overrides,
  };
}

function clientReturning(...videos: YoutubeVideo[]): YoutubeClient & { calls: number } {
  const client = {
    calls: 0,
    async search() {
      client.calls += 1;
      return videos;
    },
  };
  return client;
}

function clientFailing(reason: 'quota' | 'error'): YoutubeClient & { calls: number } {
  const client = {
    calls: 0,
    async search(): Promise<YoutubeVideo[]> {
      client.calls += 1;
      throw new YoutubeUnavailableError(reason);
    },
  };
  return client;
}

describe('MediaService (dish-level media resolution)', () => {
  let ctx: TestContext;
  const build = (youtube: YoutubeClient) => new MediaService(ctx.db as never, youtube);

  const readRow = async (locale: Locale = 'en') =>
    (
      await ctx.db
        .select()
        .from(dishMedia)
        .where(and(eq(dishMedia.dishKey, KEY), eq(dishMedia.locale, locale)))
    )[0];

  beforeAll(() => {
    ctx = createTestContext();
  });

  beforeEach(async () => {
    await ctx.db.delete(dishVideos).where(eq(dishVideos.dishKey, KEY));
    await ctx.db.delete(dishMedia).where(eq(dishMedia.dishKey, KEY));
  });

  afterAll(async () => {
    await ctx.db.delete(dishVideos).where(eq(dishVideos.dishKey, KEY));
    await ctx.db.delete(dishMedia).where(eq(dishMedia.dishKey, KEY));
    await ctx.client.end();
  });

  it('takes the hero image from the winning video so the two cannot disagree', async () => {
    const youtube = clientReturning(candidate());
    const media = await build(youtube).resolve(KEY, 'Chicken kabsa', 'en');

    expect(media.status).toBe('matched');
    expect(media.heroThumbnailUrl).toBe(candidate().thumbnailUrl);
    expect(media.heroYoutubeId).toBe('vid-1');
    expect(media.videos.map((v) => v.youtubeId)).toEqual(['vid-1']);
  });

  it('ranks the highest-scoring survivor first and makes it the hero', async () => {
    // Both cover the dish, but only one is Howto & Style with matching audio.
    const weak = candidate({
      youtubeId: 'weak',
      thumbnailUrl: 'https://i.ytimg.com/vi/weak/hqdefault.jpg',
      categoryId: '22',
      defaultAudioLanguage: 'de',
    });
    const strong = candidate({
      youtubeId: 'strong',
      thumbnailUrl: 'https://i.ytimg.com/vi/strong/maxresdefault.jpg',
    });

    const media = await build(clientReturning(weak, strong)).resolve(KEY, 'Chicken kabsa', 'en');

    expect(media.videos.map((v) => v.youtubeId)).toEqual(['strong', 'weak']);
    expect(media.heroYoutubeId).toBe('strong');

    const stored = await ctx.db
      .select()
      .from(dishVideos)
      .where(eq(dishVideos.dishKey, KEY))
      .orderBy(dishVideos.rank);
    expect(stored.map((row) => row.youtubeId)).toEqual(['strong', 'weak']);
  });

  it('serves a fresh result without spending another search', async () => {
    const youtube = clientReturning(candidate());
    const service = build(youtube);

    await service.resolve(KEY, 'Chicken kabsa', 'en');
    const second = await service.resolve(KEY, 'Chicken kabsa', 'en');

    expect(youtube.calls).toBe(SEARCHES_PER_RESOLVE);
    expect(second.status).toBe('matched');
    expect(second.videos.map((v) => v.youtubeId)).toEqual(['vid-1']);
  });

  it('persists a genuine no-match and does not search again while it is fresh', async () => {
    // Music category: a real answer of "nothing here depicts this dish".
    const youtube = clientReturning(candidate({ categoryId: '10' }));
    const service = build(youtube);

    const first = await service.resolve(KEY, 'Chicken kabsa', 'en');
    const second = await service.resolve(KEY, 'Chicken kabsa', 'en');

    expect(first.status).toBe('none');
    expect(first.heroThumbnailUrl).toBeNull();
    expect(youtube.calls).toBe(SEARCHES_PER_RESOLVE);
    expect(second.status).toBe('none');
    expect((await readRow())?.status).toBe('none');
  });

  it('never caches an outage as a no-match', async () => {
    // The load-bearing distinction: persisting this would blind the dish for
    // thirty days because YouTube happened to be down for one request.
    const youtube = clientFailing('quota');
    const media = await build(youtube).resolve(KEY, 'Chicken kabsa', 'en');

    expect(media.status).toBe('none');
    expect(await readRow()).toBeUndefined();
  });

  it('retries after an outage rather than staying blind', async () => {
    await build(clientFailing('quota')).resolve(KEY, 'Chicken kabsa', 'en');

    const recovered = clientReturning(candidate());
    const media = await build(recovered).resolve(KEY, 'Chicken kabsa', 'en');

    expect(recovered.calls).toBe(SEARCHES_PER_RESOLVE);
    expect(media.status).toBe('matched');
  });

  it('serves stored media through an outage, even when stale', async () => {
    await build(clientReturning(candidate())).resolve(KEY, 'Chicken kabsa', 'en');
    await ctx.db
      .update(dishMedia)
      .set({ resolvedAt: sql`now() - interval '${sql.raw(String(VIDEO_CACHE_TTL_DAYS + 1))} days'` })
      .where(eq(dishMedia.dishKey, KEY));

    const media = await build(clientFailing('error')).resolve(KEY, 'Chicken kabsa', 'en');

    expect(media.status).toBe('matched');
    expect(media.heroYoutubeId).toBe('vid-1');
    expect(media.videos).toHaveLength(1);
  });

  it('renews the timestamp on re-resolve so a dish cannot freeze permanently stale', async () => {
    await build(clientReturning(candidate())).resolve(KEY, 'Chicken kabsa', 'en');
    await ctx.db
      .update(dishMedia)
      .set({ resolvedAt: sql`now() - interval '${sql.raw(String(VIDEO_CACHE_TTL_DAYS + 1))} days'` })
      .where(eq(dishMedia.dishKey, KEY));

    const youtube = clientReturning(candidate());
    await build(youtube).resolve(KEY, 'Chicken kabsa', 'en');

    expect(youtube.calls).toBe(SEARCHES_PER_RESOLVE);
    const row = await readRow();
    expect(row?.resolvedAt.getTime()).toBeGreaterThan(
      Date.now() - VIDEO_CACHE_TTL_DAYS * 86_400_000,
    );
  });

  it('renews the timestamp on a repeated no-match too', async () => {
    // Without this the `none` row freezes permanently stale and every request
    // past day 30 spends another 100-unit search, forever — the same trap the
    // matched path has, on the branch that is easier to forget.
    const miss = () => clientReturning(candidate({ categoryId: '10' }));
    await build(miss()).resolve(KEY, 'Chicken kabsa', 'en');
    await ctx.db
      .update(dishMedia)
      .set({ resolvedAt: sql`now() - interval '${sql.raw(String(VIDEO_CACHE_TTL_DAYS + 1))} days'` })
      .where(eq(dishMedia.dishKey, KEY));

    await build(miss()).resolve(KEY, 'Chicken kabsa', 'en');

    const youtube = miss();
    await build(youtube).resolve(KEY, 'Chicken kabsa', 'en');

    expect(youtube.calls, 'the renewed row should be fresh again').toBe(0);
  });

  it('replaces the previous ranking instead of interleaving two searches', async () => {
    await build(clientReturning(candidate({ youtubeId: 'old-a' }), candidate({ youtubeId: 'old-b' })))
      .resolve(KEY, 'Chicken kabsa', 'en');
    await ctx.db
      .update(dishMedia)
      .set({ resolvedAt: sql`now() - interval '${sql.raw(String(VIDEO_CACHE_TTL_DAYS + 1))} days'` })
      .where(eq(dishMedia.dishKey, KEY));

    await build(clientReturning(candidate({ youtubeId: 'new-a' }))).resolve(
      KEY,
      'Chicken kabsa',
      'en',
    );

    const stored = await ctx.db.select().from(dishVideos).where(eq(dishVideos.dishKey, KEY));
    expect(stored.map((row) => row.youtubeId)).toEqual(['new-a']);
  });

  it('looks media up in bulk without ever searching, so lists stay free', async () => {
    await build(clientReturning(candidate())).resolve(KEY, 'Chicken kabsa', 'en');

    const youtube = clientReturning(candidate());
    const found = await build(youtube).lookupMany([KEY, 'en:never-resolved'], 'en');

    expect(youtube.calls).toBe(0);
    expect(found.get(KEY)?.heroThumbnailUrl).toBe(candidate().thumbnailUrl);
    expect(found.has('en:never-resolved')).toBe(false);
  });
  /**
   * The search result carries scoring-only metadata (categoryId, embeddable,
   * defaultAudioLanguage) that must never reach a client: `recipeVideoSchema`
   * in the contract defines exactly these five fields plus locale. The risk is
   * a spread in the fresh-resolve path, which TypeScript does not flag because
   * excess-property checks only apply to direct object literals — so the leak
   * would appear only on a cache miss and the endpoint would answer with two
   * different shapes for the same recipe depending on cache state.
   */
  it('returns the identical video shape whether resolved fresh or read from cache', async () => {
    const youtube = clientReturning(candidate());

    const fresh = await build(youtube).resolve(KEY, 'Chicken kabsa', 'en');
    const cached = await build(clientReturning()).resolve(KEY, 'Chicken kabsa', 'en');

    const expected = ['youtubeId', 'title', 'channel', 'thumbnailUrl', 'durationSeconds'];
    expect(Object.keys(fresh.videos[0]!).sort()).toEqual([...expected].sort());
    expect(fresh.videos).toEqual(cached.videos);
  });
});
