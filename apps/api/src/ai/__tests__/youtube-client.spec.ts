import { afterEach, describe, expect, it, vi } from 'vitest';
import { HttpYoutubeClient, parseIsoDuration, pickThumbnail } from '../clients/http-youtube.client.js';
import { YoutubeUnavailableError } from '../clients/clients.interface.js';

afterEach(() => vi.unstubAllGlobals());

describe('parseIsoDuration', () => {
  it('parses minutes and seconds', () => expect(parseIsoDuration('PT12M22S')).toBe(742));
  it('parses hours', () => expect(parseIsoDuration('PT1H2M10S')).toBe(3730));
  it('parses a bare seconds value', () => expect(parseIsoDuration('PT45S')).toBe(45));
  it('returns 0 for an unparseable value rather than NaN', () => expect(parseIsoDuration('nonsense')).toBe(0));
});

describe('pickThumbnail', () => {
  it('prefers 16:9 maxres over 4:3 high', () => {
    const url = pickThumbnail({
      maxres: { url: 'max.jpg' },
      high: { url: 'high.jpg' },
    });
    expect(url).toBe('max.jpg');
  });

  it('falls back down the ladder when maxres is absent', () => {
    // Verified real case: XXxJbivD3k0 has no maxresdefault.
    expect(pickThumbnail({ high: { url: 'high.jpg' } })).toBe('high.jpg');
  });

  it('prefers 16:9 standard over 4:3 high', () => {
    expect(pickThumbnail({ standard: { url: 'std.jpg' }, high: { url: 'high.jpg' } })).toBe('std.jpg');
  });

  it('returns empty string when there is no thumbnail at all', () => {
    expect(pickThumbnail(undefined)).toBe('');
  });
});

describe('HttpYoutubeClient', () => {
  function stubFetch(search: unknown, videos: unknown) {
    const calls: string[] = [];
    vi.stubGlobal('fetch', async (url: URL) => {
      calls.push(url.toString());
      const body = url.toString().includes('/videos') ? videos : search;
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    return calls;
  }

  const search = {
    items: [{ id: { videoId: 'Xtspw022mb4' }, snippet: { title: 'Saudi Chicken Kabsa', channelTitle: 'The White Plate' } }],
  };
  const videos = {
    items: [
      {
        id: 'Xtspw022mb4',
        snippet: { title: 'Saudi Chicken Kabsa', channelTitle: 'The White Plate', categoryId: '26', defaultAudioLanguage: 'en', thumbnails: { maxres: { url: 'max.jpg' } } },
        contentDetails: { duration: 'PT12M22S' },
        status: { embeddable: true },
      },
    ],
  };

  it('requests only embeddable videos', async () => {
    const calls = stubFetch(search, videos);
    await new HttpYoutubeClient('key').search('Chicken Kabsa', 'en');
    expect(calls[0]).toContain('videoEmbeddable=true');
  });

  it('enriches each result through videos.list', async () => {
    stubFetch(search, videos);
    const [video] = await new HttpYoutubeClient('key').search('Chicken Kabsa', 'en');

    expect(video).toMatchObject({
      youtubeId: 'Xtspw022mb4',
      durationSeconds: 742,
      categoryId: '26',
      defaultAudioLanguage: 'en',
      embeddable: true,
      thumbnailUrl: 'max.jpg',
    });
  });

  it('drops a search hit that videos.list does not return', async () => {
    stubFetch(search, { items: [] });
    const results = await new HttpYoutubeClient('key').search('Chicken Kabsa', 'en');
    expect(results).toEqual([]);
  });

  it('raises YoutubeUnavailableError when videos.list fails', async () => {
    vi.stubGlobal('fetch', async (url: URL) => {
      if (url.toString().includes('/videos')) return { ok: false, status: 500, json: async () => ({}) } as Response;
      return { ok: true, status: 200, json: async () => search } as Response;
    });

    await expect(new HttpYoutubeClient('key').search('Chicken Kabsa', 'en')).rejects.toBeInstanceOf(
      YoutubeUnavailableError,
    );
  });

  it('still reports quota exhaustion from the search call', async () => {
    vi.stubGlobal('fetch', async () => ({
      ok: false,
      status: 403,
      json: async () => ({ error: { errors: [{ reason: 'quotaExceeded' }] } }),
    } as Response));

    await expect(new HttpYoutubeClient('key').search('Chicken Kabsa', 'en')).rejects.toMatchObject({
      reason: 'quota',
    });
  });
});
