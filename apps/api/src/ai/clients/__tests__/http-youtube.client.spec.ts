import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { YoutubeUnavailableError } from '../clients.interface.js';
import { HttpYoutubeClient } from '../http-youtube.client.js';

const BASE_URL = 'https://youtube.test/v3';

function searchItem(videoId: string) {
  return {
    id: { videoId },
    snippet: {
      title: `Search title ${videoId}`,
      channelTitle: 'Search Channel',
      thumbnails: { high: { url: `https://img.test/${videoId}/high.jpg` } },
    },
  };
}

function videoItem(videoId: string, duration: string) {
  return {
    id: videoId,
    contentDetails: { duration },
    status: { embeddable: true },
    snippet: {
      title: `Video title ${videoId}`,
      channelTitle: 'Cooking Channel',
      categoryId: '26',
      defaultAudioLanguage: 'en-US',
      thumbnails: {
        maxres: { url: `https://img.test/${videoId}/maxres.jpg` },
        standard: { url: `https://img.test/${videoId}/standard.jpg` },
        high: { url: `https://img.test/${videoId}/high.jpg` },
      },
    },
  };
}

describe('HttpYoutubeClient', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends the hardened search parameters and requests video metadata in one batch', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          items: [searchItem('video-one'), searchItem('video-two')],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          items: [
            videoItem('video-one', 'PT2M'),
            videoItem('video-two', 'PT45S'),
          ],
        }),
      });

    const videos = await new HttpYoutubeClient('youtube-key', BASE_URL).search(
      'Chicken Kabsa',
      'ar',
    );

    expect(videos).toHaveLength(2);
    const [searchUrl, videosUrl] = fetchMock.mock.calls.map(
      ([url]) => new URL(String(url)),
    );

    expect(searchUrl?.pathname).toBe('/v3/search');
    expect(searchUrl?.searchParams.get('part')).toBe('snippet');
    expect(searchUrl?.searchParams.get('type')).toBe('video');
    expect(searchUrl?.searchParams.get('videoEmbeddable')).toBe('true');
    expect(searchUrl?.searchParams.get('safeSearch')).toBe('strict');
    expect(searchUrl?.searchParams.get('relevanceLanguage')).toBe('ar');
    expect(searchUrl?.searchParams.get('maxResults')).toBe('10');
    expect(searchUrl?.searchParams.get('key')).toBe('youtube-key');
    expect(searchUrl?.searchParams.get('q')).toBe(
      'Chicken Kabsa طريقة عمل وصفة',
    );

    expect(videosUrl?.pathname).toBe('/v3/videos');
    expect(videosUrl?.searchParams.get('part')).toBe(
      'contentDetails,status,snippet',
    );
    expect(videosUrl?.searchParams.get('id')).toBe('video-one,video-two');
    expect(videosUrl?.searchParams.get('key')).toBe('youtube-key');
  });

  it('parses ISO-8601 durations including hours and chooses the best thumbnail', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          items: [
            searchItem('hour-video'),
            searchItem('seconds-video'),
            searchItem('minutes-video'),
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          items: [
            videoItem('hour-video', 'PT1H2M10S'),
            videoItem('seconds-video', 'PT45S'),
            videoItem('minutes-video', 'PT2M'),
          ],
        }),
      });

    const videos = await new HttpYoutubeClient('youtube-key', BASE_URL).search(
      'Lentil soup',
      'en',
    );

    expect(videos.map((video) => video.durationSeconds)).toEqual([
      3_730, 45, 120,
    ]);
    expect(videos[0]).toMatchObject({
      categoryId: '26',
      defaultAudioLanguage: 'en-US',
      embeddable: true,
      thumbnailUrl: 'https://img.test/hour-video/maxres.jpg',
    });
  });

  it('throws YoutubeUnavailableError when videos.list fails', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ items: [searchItem('video-one')] }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: { errors: [{ reason: 'backendError' }] } }),
      });

    await expect(
      new HttpYoutubeClient('youtube-key', BASE_URL).search(
        'Chicken Kabsa',
        'en',
      ),
    ).rejects.toMatchObject({
      name: 'YoutubeUnavailableError',
      reason: 'error',
    });
  });

  it('fails cleanly without calling YouTube when the API key is empty', async () => {
    await expect(
      new HttpYoutubeClient('', BASE_URL).search('Chicken Kabsa', 'en'),
    ).rejects.toBeInstanceOf(YoutubeUnavailableError);

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
