import type { Locale } from '@kitchen/contracts';
import type { YoutubeClient, YoutubeVideo } from './clients.interface.js';

/**
 * Fixture YouTube client, selected under `AI_MOCK`. Returns deterministic,
 * locale-aware results derived from the query so the recipe/video pipeline can
 * be developed and tested with no API key or quota. Video ids are stable
 * fixtures — the point is that ids never originate from the LLM (spec §5.5).
 */
export class MockYoutubeClient implements YoutubeClient {
  async search(query: string, locale: Locale, max = 3): Promise<YoutubeVideo[]> {
    const suffix = locale === 'ar' ? 'بالعربي' : 'Recipe';
    const channel = locale === 'ar' ? 'مطبخ' : 'Kitchen Channel';
    const ids = ['dQw4w9WgXcQ', 'M7lc1UVf-VE', '9bZkp7q19f0'];
    const count = Math.min(max, 2);
    return Array.from({ length: count }, (_, i) => ({
      youtubeId: ids[i]!,
      title: `${query} — ${suffix} #${i + 1}`,
      channel,
      thumbnailUrl: `https://i.ytimg.com/vi/${ids[i]}/hqdefault.jpg`,
      durationSeconds: 480 + i * 120,
    }));
  }
}
