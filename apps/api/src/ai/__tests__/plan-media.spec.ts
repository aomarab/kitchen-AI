import { describe, expect, it } from 'vitest';
import type { Locale } from '@kitchen/contracts';
import { PlanService } from '../plan/plan.service.js';
import type { Database } from '../../db/index.js';
import type { MediaService } from '../recipes/media.service.js';

const HERO = 'https://i.ytimg.com/vi/abc12345678/maxresdefault.jpg';

function planRow(locale: Locale) {
  return {
    id: 'plan-1',
    householdId: 'hh-1',
    scope: 'daily' as const,
    startsOn: '2026-08-01',
    endsOn: '2026-08-01',
    status: 'ready' as const,
    locale,
    createdAt: new Date('2026-08-01T00:00:00Z'),
    entries: [
      {
        id: 'entry-1',
        planId: 'plan-1',
        date: '2026-08-01',
        position: 0,
        slot: 'dinner' as const,
        servings: 2,
        state: 'planned' as const,
        fullyCovered: true,
        recipe: {
          id: 'recipe-1',
          titleEn: 'Creamy tomato pasta',
          titleAr: 'معكرونة بصلصة طماطم كريمية',
          cuisine: null,
          prepMinutes: 10,
          cookMinutes: 20,
          servings: 2,
          difficulty: 'easy' as const,
        },
      },
    ],
  };
}

/** Records which keys and locale the plan asked for, and answers with a hit. */
function mediaStub(): MediaService & { asked: { keys: string[]; locale: Locale }[] } {
  const asked: { keys: string[]; locale: Locale }[] = [];

  return {
    asked,
    keyFor: (title: string, locale: Locale) => `${locale}:${title}`,
    lookupMany: async (keys: readonly string[], locale: Locale) => {
      asked.push({ keys: [...keys], locale });
      return new Map(
        keys.map((key) => [
          key,
          { dishKey: key, locale, status: 'matched' as const, heroThumbnailUrl: HERO, heroYoutubeId: 'abc12345678', videos: [] },
        ]),
      );
    },
  } as unknown as MediaService & { asked: { keys: string[]; locale: Locale }[] };
}

function serviceFor(locale: Locale, media: MediaService): PlanService {
  const db = {
    query: { mealPlans: { findFirst: async () => planRow(locale), findMany: async () => [planRow(locale)] } },
  } as unknown as Database;

  return new PlanService(db, undefined as never, undefined as never, undefined as never, media);
}

describe('meal plan media', () => {
  /**
   * The plan board is where a recipe is seen first, and its entries used to be
   * mapped with no media at all — every tile fell back to the placeholder even
   * once the dish had been resolved.
   */
  it('carries the resolved hero image onto every plan entry', async () => {
    const media = mediaStub();
    const plan = await serviceFor('en', media).get('hh-1', 'plan-1');

    expect(plan.entries[0]!.recipe.heroImageUrl).toBe(HERO);
  });

  it('carries it through the list route too', async () => {
    const media = mediaStub();
    const plans = await serviceFor('en', media).list('hh-1', {} as never);

    expect(plans[0]!.entries[0]!.recipe.heroImageUrl).toBe(HERO);
  });

  /**
   * Media is keyed by dish *and* locale, so an Arabic plan must look up the
   * Arabic title. Keying off the English one would miss every cached row and
   * silently degrade to placeholders in the language most of these recipes are
   * written in.
   */
  it('looks the dish up under the plan locale, not the default one', async () => {
    const media = mediaStub();
    await serviceFor('ar', media).get('hh-1', 'plan-1');

    expect(media.asked).toHaveLength(1);
    expect(media.asked[0]!.locale).toBe('ar');
    expect(media.asked[0]!.keys).toEqual(['ar:معكرونة بصلصة طماطم كريمية']);
  });

  /** One read for the whole board, not one per tile. */
  it('asks once for the whole board rather than per entry', async () => {
    const media = mediaStub();
    await serviceFor('en', media).get('hh-1', 'plan-1');

    expect(media.asked).toHaveLength(1);
  });
});
