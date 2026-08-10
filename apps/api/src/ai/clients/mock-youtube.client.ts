import type { Locale } from '@kitchen/contracts';
import type { YoutubeClient, YoutubeVideo } from './clients.interface.js';

/**
 * Fixture YouTube client, selected under `AI_MOCK`.
 *
 * The ids are real, verified cooking videos: the previous fixtures were famous
 * music videos, and because the hero image derives from the video id, they
 * rendered a celebrity's face as the meal photo.
 *
 * The third entry is a deliberate reject — a 30-second Short — so the relevance
 * gate is exercised in mock mode rather than bypassed by fixtures that all pass.
 */
export class MockYoutubeClient implements YoutubeClient {
  async search(query: string, locale: Locale, max = 10): Promise<YoutubeVideo[]> {
    const suffix = locale === 'ar' ? 'بالعربي' : 'Recipe';
    const channel = locale === 'ar' ? 'مطبخ' : 'Kitchen Channel';

    const fixtures: YoutubeVideo[] = [
      {
        youtubeId: 'Xtspw022mb4',
        title: `${query} — ${suffix}`,
        channel,
        thumbnailUrl: 'https://i.ytimg.com/vi/Xtspw022mb4/hqdefault.jpg',
        durationSeconds: 742,
        categoryId: '26',
        defaultAudioLanguage: locale,
        embeddable: true,
      },
      {
        youtubeId: 'FUXpoUG_cXk',
        title: `${query} — ${suffix} 2`,
        channel,
        thumbnailUrl: 'https://i.ytimg.com/vi/FUXpoUG_cXk/hqdefault.jpg',
        durationSeconds: 388,
        categoryId: '26',
        defaultAudioLanguage: locale,
        embeddable: true,
      },
      {
        youtubeId: 'xGEr3FPUJ84',
        title: `${query} — ${suffix} #shorts`,
        channel,
        thumbnailUrl: 'https://i.ytimg.com/vi/xGEr3FPUJ84/hqdefault.jpg',
        durationSeconds: 30,
        categoryId: '26',
        defaultAudioLanguage: locale,
        embeddable: true,
      },
    ];

    return fixtures.slice(0, max);
  }
}
