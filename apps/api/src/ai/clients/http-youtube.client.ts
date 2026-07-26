import type { Locale } from '@kitchen/contracts';
import {
  YOUTUBE_QUERY_SUFFIX,
  YoutubeUnavailableError,
  type YoutubeClient,
  type YoutubeVideo,
} from './clients.interface.js';

interface SearchListResponse {
  items?: {
    id?: { videoId?: string };
    snippet?: {
      title?: string;
      channelTitle?: string;
      thumbnails?: { high?: { url?: string }; medium?: { url?: string }; default?: { url?: string } };
    };
  }[];
  error?: { errors?: { reason?: string }[] };
}

/**
 * Real YouTube Data API v3 `search.list`. Uses the recipe title in the user's
 * locale plus a locale-appropriate suffix. On a quota error (HTTP 403 with a
 * quota reason) it throws {@link YoutubeUnavailableError} so the caller renders
 * the recipe with no video. Durations are left null to avoid a second
 * quota-costly `videos.list` call.
 */
export class HttpYoutubeClient implements YoutubeClient {
  constructor(
    private readonly apiKey: string,
    private readonly baseUrl = 'https://www.googleapis.com/youtube/v3',
  ) {}

  async search(query: string, locale: Locale, max = 3): Promise<YoutubeVideo[]> {
    const url = new URL(`${this.baseUrl}/search`);
    url.searchParams.set('part', 'snippet');
    url.searchParams.set('type', 'video');
    url.searchParams.set('maxResults', String(max));
    url.searchParams.set('q', `${query} ${YOUTUBE_QUERY_SUFFIX[locale]}`.trim());
    url.searchParams.set('relevanceLanguage', locale);
    url.searchParams.set('safeSearch', 'strict');
    url.searchParams.set('key', this.apiKey);

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

    const body = (await response.json()) as SearchListResponse;
    return (body.items ?? [])
      .filter((item) => item.id?.videoId)
      .map((item) => {
        const thumbs = item.snippet?.thumbnails;
        return {
          youtubeId: item.id!.videoId!,
          title: item.snippet?.title ?? query,
          channel: item.snippet?.channelTitle ?? 'YouTube',
          thumbnailUrl:
            thumbs?.high?.url ?? thumbs?.medium?.url ?? thumbs?.default?.url ?? '',
          durationSeconds: null,
        };
      })
      .filter((v) => v.thumbnailUrl.length > 0);
  }
}
