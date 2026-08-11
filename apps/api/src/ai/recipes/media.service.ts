import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { Locale, RecipeVideo } from '@kitchen/contracts';
import { DB, type Database } from '../../db/index.js';
import { dishMedia, dishVideos } from '../../db/schema.js';
import { VIDEO_CACHE_TTL_DAYS, YOUTUBE_CLIENT } from '../ai.constants.js';
import {
  YoutubeUnavailableError,
  type YoutubeClient,
  type YoutubeVideo,
} from '../clients/clients.interface.js';
import { dishKey } from './dish-key.js';
import { pickRanked } from './relevance.js';

export interface DishMedia {
  status: 'matched' | 'none';
  heroThumbnailUrl: string | null;
  videos: RecipeVideo[];
}

export const NO_MEDIA: DishMedia = { status: 'none', heroThumbnailUrl: null, videos: [] };

/**
 * Resolves a dish to a hero image and a ranked video list, once, for everyone.
 *
 * Media is keyed by dish rather than by recipe because recipes are
 * household-scoped: the same dish exists once per household, and a
 * recipe-keyed cache therefore spent a fresh 100-unit YouTube search on each
 * one. Here the first household to open a recipe resolves it for all of them.
 */
@Injectable()
export class MediaService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(YOUTUBE_CLIENT) private readonly youtube: YoutubeClient,
  ) {}

  async resolve(title: string, locale: Locale): Promise<DishMedia> {
    const key = dishKey(title);
    // A title of nothing but generic words has no identity to cache or search.
    if (key.length === 0) return NO_MEDIA;

    const stored = await this.readMedia(key, locale);
    if (stored && this.isFresh(stored.resolvedAt)) return this.project(key, locale, stored);

    try {
      const ranked = pickRanked(title, await this.youtube.search(title, locale), locale);
      return ranked.length === 0
        ? await this.persistNone(key, locale)
        : await this.persistMatch(key, locale, ranked);
    } catch (err) {
      // Anything that is not an upstream outage is a bug: let it surface.
      if (!(err instanceof YoutubeUnavailableError)) throw err;

      // An outage is not an answer. Serve whatever is stored, however stale,
      // and write nothing — recording `none` here would blank the dish for the
      // full 30-day TTL because YouTube was briefly unreachable.
      return stored ? this.project(key, locale, stored) : NO_MEDIA;
    }
  }

  /**
   * Media for many dishes at once, read-only. A list render must never be able
   * to trigger a search: one screen of twenty recipes would otherwise cost
   * 2,000 quota units against a daily allowance of 10,000.
   */
  async resolveMany(
    requests: { title: string; locale: Locale }[],
  ): Promise<Map<string, DishMedia>> {
    const keys = [...new Set(requests.map((r) => dishKey(r.title)).filter((k) => k.length > 0))];
    const result = new Map<string, DishMedia>();
    if (keys.length === 0) return result;

    const [mediaRows, videoRows] = await Promise.all([
      this.db.select().from(dishMedia).where(inArray(dishMedia.dishKey, keys)),
      this.db
        .select()
        .from(dishVideos)
        .where(inArray(dishVideos.dishKey, keys))
        .orderBy(asc(dishVideos.rank)),
    ]);

    for (const row of mediaRows) {
      const videos = videoRows
        .filter((v) => v.dishKey === row.dishKey && v.locale === row.locale)
        .map(toRecipeVideo);
      result.set(row.dishKey, {
        status: row.status,
        heroThumbnailUrl: row.heroThumbnailUrl,
        videos,
      });
    }

    for (const key of keys) if (!result.has(key)) result.set(key, NO_MEDIA);
    return result;
  }

  private isFresh(resolvedAt: Date): boolean {
    return Date.now() - resolvedAt.getTime() < VIDEO_CACHE_TTL_DAYS * 86_400_000;
  }

  private async readMedia(key: string, locale: Locale) {
    const [row] = await this.db
      .select()
      .from(dishMedia)
      .where(and(eq(dishMedia.dishKey, key), eq(dishMedia.locale, locale)));
    return row ?? null;
  }

  private async project(
    key: string,
    locale: Locale,
    row: { status: 'matched' | 'none'; heroThumbnailUrl: string | null },
  ): Promise<DishMedia> {
    if (row.status === 'none') return NO_MEDIA;
    const rows = await this.db
      .select()
      .from(dishVideos)
      .where(and(eq(dishVideos.dishKey, key), eq(dishVideos.locale, locale)))
      .orderBy(asc(dishVideos.rank));
    return { status: 'matched', heroThumbnailUrl: row.heroThumbnailUrl, videos: rows.map(toRecipeVideo) };
  }

  private async persistNone(key: string, locale: Locale): Promise<DishMedia> {
    const now = new Date();
    await this.db
      .insert(dishMedia)
      .values({ dishKey: key, locale, status: 'none', resolvedAt: now })
      // Renew `resolvedAt`, never skip: doing nothing on conflict freezes the
      // timestamp at the first write, so the freshness window can never reopen.
      .onConflictDoUpdate({
        target: [dishMedia.dishKey, dishMedia.locale],
        set: { status: 'none', heroYoutubeId: null, heroThumbnailUrl: null, resolvedAt: now },
      });
    return NO_MEDIA;
  }

  private async persistMatch(
    key: string,
    locale: Locale,
    ranked: YoutubeVideo[],
  ): Promise<DishMedia> {
    const winner = ranked[0]!;
    const now = new Date();

    await this.db.transaction(async (tx) => {
      await tx
        .insert(dishMedia)
        .values({
          dishKey: key,
          locale,
          status: 'matched',
          heroYoutubeId: winner.youtubeId,
          heroThumbnailUrl: winner.thumbnailUrl,
          resolvedAt: now,
        })
        .onConflictDoUpdate({
          target: [dishMedia.dishKey, dishMedia.locale],
          set: {
            status: 'matched',
            heroYoutubeId: winner.youtubeId,
            heroThumbnailUrl: winner.thumbnailUrl,
            resolvedAt: now,
          },
        });

      // Replace rather than merge: a video that no longer ranks must disappear,
      // or a stale winner outlives the search that demoted it.
      await tx
        .delete(dishVideos)
        .where(and(eq(dishVideos.dishKey, key), eq(dishVideos.locale, locale)));
      await tx.insert(dishVideos).values(
        ranked.map((v, rank) => ({
          dishKey: key,
          locale,
          youtubeId: v.youtubeId,
          title: v.title,
          channel: v.channel,
          thumbnailUrl: v.thumbnailUrl,
          durationSeconds: v.durationSeconds,
          rank,
          fetchedAt: now,
        })),
      );
    });

    return {
      status: 'matched',
      heroThumbnailUrl: winner.thumbnailUrl,
      videos: ranked.map((v) => ({
        youtubeId: v.youtubeId,
        title: v.title,
        channel: v.channel,
        thumbnailUrl: v.thumbnailUrl,
        durationSeconds: v.durationSeconds,
        locale,
      })),
    };
  }
}

function toRecipeVideo(row: typeof dishVideos.$inferSelect): RecipeVideo {
  return {
    youtubeId: row.youtubeId,
    title: row.title,
    channel: row.channel,
    thumbnailUrl: row.thumbnailUrl,
    durationSeconds: row.durationSeconds,
    locale: row.locale,
  };
}
