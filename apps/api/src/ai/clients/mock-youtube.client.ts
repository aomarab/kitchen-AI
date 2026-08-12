import type { Locale } from '@kitchen/contracts';
import type { YoutubeClient, YoutubeVideo } from './clients.interface.js';

/**
 * Fixture YouTube client, selected under `AI_MOCK`. Returns deterministic,
 * locale-aware results derived from the query so the recipe/video pipeline can
 * be developed and tested with no API key or quota. Video ids are stable
 * fixtures — the point is that ids never originate from the LLM (spec §5.5).
 */
export class MockYoutubeClient implements YoutubeClient {
  async search(
    query: string,
    locale: Locale,
    max = 10,
  ): Promise<YoutubeVideo[]> {
    const fixtures =
      locale === 'ar'
        ? [
            {
              youtubeId: 'a1B2c3D4e5F',
              title: `طريقة عمل ${query} خطوة بخطوة`,
              channel: 'مطبخ البيت',
              thumbnailUrl:
                'https://i.ytimg.com/vi/a1B2c3D4e5F/maxresdefault.jpg',
              durationSeconds: 720,
              categoryId: '26',
              defaultAudioLanguage: 'ar',
              embeddable: true,
            },
            {
              youtubeId: 'g6H7i8J9k0L',
              title: `${query} بوصفة سهلة للمبتدئين`,
              channel: 'وصفات يومية',
              thumbnailUrl: 'https://i.ytimg.com/vi/g6H7i8J9k0L/sddefault.jpg',
              durationSeconds: 960,
              categoryId: '26',
              defaultAudioLanguage: 'ar-SA',
              embeddable: true,
            },
            {
              youtubeId: 'm1N2o3P4q5R',
              title: `${query} في أقل من دقيقة`,
              channel: 'لقمات سريعة',
              thumbnailUrl: 'https://i.ytimg.com/vi/m1N2o3P4q5R/hqdefault.jpg',
              durationSeconds: 42,
              categoryId: '26',
              defaultAudioLanguage: 'ar',
              embeddable: true,
            },
          ]
        : [
            {
              youtubeId: 'a1B2c3D4e5F',
              title: `${query} step-by-step dinner recipe`,
              channel: 'Home Kitchen',
              thumbnailUrl:
                'https://i.ytimg.com/vi/a1B2c3D4e5F/maxresdefault.jpg',
              durationSeconds: 720,
              categoryId: '26',
              defaultAudioLanguage: 'en',
              embeddable: true,
            },
            {
              youtubeId: 'g6H7i8J9k0L',
              title: `Easy ${query} for weeknights`,
              channel: 'Pantry Table',
              thumbnailUrl: 'https://i.ytimg.com/vi/g6H7i8J9k0L/sddefault.jpg',
              durationSeconds: 960,
              categoryId: '26',
              defaultAudioLanguage: 'en-US',
              embeddable: true,
            },
            {
              youtubeId: 'm1N2o3P4q5R',
              title: `${query} in under a minute`,
              channel: 'Quick Kitchen Shorts',
              thumbnailUrl: 'https://i.ytimg.com/vi/m1N2o3P4q5R/hqdefault.jpg',
              durationSeconds: 42,
              categoryId: '26',
              defaultAudioLanguage: 'en',
              embeddable: true,
            },
          ];

    return fixtures.slice(0, max);
  }
}
