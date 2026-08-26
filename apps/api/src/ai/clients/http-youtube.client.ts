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
      thumbnails?: ThumbnailSet;
    };
  }[];
  error?: { errors?: { reason?: string }[] };
}

interface VideosListResponse {
  items?: {
    id?: string;
    contentDetails?: { duration?: string };
    status?: { embeddable?: boolean };
    snippet?: {
      title?: string;
      channelTitle?: string;
      categoryId?: string;
      defaultAudioLanguage?: string;
      thumbnails?: ThumbnailSet;
    };
  }[];
  error?: { errors?: { reason?: string }[] };
}

type ThumbnailSet = Partial<
  Record<
    'maxres' | 'standard' | 'high' | 'medium' | 'default',
    { url?: string }
  >
>;

const THUMBNAIL_ORDER = [
  'maxres',
  'standard',
  'high',
  'medium',
  'default',
] as const;

function bestThumbnailUrl(thumbnails: ThumbnailSet | undefined): string {
  for (const size of THUMBNAIL_ORDER) {
    const url = thumbnails?.[size]?.url;
    if (url) return url;
  }
  return '';
}

function parseYoutubeDurationSeconds(duration: string): number {
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(duration);
  if (!match) return 0;
  const [, hours = '0', minutes = '0', seconds = '0'] = match;
  return Number(hours) * 3_600 + Number(minutes) * 60 + Number(seconds);
}

async function unavailableReason(
  response: Response,
): Promise<'quota' | 'error'> {
  if (response.status !== 403) return 'error';
  const body = (await response.json().catch(() => ({}))) as SearchListResponse;
  const quota = body.error?.errors?.some((e) =>
    e.reason?.toLowerCase().includes('quota'),
  );
  return quota ? 'quota' : 'error';
}

/**
 * Real YouTube Data API v3 search. Uses `search.list` only to discover ids,
 * then batches those ids through `videos.list` for filterable metadata.
 */
export class HttpYoutubeClient implements YoutubeClient {
  constructor(
    private readonly apiKey: string,
    private readonly baseUrl = 'https://www.googleapis.com/youtube/v3',
  ) {}

  async search(
    query: string,
    locale: Locale,
    max = 10,
  ): Promise<YoutubeVideo[]> {
    if (this.apiKey.trim().length === 0)
      throw new YoutubeUnavailableError('error');

    const url = new URL(`${this.baseUrl}/search`);
    url.searchParams.set('part', 'snippet');
    url.searchParams.set('type', 'video');
    url.searchParams.set('videoEmbeddable', 'true');
    url.searchParams.set('maxResults', '10');
    url.searchParams.set(
      'q',
      `${query} ${YOUTUBE_QUERY_SUFFIX[locale]}`.trim(),
    );
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
      throw new YoutubeUnavailableError(await unavailableReason(response));
    }
    if (!response.ok) throw new YoutubeUnavailableError('error');

    const body = (await response.json()) as SearchListResponse;
    const searchItems = (body.items ?? []).filter((item) => item.id?.videoId);
    const ids = searchItems.map((item) => item.id!.videoId!);
    if (ids.length === 0) return [];

    const snippets = new Map(
      ids.map((id, index) => [id, searchItems[index]!.snippet]),
    );
    const videosUrl = new URL(`${this.baseUrl}/videos`);
    videosUrl.searchParams.set('part', 'contentDetails,status,snippet');
    videosUrl.searchParams.set('id', ids.join(','));
    videosUrl.searchParams.set('key', this.apiKey);

    let videosResponse: Response;
    try {
      videosResponse = await fetch(videosUrl);
    } catch {
      throw new YoutubeUnavailableError('error');
    }

    if (videosResponse.status === 403) {
      throw new YoutubeUnavailableError(
        await unavailableReason(videosResponse),
      );
    }
    if (!videosResponse.ok) throw new YoutubeUnavailableError('error');

    const videosBody = (await videosResponse.json()) as VideosListResponse;
    const videos = new Map(
      (videosBody.items ?? [])
        .filter((item) => item.id)
        .map((item) => [item.id!, item]),
    );

    return ids
      .map((id) => {
        const item = videos.get(id);
        if (!item) return null;
        const snippet = item.snippet;
        const searchSnippet = snippets.get(id);
        return {
          youtubeId: id,
          title: snippet?.title ?? searchSnippet?.title ?? query,
          channel:
            snippet?.channelTitle ?? searchSnippet?.channelTitle ?? 'YouTube',
          thumbnailUrl:
            bestThumbnailUrl(snippet?.thumbnails) ||
            bestThumbnailUrl(searchSnippet?.thumbnails),
          durationSeconds: parseYoutubeDurationSeconds(
            item.contentDetails?.duration ?? 'PT0S',
          ),
          categoryId: snippet?.categoryId ?? null,
          defaultAudioLanguage: snippet?.defaultAudioLanguage ?? null,
          embeddable: item.status?.embeddable === true,
        } satisfies YoutubeVideo;
      })
      .filter((v): v is YoutubeVideo => v !== null)
      .filter((v) => v.thumbnailUrl.length > 0)
      .slice(0, Math.max(0, max));
  }
}
