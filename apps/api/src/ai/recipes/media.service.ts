import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { Inject, Injectable } from '@nestjs/common';
import type { Locale } from '@kitchen/contracts';
import { DB, type Database } from '../../db/index.js';
import { dishMedia, dishVideos } from '../../db/schema.js';
import { VIDEO_CACHE_TTL_DAYS, YOUTUBE_CLIENT } from '../ai.constants.js';
import {
  YoutubeUnavailableError,
  type YoutubeClient,
  type YoutubeVideo,
} from '../clients/clients.interface.js';
import { dishHeadQuery, dishKey } from './dish-key.js';
import { scoreCandidate } from './relevance.js';

export interface DishMediaVideo {
  youtubeId: string;
  title: string;
  channel: string;
  thumbnailUrl: string;
  durationSeconds: number;
}

export interface DishMedia {
  dishKey: string;
  locale: Locale;
  status: 'matched' | 'none';
  heroThumbnailUrl: string | null;
  heroYoutubeId: string | null;
  videos: DishMediaVideo[];
}

/** How many scored survivors are worth storing per dish. */
const MAX_STORED_VIDEOS = 5;

/**
 * Resolves the image and videos for a *dish*.
 *
 * Recipes are household-scoped, so a recipe-keyed cache paid a fresh 100-unit
 * YouTube search for every household that happened to generate the same dish.
 * Keying on the normalized title collapses those into one lookup that every
 * household shares, which is what keeps the daily quota survivable.
 *
 * The hero image is the winning video's thumbnail rather than a separate image
 * source: it costs nothing extra, and the picture and the video cannot then
 * disagree about which dish they show.
 */
@Injectable()
export class MediaService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(YOUTUBE_CLIENT) private readonly youtube: YoutubeClient,
  ) {}

  keyFor(title: string, locale: Locale): string {
    return dishKey(title, locale);
  }

  /**
   * Media already resolved for these dishes, without ever searching.
   *
   * List screens use this: a list shows real images for dishes somebody has
   * already opened and placeholders for the rest, and no list render can
   * trigger a paid lookup.
   */
  async lookupMany(keys: readonly string[], locale: Locale): Promise<Map<string, DishMedia>> {
    const unique = [...new Set(keys)];
    if (unique.length === 0) return new Map();

    const rows = await this.db
      .select()
      .from(dishMedia)
      .where(and(inArray(dishMedia.dishKey, unique), eq(dishMedia.locale, locale)));

    return new Map(
      rows.map((row) => [
        row.dishKey,
        {
          dishKey: row.dishKey,
          locale,
          status: row.status,
          heroThumbnailUrl: row.heroThumbnailUrl,
          heroYoutubeId: row.heroYoutubeId,
          videos: [],
        },
      ]),
    );
  }

  async resolve(key: string, title: string, locale: Locale): Promise<DishMedia> {
    const fresh = await this.readFresh(key, locale);
    if (fresh) return fresh;

    let candidates;
    try {
      candidates = await this.searchCandidates(title, locale);
    } catch (err) {
      if (err instanceof YoutubeUnavailableError) return this.degrade(key, locale);
      throw err;
    }

    const survivors = candidates
      .map((candidate) => ({ candidate, score: scoreCandidate(title, candidate, locale) }))
      .filter((scored): scored is { candidate: (typeof candidates)[number]; score: number } => scored.score !== null)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_STORED_VIDEOS)
      .map(({ candidate }) => candidate);

    if (survivors.length === 0) return this.persistNone(key, locale);

    return this.persistMatch(key, locale, survivors);
  }

  /**
   * Two searches, because the two failure modes are opposite. A generated title
   * is descriptive enough that YouTube often matches nothing and falls back to
   * loosely related cooking videos — searching `شكشوكة ناعمة بالجبنة الكريمية`
   * returns no shakshuka at all, while searching `شكشوكة` returns seven. The
   * dish word alone, though, never surfaces the video that happens to match the
   * whole phrase. Running both and ranking the union keeps the recall of the
   * first and the precision of the second; the relevance gate discards the rest,
   * and a dish is resolved once per thirty days, so the extra call is cheap.
   */
  private async searchCandidates(title: string, locale: Locale): Promise<YoutubeVideo[]> {
    const head = dishHeadQuery(title, locale);
    const queries = head === title ? [title] : [title, head];
    const results = await Promise.all(queries.map((query) => this.youtube.search(query, locale)));

    const byId = new Map<string, YoutubeVideo>();
    for (const video of results.flat()) {
      if (!byId.has(video.youtubeId)) byId.set(video.youtubeId, video);
    }

    return [...byId.values()];
  }

  private async readFresh(key: string, locale: Locale): Promise<DishMedia | null> {
    const cutoff = new Date(Date.now() - VIDEO_CACHE_TTL_DAYS * 86_400_000);
    const [row] = await this.db
      .select()
      .from(dishMedia)
      .where(and(eq(dishMedia.dishKey, key), eq(dishMedia.locale, locale)));

    if (!row || row.resolvedAt < cutoff) return null;

    return {
      dishKey: key,
      locale,
      status: row.status,
      heroThumbnailUrl: row.heroThumbnailUrl,
      heroYoutubeId: row.heroYoutubeId,
      videos: row.status === 'matched' ? await this.readVideos(key, locale) : [],
    };
  }

  /**
   * YouTube was unreachable. Serve whatever is stored even if stale, and when
   * nothing is stored return a `none` that is deliberately *not* persisted:
   * caching an outage as "YouTube has nothing" would poison the dish for the
   * full thirty days.
   */
  private async degrade(key: string, locale: Locale): Promise<DishMedia> {
    const [row] = await this.db
      .select()
      .from(dishMedia)
      .where(and(eq(dishMedia.dishKey, key), eq(dishMedia.locale, locale)));

    if (!row) {
      return {
        dishKey: key,
        locale,
        status: 'none',
        heroThumbnailUrl: null,
        heroYoutubeId: null,
        videos: [],
      };
    }

    return {
      dishKey: key,
      locale,
      status: row.status,
      heroThumbnailUrl: row.heroThumbnailUrl,
      heroYoutubeId: row.heroYoutubeId,
      videos: row.status === 'matched' ? await this.readVideos(key, locale) : [],
    };
  }

  private async persistNone(key: string, locale: Locale): Promise<DishMedia> {
    await this.db
      .insert(dishMedia)
      .values({ dishKey: key, locale, status: 'none', heroYoutubeId: null, heroThumbnailUrl: null })
      .onConflictDoUpdate({
        target: [dishMedia.dishKey, dishMedia.locale],
        // Renew resolvedAt, never leave it frozen: `defaultNow` only applies on
        // insert, so doing nothing on conflict would keep the row permanently
        // stale and re-run a 100-unit search on every request past day 30.
        set: {
          status: 'none',
          heroYoutubeId: null,
          heroThumbnailUrl: null,
          resolvedAt: sql`now()`,
        },
      });

    return {
      dishKey: key,
      locale,
      status: 'none',
      heroThumbnailUrl: null,
      heroYoutubeId: null,
      videos: [],
    };
  }

  private async persistMatch(
    key: string,
    locale: Locale,
    survivors: readonly { youtubeId: string; title: string; channel: string; thumbnailUrl: string; durationSeconds: number }[],
  ): Promise<DishMedia> {
    const winner = survivors[0]!;

    await this.db.transaction(async (tx) => {
      await tx
        .insert(dishMedia)
        .values({
          dishKey: key,
          locale,
          status: 'matched',
          heroYoutubeId: winner.youtubeId,
          heroThumbnailUrl: winner.thumbnailUrl,
        })
        .onConflictDoUpdate({
          target: [dishMedia.dishKey, dishMedia.locale],
          set: {
            status: 'matched',
            heroYoutubeId: winner.youtubeId,
            heroThumbnailUrl: winner.thumbnailUrl,
            resolvedAt: sql`now()`,
          },
        });

      // Replace rather than merge: rank is only meaningful within one search,
      // so leaving older rows behind would interleave two rankings.
      await tx
        .delete(dishVideos)
        .where(and(eq(dishVideos.dishKey, key), eq(dishVideos.locale, locale)));

      await tx.insert(dishVideos).values(
        survivors.map((video, rank) => ({
          dishKey: key,
          locale,
          youtubeId: video.youtubeId,
          title: video.title,
          channel: video.channel,
          thumbnailUrl: video.thumbnailUrl,
          durationSeconds: video.durationSeconds,
          rank,
        })),
      );
    });

    return {
      dishKey: key,
      locale,
      status: 'matched',
      heroThumbnailUrl: winner.thumbnailUrl,
      heroYoutubeId: winner.youtubeId,
      // Projected field by field rather than spread: `survivors` are search
      // results carrying scoring-only metadata (categoryId, embeddable,
      // defaultAudioLanguage) that a spread would widen this past
      // `DishMediaVideo` and leak to clients — and only on a cache miss, so the
      // endpoint would answer with two different shapes for the same recipe.
      videos: survivors.map((video) => ({
        youtubeId: video.youtubeId,
        title: video.title,
        channel: video.channel,
        thumbnailUrl: video.thumbnailUrl,
        durationSeconds: video.durationSeconds,
      })),
    };
  }

  private async readVideos(key: string, locale: Locale): Promise<DishMediaVideo[]> {
    const rows = await this.db
      .select()
      .from(dishVideos)
      .where(and(eq(dishVideos.dishKey, key), eq(dishVideos.locale, locale)))
      .orderBy(asc(dishVideos.rank));

    return rows.map((row) => ({
      youtubeId: row.youtubeId,
      title: row.title,
      channel: row.channel,
      thumbnailUrl: row.thumbnailUrl,
      durationSeconds: row.durationSeconds,
    }));
  }
}
