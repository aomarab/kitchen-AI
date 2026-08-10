import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { createTestContext } from '../../testing/harness.js';
import { dishMedia, dishVideos } from '../../db/schema.js';
import { VIDEO_CACHE_TTL_DAYS } from '../ai.constants.js';
import { MediaService } from '../recipes/media.service.js';
import {
  YoutubeUnavailableError,
  type YoutubeClient,
  type YoutubeVideo,
} from '../clients/clients.interface.js';

const ctx = createTestContext();
afterAll(async () => {
  await ctx.client.end();
});

/** dishKey('Chicken Kabsa') — asserted directly so a normalizer change is loud. */
const KEY = 'chicken-kabsa';

beforeEach(async () => {
  await ctx.db.delete(dishVideos).where(eq(dishVideos.dishKey, KEY));
  await ctx.db.delete(dishMedia).where(eq(dishMedia.dishKey, KEY));
});

function video(over: Partial<YoutubeVideo> = {}): YoutubeVideo {
  return {
    youtubeId: 'Xtspw022mb4',
    title: 'Saudi Chicken Kabsa Recipe',
    channel: 'The White Plate',
    thumbnailUrl: 'https://i.ytimg.com/vi/Xtspw022mb4/maxresdefault.jpg',
    durationSeconds: 742,
    categoryId: '26',
    defaultAudioLanguage: 'en',
    embeddable: true,
    ...over,
  };
}

function build(search: YoutubeClient['search']) {
  return new MediaService(ctx.db, { search });
}

async function storedMedia(locale: 'en' | 'ar' = 'en') {
  const [row] = await ctx.db
    .select()
    .from(dishMedia)
    .where(and(eq(dishMedia.dishKey, KEY), eq(dishMedia.locale, locale)));
  return row ?? null;
}

describe('MediaService', () => {
  it('resolves a dish once and serves every later household from cache', async () => {
    const search = vi.fn(async () => [video()]);
    const service = build(search);

    await service.resolve('Chicken Kabsa', 'en');
    // A different household, a differently-worded title, the same dish.
    await service.resolve('The Best Chicken Kabsa Recipe', 'en');

    expect(search).toHaveBeenCalledTimes(1);
  });

  it('uses the winning video thumbnail as the hero', async () => {
    const media = await build(async () => [video()]).resolve('Chicken Kabsa', 'en');

    expect(media.status).toBe('matched');
    expect(media.heroThumbnailUrl).toBe('https://i.ytimg.com/vi/Xtspw022mb4/maxresdefault.jpg');
    expect(media.videos[0]?.youtubeId).toBe('Xtspw022mb4');
  });

  it('records a rejected dish as none and does not search it again', async () => {
    const search = vi.fn(async () => [video({ categoryId: '10', title: 'Gangnam Style' })]);
    const service = build(search);

    const first = await service.resolve('Chicken Kabsa', 'en');
    await service.resolve('Chicken Kabsa', 'en');

    expect(first.status).toBe('none');
    expect(first.heroThumbnailUrl).toBeNull();
    expect(await storedMedia()).toMatchObject({ status: 'none' });
    expect(search).toHaveBeenCalledTimes(1);
  });

  it('does NOT persist none when YouTube is merely unavailable', async () => {
    const search = vi.fn(async (): Promise<YoutubeVideo[]> => {
      throw new YoutubeUnavailableError('quota');
    });
    const service = build(search);

    const first = await service.resolve('Chicken Kabsa', 'en');
    await service.resolve('Chicken Kabsa', 'en');

    // An outage is not an answer. Persisting it would blank the dish for 30 days.
    expect(first.status).toBe('none');
    expect(await storedMedia()).toBeNull();
    expect(search).toHaveBeenCalledTimes(2);
  });

  it('serves stale media through an outage rather than dead-ending', async () => {
    await build(async () => [video()]).resolve('Chicken Kabsa', 'en');

    const degraded = await build(async () => {
      throw new YoutubeUnavailableError('quota');
    }).resolve('Chicken Kabsa', 'en');

    expect(degraded.videos[0]?.youtubeId).toBe('Xtspw022mb4');
  });

  it('renews the timestamp on re-resolve, so the window can reopen', async () => {
    await build(async () => [video()]).resolve('Chicken Kabsa', 'en');

    // Age the row past the TTL, as real time would.
    const stale = new Date(Date.now() - (VIDEO_CACHE_TTL_DAYS + 1) * 86_400_000);
    await ctx.db
      .update(dishMedia)
      .set({ resolvedAt: stale })
      .where(and(eq(dishMedia.dishKey, KEY), eq(dishMedia.locale, 'en')));

    const search = vi.fn(async () => [video({ youtubeId: 'FUXpoUG_cXk' })]);
    await build(search).resolve('Chicken Kabsa', 'en');

    // Re-searched because it was stale, and the new timestamp must stick —
    // an upsert that skips on conflict freezes `resolvedAt` at the first
    // write, so the row can never go fresh again and every read re-searches.
    expect(search).toHaveBeenCalledTimes(1);
    const row = await storedMedia();
    expect(row!.resolvedAt.getTime()).toBeGreaterThan(stale.getTime());
    expect(row!.heroYoutubeId).toBe('FUXpoUG_cXk');
  });

  it('replaces the ranked list rather than merging it', async () => {
    await build(async () => [video(), video({ youtubeId: 'oldRunnerUp' })]).resolve(
      'Chicken Kabsa',
      'en',
    );
    await ctx.db
      .update(dishMedia)
      .set({ resolvedAt: new Date(0) })
      .where(and(eq(dishMedia.dishKey, KEY), eq(dishMedia.locale, 'en')));

    const media = await build(async () => [video()]).resolve('Chicken Kabsa', 'en');

    // A video that no longer ranks must disappear, or a demoted match outlives
    // the search that demoted it.
    expect(media.videos.map((v) => v.youtubeId)).toEqual(['Xtspw022mb4']);
  });

  it('rethrows a programming error instead of hiding it as no media', async () => {
    const service = build(async () => {
      throw new TypeError('bug');
    });
    await expect(service.resolve('Chicken Kabsa', 'en')).rejects.toBeInstanceOf(TypeError);
  });

  it('returns none for a title that reduces to nothing, without touching YouTube', async () => {
    const search = vi.fn(async () => [video()]);
    const media = await build(search).resolve('easy quick recipe', 'en');

    expect(media.status).toBe('none');
    expect(search).not.toHaveBeenCalled();
  });

  it('resolveMany never triggers a search, so a list cannot spend quota', async () => {
    const search = vi.fn(async () => [video()]);
    const service = build(search);

    const map = await service.resolveMany([
      { title: 'Chicken Kabsa', locale: 'en' },
      { title: 'Shakshuka', locale: 'en' },
    ]);

    expect(search).not.toHaveBeenCalled();
    expect(map.get(KEY)?.status).toBe('none');
  });

  it('resolveMany returns media a previous resolve stored', async () => {
    await build(async () => [video()]).resolve('Chicken Kabsa', 'en');

    const map = await build(async () => []).resolveMany([{ title: 'Chicken Kabsa', locale: 'en' }]);

    expect(map.get(KEY)?.heroThumbnailUrl).toContain('Xtspw022mb4');
  });

  /**
   * Behaviour 4: the empty answer is cached per locale.
   * `en` and `ar` are independent caches — exhausting one must not suppress
   * the other, or bilingual apps silently serve no media in the second locale.
   */
  it('caches the none answer per locale independently', async () => {
    // Seed ar rows too so cleanup doesn't leave stale data across runs
    await ctx.db.delete(dishVideos).where(eq(dishVideos.dishKey, KEY));
    await ctx.db.delete(dishMedia).where(eq(dishMedia.dishKey, KEY));

    const asked: string[] = [];
    const service = build(async (_title, locale) => {
      asked.push(locale);
      return []; // all rejected — will produce none for every search
    });

    // First en search → none recorded for en
    await service.resolve('Chicken Kabsa', 'en');
    // First ar search → none recorded for ar (separate row)
    await service.resolve('Chicken Kabsa', 'ar');
    // Second en call → fresh cache hit, no new search
    await service.resolve('Chicken Kabsa', 'en');

    expect(asked).toEqual(['en', 'ar']);

    // Both locales have independent none rows
    expect(await storedMedia('en')).toMatchObject({ status: 'none', locale: 'en' });
    expect(await storedMedia('ar')).toMatchObject({ status: 'none', locale: 'ar' });

    // clean up ar row to avoid leaking across test runs
    await ctx.db
      .delete(dishMedia)
      .where(and(eq(dishMedia.dishKey, KEY), eq(dishMedia.locale, 'ar')));
  });

  /**
   * Behaviour 2: video ids always originate from the YouTube client — never
   * from the LLM. The youtubeId stored and returned is exactly what the
   * injected client returned, with no LLM path involved.
   */
  it('stores exactly the youtubeId the YouTube client returned', async () => {
    const API_ID = 'API_SOURCED_ID';
    const media = await build(async () => [video({ youtubeId: API_ID })]).resolve(
      'Chicken Kabsa',
      'en',
    );

    expect(media.videos).toHaveLength(1);
    expect(media.videos[0]!.youtubeId).toBe(API_ID);

    const [stored] = await ctx.db
      .select()
      .from(dishVideos)
      .where(and(eq(dishVideos.dishKey, KEY), eq(dishVideos.locale, 'en')));
    expect(stored!.youtubeId).toBe(API_ID);
  });
});
