import type { Locale } from '@kitchen/contracts';
import {
  YOUTUBE_QUERY_SUFFIX,
  YoutubeUnavailableError,
  type YoutubeClient,
  type YoutubeVideo,
} from './clients.interface.js';

interface Thumbnails {
  maxres?: { url?: string };
  standard?: { url?: string };
  high?: { url?: string };
  medium?: { url?: string };
  default?: { url?: string };
}

interface SearchListResponse {
  items?: { id?: { videoId?: string } }[];
  error?: { errors?: { reason?: string }[] };
}

interface VideoListResponse {
  items?: {
    id?: string;
    snippet?: {
      title?: string;
      channelTitle?: string;
      categoryId?: string;
      defaultAudioLanguage?: string;
      thumbnails?: Thumbnails;
    };
    contentDetails?: { duration?: string };
    status?: { embeddable?: boolean };
  }[];
}

const ISO_DURATION = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/;

/** ISO-8601 durations (`PT12M22S`) → seconds. Unparseable input yields 0, which
 *  the relevance gate rejects as a Short rather than letting NaN through. */
export function parseIsoDuration(iso: string): number {
  const match = ISO_DURATION.exec(iso);
  if (!match) return 0;
  const [, days, hours, minutes, seconds] = match;
  return (
    Number(days ?? 0) * 86_400 +
    Number(hours ?? 0) * 3_600 +
    Number(minutes ?? 0) * 60 +
    Number(seconds ?? 0)
  );
}

/**
 * Highest-resolution thumbnail available. `maxres` and `standard` are 16:9;
 * `high` is 4:3 and shows pillarbox bars in a widescreen hero, so it is a last
 * resort rather than the default it used to be.
 */
export function pickThumbnail(thumbnails: Thumbnails | undefined): string {
  return (
    thumbnails?.maxres?.url ??
    thumbnails?.standard?.url ??
    thumbnails?.high?.url ??
    thumbnails?.medium?.url ??
    thumbnails?.default?.url ??
    ''
  );
}

/**
 * Real YouTube Data API v3.
 *
 * `search.list` costs 100 quota units and returns neither duration, nor
 * embeddability, nor category — the three things needed to tell a recipe from a
 * music video. `videos.list` supplies all of them for 1 more unit, so the pair
 * costs 101 against a 10,000 daily allowance.
 */
export class HttpYoutubeClient implements YoutubeClient {
  constructor(
    private readonly apiKey: string,
    private readonly baseUrl = 'https://www.googleapis.com/youtube/v3',
  ) {}

  // max = 10: search.list costs 100 quota units flat regardless of maxResults,
  // and videos.list costs 1 unit flat regardless of id count — so max=10 costs
  // exactly the same 101 units as the old max=3. A wider candidate set matters
  // because the relevance gate rejects Shorts, music-category videos, non-
  // embeddable results, and title mismatches; a narrow search can be fully
  // consumed by rejects, leaving the dish with no video at all.
  async search(query: string, locale: Locale, max = 10): Promise<YoutubeVideo[]> {
    const ids = await this.searchIds(query, locale, max);
    if (ids.length === 0) return [];
    return this.hydrate(ids);
  }

  private async searchIds(query: string, locale: Locale, max: number): Promise<string[]> {
    const url = new URL(`${this.baseUrl}/search`);
    url.searchParams.set('part', 'snippet');
    url.searchParams.set('type', 'video');
    url.searchParams.set('videoEmbeddable', 'true');
    url.searchParams.set('maxResults', String(max));
    url.searchParams.set('q', `${query} ${YOUTUBE_QUERY_SUFFIX[locale]}`.trim());
    url.searchParams.set('relevanceLanguage', locale);
    url.searchParams.set('safeSearch', 'strict');
    url.searchParams.set('key', this.apiKey);

    const body = await this.get<SearchListResponse>(url);
    return (body.items ?? []).map((item) => item.id?.videoId).filter((id): id is string => Boolean(id));
  }

  private async hydrate(ids: string[]): Promise<YoutubeVideo[]> {
    const url = new URL(`${this.baseUrl}/videos`);
    url.searchParams.set('part', 'snippet,contentDetails,status');
    url.searchParams.set('id', ids.join(','));
    url.searchParams.set('key', this.apiKey);

    const body = await this.get<VideoListResponse>(url);
    const byId = new Map(
      (body.items ?? []).filter((item) => item.id).map((item) => [item.id!, item] as const),
    );

    // Preserve the search ordering: it is YouTube's own relevance ranking, and
    // the gate uses it to break ties.
    return ids.flatMap((id) => {
      const item = byId.get(id);
      if (!item) return [];
      const thumbnailUrl = pickThumbnail(item.snippet?.thumbnails);
      if (!thumbnailUrl) return [];
      return [
        {
          youtubeId: id,
          title: item.snippet?.title ?? '',
          channel: item.snippet?.channelTitle ?? 'YouTube',
          thumbnailUrl,
          durationSeconds: parseIsoDuration(item.contentDetails?.duration ?? ''),
          categoryId: item.snippet?.categoryId ?? null,
          defaultAudioLanguage: item.snippet?.defaultAudioLanguage ?? null,
          embeddable: item.status?.embeddable ?? false,
        },
      ];
    });
  }

  private async get<T>(url: URL): Promise<T> {
    let response: Response;
    try {
      response = await fetch(url);
    } catch {
      throw new YoutubeUnavailableError('error');
    }

    if (response.status === 403) {
      const body = (await response.json().catch(() => ({}))) as SearchListResponse;
      const quota = body.error?.errors?.some((e) => e.reason?.includes('quota'));
      throw new YoutubeUnavailableError(quota ? 'quota' : 'error');
    }
    if (!response.ok) throw new YoutubeUnavailableError('error');

    return (await response.json()) as T;
  }
}
