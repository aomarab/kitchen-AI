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
  /**
   * Real regressions, each measured against live YouTube results before being
   * written down. All three dishes below returned nothing before these rules.
   */
  it('admits a plain dish video for a descriptively titled Arabic recipe', () => {
    // "شكشوكة خطيرة" covers one of four tokens. Requiring half the tokens
    // rejected five genuine shakshuka videos in a row, because no cook writes
    // "soft" and "with cream cheese" into a title.
    const score = scoreCandidate(
      'شكشوكة ناعمة بالجبنة الكريمية',
      candidate({ title: 'شكشوكه خطيره', categoryId: '26', defaultAudioLanguage: 'ar' }),
      'ar',
    );

    expect(score).not.toBeNull();
  });

  it('still rejects a different dish that merely shares the trailing ingredient', () => {
    // Banana is the last word of the recipe, and Arabic is head-initial, so the
    // dish is `توست` — a banana cheesecake is not a match at any coverage.
    expect(
      scoreCandidate(
        'توست بالجبنة الكريمية والعسل والموز',
        candidate({ title: 'طريقة عمل تشيز كيك بالموز مع خبيرة التغذية', categoryId: '26', defaultAudioLanguage: 'ar' }),
        'ar',
      ),
    ).toBeNull();
  });

  it('matches across a bound preposition and a spelling variant', () => {
    // `بصلصة` never folds to `صلصة` (stripping a bare ب would destroy `بصل`),
    // and `معكرونة`/`مكرونة` are both current spellings. Exact matching scored
    // this video 0.25 and threw away the best pasta result on the page.
    const score = scoreCandidate(
      'معكرونة بصلصة طماطم كريمية',
      candidate({
        title: 'طعم مكرونة الاسباغيتي لذيذ مع صلصة الطماطم هذه الغنية واللذيذة',
        categoryId: '26',
        defaultAudioLanguage: 'ar',
      }),
      'ar',
    );

    expect(score).not.toBeNull();
    expect(score).toBeGreaterThan(0.7);
  });

  it('does not treat two short unrelated tokens as a fuzzy match', () => {
    // `بصل` (onion) sits inside `بصلة`; below four characters only exact
    // matches count, or every short Arabic word would match its neighbours.
    expect(
      scoreCandidate(
        'بصل مشوي',
        candidate({ title: 'وصفة صل خفيفة', categoryId: '26', defaultAudioLanguage: 'ar' }),
        'ar',
      ),
    ).toBeNull();
  });

  it('uses the head-final noun for English rather than the leading modifier', () => {
    // English compounds put the dish last: a kabsa video is the match for
    // "Chicken Kabsa", and a chicken sandwich is not.
    expect(
      scoreCandidate(
        'Chicken Kabsa',
        candidate({ title: 'Kabsa the traditional way', categoryId: '26', defaultAudioLanguage: 'en' }),
        'en',
      ),
    ).not.toBeNull();
  });
});
