import { describe, expect, it } from 'vitest';
import { scoreCandidate, type RelevanceCandidate } from '../relevance.js';

function candidate(overrides: Partial<RelevanceCandidate> = {}): RelevanceCandidate {
  return {
    title: 'Chicken Kabsa recipe tutorial',
    categoryId: '26',
    defaultAudioLanguage: 'en-US',
    embeddable: true,
    durationSeconds: 600,
    ...overrides,
  };
}

describe('scoreCandidate', () => {
  it('rejects music-category videos for Chicken Kabsa', () => {
    expect(scoreCandidate('Chicken Kabsa', candidate({ categoryId: '10' }), 'en')).toBeNull();
  });

  it('rejects Shorts', () => {
    expect(scoreCandidate('Chicken Kabsa', candidate({ durationSeconds: 59 }), 'en')).toBeNull();
  });

  it('rejects compilation-length videos', () => {
    expect(scoreCandidate('Chicken Kabsa', candidate({ durationSeconds: 2701 }), 'en')).toBeNull();
  });

  it('rejects non-embeddable videos', () => {
    expect(scoreCandidate('Chicken Kabsa', candidate({ embeddable: false }), 'en')).toBeNull();
  });

  it('rejects candidates below the coverage floor', () => {
    expect(
      scoreCandidate(
        'Chicken Kabsa Rice',
        candidate({ title: 'Chicken dinner recipe', categoryId: '22', defaultAudioLanguage: null }),
        'en',
      ),
    ).toBeNull();
  });

  it('rejects generic-word-only overlap', () => {
    expect(
      scoreCandidate(
        'Easy Recipe',
        candidate({ title: 'Easy recipe how to make', categoryId: '22', defaultAudioLanguage: null }),
        'en',
      ),
    ).toBeNull();
  });

  it('scores a genuine match above the acceptance floor', () => {
    expect(scoreCandidate('Chicken Kabsa', candidate(), 'en')).toBeGreaterThan(0.5);
  });

  it('ranks category 26 and matching audio language above an equal-coverage rival', () => {
    const boosted = scoreCandidate('Chicken Kabsa', candidate(), 'en');
    const rival = scoreCandidate(
      'Chicken Kabsa',
      candidate({ categoryId: '22', defaultAudioLanguage: 'ar' }),
      'en',
    );

    expect(boosted).not.toBeNull();
    expect(rival).not.toBeNull();
    expect(boosted).toBeGreaterThan(rival ?? 0);
    expect(boosted).toBeLessThanOrEqual(1.25);
  });
});
