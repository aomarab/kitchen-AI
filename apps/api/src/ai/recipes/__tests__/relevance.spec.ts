import { describe, expect, it } from 'vitest';
import { pickRanked, scoreCandidate, type Candidate } from '../relevance.js';

function candidate(over: Partial<Candidate> = {}): Candidate {
  return {
    youtubeId: 'abc12345678',
    title: 'Saudi Chicken Kabsa Recipe',
    durationSeconds: 742,
    embeddable: true,
    categoryId: '26',
    defaultAudioLanguage: 'en',
    ...over,
  };
}

describe('scoreCandidate — hard rejects', () => {
  it('rejects a music video, the exact defect that shipped', () => {
    // "Never Gonna Give You Up" was the stored video for Chicken Kabsa.
    const rick = candidate({ title: 'Rick Astley - Never Gonna Give You Up', categoryId: '10' });
    expect(scoreCandidate('Chicken Kabsa', rick, 'en')).toBeNull();
  });

  it('rejects a Short', () => {
    expect(scoreCandidate('Chicken Kabsa', candidate({ durationSeconds: 45 }), 'en')).toBeNull();
  });

  it('rejects an over-long compilation', () => {
    expect(scoreCandidate('Chicken Kabsa', candidate({ durationSeconds: 5400 }), 'en')).toBeNull();
  });

  it('rejects a non-embeddable video, which fails silently in the player', () => {
    expect(scoreCandidate('Chicken Kabsa', candidate({ embeddable: false }), 'en')).toBeNull();
  });

  it('rejects a video sharing only generic words', () => {
    const generic = candidate({ title: 'The Best Easy Recipe' });
    expect(scoreCandidate('Chicken Kabsa', generic, 'en')).toBeNull();
  });

  it('rejects a different dish that shares one common word', () => {
    const other = candidate({ title: 'Chicken Shawarma at Home' });
    expect(scoreCandidate('Chicken Kabsa', other, 'en')).toBeNull();
  });

  it('rejects a dish whose title reduces to nothing', () => {
    expect(scoreCandidate('easy quick recipe', candidate(), 'en')).toBeNull();
  });
});

describe('scoreCandidate — scoring', () => {
  it('accepts a genuine match', () => {
    expect(scoreCandidate('Chicken Kabsa', candidate(), 'en')).toBeGreaterThan(0);
  });

  it('matches across Arabic spelling variants', () => {
    const arabic = candidate({ title: 'طريقة عمل كَبْسَة الدَجَاج', defaultAudioLanguage: 'ar' });
    expect(scoreCandidate('كبسه دجاج', arabic, 'ar')).toBeGreaterThan(0);
  });

  it('ranks a how-to video above an equal-coverage rival', () => {
    const howto = scoreCandidate('Chicken Kabsa', candidate({ categoryId: '26' }), 'en');
    const other = scoreCandidate('Chicken Kabsa', candidate({ categoryId: '22' }), 'en');
    expect(howto!).toBeGreaterThan(other!);
  });

  it('ranks a matching audio language above a mismatched one', () => {
    const native = scoreCandidate('Chicken Kabsa', candidate({ defaultAudioLanguage: 'en-US' }), 'en');
    const foreign = scoreCandidate('Chicken Kabsa', candidate({ defaultAudioLanguage: 'de' }), 'en');
    expect(native!).toBeGreaterThan(foreign!);
  });

  it('tolerates an unknown category and audio language', () => {
    const unknown = candidate({ categoryId: null, defaultAudioLanguage: null });
    expect(scoreCandidate('Chicken Kabsa', unknown, 'en')).toBeGreaterThan(0);
  });
});

describe('pickRanked', () => {
  it('drops rejects and orders survivors best first', () => {
    const ranked = pickRanked(
      'Chicken Kabsa',
      [
        candidate({ youtubeId: 'music000000', title: 'Gangnam Style', categoryId: '10' }),
        candidate({ youtubeId: 'plain000000', categoryId: '22' }),
        candidate({ youtubeId: 'howto000000', categoryId: '26' }),
      ],
      'en',
    );

    expect(ranked.map((c) => c.youtubeId)).toEqual(['howto000000', 'plain000000']);
  });

  it('returns an empty list when nothing clears the bar', () => {
    const ranked = pickRanked('Chicken Kabsa', [candidate({ categoryId: '10' })], 'en');
    expect(ranked).toEqual([]);
  });

  it('breaks ties on the API order, which is YouTube own relevance', () => {
    const ranked = pickRanked(
      'Chicken Kabsa',
      [candidate({ youtubeId: 'first000000' }), candidate({ youtubeId: 'second00000' })],
      'en',
    );
    expect(ranked.map((c) => c.youtubeId)).toEqual(['first000000', 'second00000']);
  });
});
