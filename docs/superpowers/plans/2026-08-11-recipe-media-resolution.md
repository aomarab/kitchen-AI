# Recipe Media Resolution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a recipe's hero image and video both genuinely depict the dish, by deriving them from a single verified YouTube match, and render a designed placeholder when no match clears the bar.

**Architecture:** A pure `dishKey()` normalizer turns a recipe title into a stable cache key. A pure `scoreCandidate()` gate rejects music videos, Shorts, over-long videos and non-embeddable videos, then scores the rest on title-token coverage. A new `MediaService` resolves a dish once per `(dish_key, locale)` into two new cache tables and reuses that result for every household. The winning video's thumbnail becomes the hero image, so image and video can never disagree.

**Tech Stack:** NestJS + Drizzle (PostgreSQL 17) on the API, Next.js 15 on web, Expo on mobile, Vitest everywhere, MSW for client mocks.

**Spec:** `docs/superpowers/specs/2026-08-11-recipe-media-resolution-design.md`

## Global Constraints

- **Never edit `packages/contracts`.** This plan requires no contract change: `heroImageUrl` is already `string | null` and `RecipeVideo` is unchanged.
- API relative imports carry the `.js` extension (`./dish-key.js`) even though the compiler emits CommonJS.
- Schema changes: edit `apps/api/src/db/schema.ts`, then run `pnpm db:generate` and commit the generated SQL under `apps/api/drizzle/`. **Never hand-write a migration.**
- The server never sends user-facing prose. Throw `AppError` with a code and an i18n `messageKey`.
- Drizzle `numeric` comes back as a string and timestamps as `Date`; convert through `apps/api/src/common/serialization.ts`.
- i18n catalogues are **append-only per namespace**: web-only strings go in `web.en.ts`/`web.ar.ts` (nested under the single top-level `web` key), mobile-only strings in `mobile.en.ts`/`mobile.ar.ts` (under `mobile`). A string both apps share belongs in `en.ts`/`ar.ts`. Keys are **nested objects**, never flat dotted properties, and `index.ts` merges the catalogues with a shallow spread — so introducing a top-level key that already exists in a shared catalogue silently deletes the whole block. `ar.ts` is typed against `en.ts`, so a missing Arabic translation is a build error.
- **No physical-direction styles.** Use `ms/me`, `ps/pe`, `start/end`, `text-start` on web and `marginStart`/`insetInlineStart` on mobile. ESLint rejects `ml-*`, `pl-*`, `left-*`, `text-left`, `border-l-*` in web string literals and `marginLeft`/`left` style keys on mobile.
- **No hex literals outside the two token files** (`apps/web/src/app/globals.css`, `apps/mobile/src/theme/index.ts`). No opacity tints (`bg-primary/8`) where a solid `*-soft` token exists. `text-primary` is for fills and focus rings; aubergine text uses `text-primary-text`.
- The three palette guard tests (`apps/web/src/app/palette.test.ts`, `apps/web/src/lib/token-usage.test.ts`, `apps/mobile/src/theme/palette.spec.ts`) **must not be relaxed** to make a change pass.
- `turbo run build` must have produced `packages/*/dist` before typecheck, lint or test.
- Every commit ends with:
  ```
  Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
  Copilot-Session: 97ce073c-f6e6-4e2a-9571-faa5b1fb5739
  ```

## File Structure

| File | Responsibility |
| --- | --- |
| `apps/api/src/ai/recipes/dish-key.ts` (new) | Title → normalized cache key. Pure. |
| `apps/api/src/ai/recipes/relevance.ts` (new) | Candidate rejection + scoring. Pure. |
| `apps/api/src/ai/clients/clients.interface.ts` | `YoutubeVideo` gains the fields the gate needs. |
| `apps/api/src/ai/clients/http-youtube.client.ts` | `search.list` + `videos.list`, ISO durations, thumbnail ladder. |
| `apps/api/src/ai/clients/mock-youtube.client.ts` | Fixtures that exercise the gate. |
| `apps/api/src/db/schema.ts` | `dish_media` + `dish_videos`; drop `recipe_videos`. |
| `apps/api/src/ai/recipes/media.service.ts` (new) | Resolution, caching, outage semantics. |
| `apps/api/src/ai/recipes/recipes.service.ts` | Delegates to `MediaService`. |
| `apps/api/src/ai/recipes/recipe-mapper.ts` | Populates `heroImageUrl`. |
| `apps/web/src/components/ui/RecipeThumb.tsx` (new) | Image-or-placeholder, single entry point. |
| `apps/mobile/src/components/RecipeThumb.tsx` (new) | Same for mobile. |

---

### Task 1: Replace the meme fixtures

The mock catalogues pair plausible recipe titles with famous music-video ids, and thumbnails are derived from those ids — so "The Best Chicken Kabsa" renders Rick Astley's face. This is the defect the user actually sees, because `pnpm dev` forces mock mode. It is fixed first, independently of the pipeline work.

Every replacement id below was verified through YouTube's oEmbed endpoint (real, public, embeddable) and its thumbnail confirmed to return HTTP 200.

**Files:**
- Modify: `apps/web/src/mocks/catalog.ts` (video entries at lines ~118, ~162, ~203, ~243, ~287, ~327)
- Modify: `apps/mobile/src/mocks/data.ts:305`
- Modify: `apps/api/src/ai/clients/mock-youtube.client.ts:14`
- Create: `apps/web/src/mocks/fixtures.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing. Fixture-only change.

- [ ] **Step 1: Write the failing guard test**

Create `apps/web/src/mocks/fixtures.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Every one of these is a famous music or meme video that once sat in the mock
 * catalogue behind a cooking title. Thumbnails are derived from the video id,
 * so each of them rendered a celebrity's face as a meal photo.
 */
const BANNED_IDS = [
  'dQw4w9WgXcQ', // Rick Astley — Never Gonna Give You Up
  'oHg5SJYRHA0', // RickRoll'D
  'kJQP7kiw5Fk', // Luis Fonsi — Despacito
  'e-ORhEE9VVg', // Eduard Khil — Trololo
  'fLexgOxsZu0', // Darude — Sandstorm
  '9bZkp7q19f0', // PSY — Gangnam Style
  'M7lc1UVf-VE', // YouTube Developers Live
];

const FIXTURE_FILES = [
  'apps/web/src/mocks/catalog.ts',
  'apps/mobile/src/mocks/data.ts',
  'apps/api/src/ai/clients/mock-youtube.client.ts',
];

describe('mock fixtures', () => {
  it('never pairs a cooking title with a music video', () => {
    const repoRoot = join(__dirname, '../../../..');
    const offenders: string[] = [];

    for (const relative of FIXTURE_FILES) {
      const source = readFileSync(join(repoRoot, relative), 'utf8');
      for (const id of BANNED_IDS) {
        if (source.includes(id)) offenders.push(`${relative} → ${id}`);
      }
    }

    expect(offenders).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
pnpm --filter @kitchen/web exec vitest run src/mocks/fixtures.test.ts
```

Expected: FAIL, listing all six web ids plus the mobile and API ones.

- [ ] **Step 3: Replace the web catalogue ids**

In `apps/web/src/mocks/catalog.ts`, replace each video entry's `youtubeId` and `channel` with the verified pairing below. Leave `en`, `ar` and `durationSeconds` as they are — they are display copy, and the dish is unchanged.

| Dish | Old id | New id | New channel |
| --- | --- | --- | --- |
| Chicken Kabsa | `dQw4w9WgXcQ` | `Xtspw022mb4` | `The White Plate` |
| Shakshuka | `oHg5SJYRHA0` | `FUXpoUG_cXk` | `The Cooking Foodie` |
| Red Lentil Soup | `kJQP7kiw5Fk` | `xGEr3FPUJ84` | `Nico's Recipes` |
| Hummus | `e-ORhEE9VVg` | `GbxnB53IExY` | `Downshiftology` |
| Eggplant Moussaka | `fLexgOxsZu0` | `XXxJbivD3k0` | `The Mediterranean Dish` |
| Potato Frittata | `9bZkp7q19f0` | `UaRsVKsc7qA` | `SoDelicious` |

- [ ] **Step 4: Replace the mobile fixture id**

In `apps/mobile/src/mocks/data.ts:305`, change `youtubeId: 'dQw4w9WgXcQ'` to `youtubeId: 'Xtspw022mb4'` and its channel to `The White Plate`. That recipe is chicken-and-rice, which is the kabsa video.

Also replace the three `heroImageUrl` values (lines ~268, ~329, ~379), which point at `images.kitchenai.dev` — a domain that does not exist, so they have never loaded:

```ts
heroImageUrl: 'https://i.ytimg.com/vi/Xtspw022mb4/hqdefault.jpg', // chicken-rice
heroImageUrl: 'https://i.ytimg.com/vi/FUXpoUG_cXk/hqdefault.jpg', // shakshuka
heroImageUrl: 'https://i.ytimg.com/vi/Xq5R-BXXsfQ/hqdefault.jpg', // lemon-potatoes
```

`Xq5R-BXXsfQ` is "Easy Greek-Style Lemon Potatoes" by THE ART OF EATING, verified the same way.

- [ ] **Step 5: Replace the API mock client ids**

In `apps/api/src/ai/clients/mock-youtube.client.ts`, change the id list:

```ts
const ids = ['Xtspw022mb4', 'FUXpoUG_cXk', 'xGEr3FPUJ84'];
```

- [ ] **Step 6: Replace the web mock hero images**

`apps/web/src/mocks/db.ts:98-100` returns a random stock photo, which is the other half of the wrong-image complaint:

```ts
function heroFor(seed: RecipeSeed): string {
  return `https://picsum.photos/seed/kitchen-${seed.heroSeed}/1200/800`;
}
```

Replace it so the hero is the recipe's own first video thumbnail, which is what the real pipeline will do:

```ts
/**
 * The hero is the recipe's own top video thumbnail — the same rule the real
 * pipeline uses, so mock mode and production cannot drift. Recipes with no
 * video return null and exercise the placeholder.
 */
function heroFor(seed: RecipeSeed): string | null {
  const first = seed.videos[0];
  return first ? `https://i.ytimg.com/vi/${first.youtubeId}/hqdefault.jpg` : null;
}
```

- [ ] **Step 7: Drop the now-unused picsum allowance**

Remove the `picsum.photos` entry from `images.remotePatterns` in `apps/web/next.config.ts`. Nothing references it once Step 6 lands, and leaving it permits an arbitrary remote host.

- [ ] **Step 8: Run the guard and the full client suites**

```bash
pnpm --filter @kitchen/web exec vitest run src/mocks/fixtures.test.ts
pnpm --filter @kitchen/web exec vitest run
pnpm --filter @kitchen/mobile exec vitest run
```

Expected: all PASS. If `heroFor` returning `null` breaks a typed seed, widen the seed's `heroImageUrl` type to `string | null` — the contract already allows it.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/mocks apps/web/next.config.ts apps/mobile/src/mocks apps/api/src/ai/clients/mock-youtube.client.ts
git commit
```

Message: `Stop showing music videos as meals`, with a body explaining that the mock catalogue paired cooking titles with famous music-video ids and that thumbnails derive from the id, so the image and the video were both wrong; and that a guard test now fails if any of them return.

---

### Task 2: The dish key normalizer

**Files:**
- Create: `apps/api/src/ai/recipes/dish-key.ts`
- Test: `apps/api/src/ai/recipes/__tests__/dish-key.spec.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `dishKey(title: string): string`
  - `normalizeTokens(title: string): string[]`
  - `GENERIC_TOKENS: ReadonlySet<string>`

  `dishKey` deliberately takes no locale: the Arabic folding below is a no-op on Latin text, and locale is already a separate column in the cache key.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/ai/recipes/__tests__/dish-key.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { dishKey, normalizeTokens } from '../dish-key.js';

describe('dishKey', () => {
  it('lowercases and joins content tokens', () => {
    expect(dishKey('Chicken Kabsa')).toBe('chicken-kabsa');
  });

  it('is insensitive to word order, so one dish is one key', () => {
    expect(dishKey('Kabsa Chicken')).toBe(dishKey('Chicken Kabsa'));
  });

  it('drops generic recipe words', () => {
    expect(dishKey('The Best Chicken Kabsa Recipe')).toBe('chicken-kabsa');
  });

  it('drops punctuation', () => {
    expect(dishKey('Chicken Kabsa!! (authentic)')).toBe('chicken-kabsa');
  });

  it('strips Arabic tashkeel and tatweel', () => {
    expect(dishKey('كَبْسَة دَجَاج')).toBe(dishKey('كبسة دجاج'));
  });

  it('folds ta marbuta so كبسة and كبسه agree', () => {
    expect(dishKey('كبسة دجاج')).toBe(dishKey('كبسه دجاج'));
  });

  it('folds alef variants', () => {
    expect(dishKey('أرز بالخلطة')).toBe(dishKey('ارز بالخلطة'));
  });

  it('drops generic Arabic recipe words', () => {
    expect(dishKey('طريقة عمل كبسة دجاج')).toBe(dishKey('كبسة دجاج'));
  });

  it('gives different keys to the two locales, which is why locale is a separate column', () => {
    expect(dishKey('Chicken Kabsa')).not.toBe(dishKey('كبسة دجاج'));
  });

  it('returns an empty string when a title is entirely generic', () => {
    expect(dishKey('easy quick recipe')).toBe('');
  });
});

describe('normalizeTokens', () => {
  it('returns content tokens without generic words', () => {
    expect(normalizeTokens('The Best Chicken Kabsa Recipe').sort()).toEqual(['chicken', 'kabsa']);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
pnpm --filter @kitchen/api exec vitest run src/ai/recipes/__tests__/dish-key.spec.ts
```

Expected: FAIL — cannot resolve `../dish-key.js`.

- [ ] **Step 3: Implement**

Create `apps/api/src/ai/recipes/dish-key.ts`:

```ts
/**
 * A recipe title reduced to a stable identity for the media cache.
 *
 * Recipes are household-scoped, so the same dish exists as a separate row for
 * every household. Keying media by recipe id therefore costs a fresh 100-unit
 * YouTube search per household for a dish that has already been resolved.
 * Keying by the normalized title collapses those into one.
 *
 * The key is derived on every read rather than stored: it is pure and cheap,
 * and a stored key silently mismatches after any change to this file, where a
 * derived one simply re-resolves everything consistently.
 */

/**
 * Words that carry no dish identity. Dropping them means "The Best Chicken
 * Kabsa Recipe" and "Chicken Kabsa" are one dish, and — because the scorer
 * reuses this set — that a video sharing only the word "recipe" with a dish
 * cannot score against it.
 */
export const GENERIC_TOKENS: ReadonlySet<string> = new Set([
  'a', 'an', 'the', 'and', 'with', 'to', 'for', 'in', 'of',
  'recipe', 'recipes', 'easy', 'quick', 'best', 'homemade', 'how', 'make',
  'style', 'authentic', 'traditional', 'perfect', 'simple', 'classic',
  'ال', 'مع', 'في', 'من', 'على',
  'وصفة', 'وصفات', 'طريقة', 'عمل', 'سهلة', 'سهل', 'سريعة', 'سريع',
  'الذ', 'افضل', 'بالبيت', 'منزلي', 'اصلية', 'تحضير',
]);

/**
 * Combining marks stripped before comparison:
 * - U+0300–U+036F  Latin combining accents, exposed by NFD
 * - U+064B–U+0652  Arabic tashkeel (fatha, damma, sukun, shadda …)
 * - U+0653–U+0655  maddah and hamza marks, which NFD splits off أ إ آ
 * - U+0640         tatweel, a purely decorative letter-stretching character
 */
const COMBINING = /[\u0300-\u036F\u064B-\u0652\u0653-\u0655\u0640]/g;

const NON_WORD = /[^\p{L}\p{N}\s]/gu;

/**
 * Title → content tokens, folded so that spelling variants of the same dish
 * collapse together. Arabic is written with optional diacritics and with
 * interchangeable letter forms, so an unfolded comparison treats كَبْسَة and
 * كبسه as different dishes.
 */
export function normalizeTokens(title: string): string[] {
  const folded = title
    .normalize('NFD')
    .replace(COMBINING, '')
    .toLowerCase()
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(NON_WORD, ' ');

  return folded
    .split(/\s+/)
    .filter((token) => token.length > 0 && !GENERIC_TOKENS.has(token));
}

/**
 * Tokens are sorted before joining so "Kabsa Chicken" and "Chicken Kabsa" are
 * one key — the point of the whole exercise is that one dish resolves once.
 */
export function dishKey(title: string): string {
  return normalizeTokens(title).sort().join('-');
}
```

- [ ] **Step 4: Run the test**

```bash
pnpm --filter @kitchen/api exec vitest run src/ai/recipes/__tests__/dish-key.spec.ts
```

Expected: PASS. If the alef test fails, check that `NFD` runs **before** `COMBINING` — أ decomposes to ا + U+0654 only after normalization.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/ai/recipes/dish-key.ts apps/api/src/ai/recipes/__tests__/dish-key.spec.ts
git commit
```

Message: `Reduce a recipe title to a dish identity`.

---

### Task 3: The relevance gate

**Files:**
- Create: `apps/api/src/ai/recipes/relevance.ts`
- Test: `apps/api/src/ai/recipes/__tests__/relevance.spec.ts`

**Interfaces:**
- Consumes: `normalizeTokens` from `./dish-key.js`.
- Produces:
  - `interface Candidate { youtubeId: string; title: string; durationSeconds: number; embeddable: boolean; categoryId: string | null; defaultAudioLanguage: string | null }`
  - `scoreCandidate(dishTitle: string, candidate: Candidate, locale: Locale): number | null`
  - `pickRanked<T extends Candidate>(dishTitle: string, candidates: T[], locale: Locale): T[]`
  - Constants `MIN_DURATION_SECONDS`, `MAX_DURATION_SECONDS`, `MUSIC_CATEGORY_ID`, `HOWTO_CATEGORY_ID`, `MIN_COVERAGE`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/ai/recipes/__tests__/relevance.spec.ts`:

```ts
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
```

- [ ] **Step 2: Run it and watch it fail**

```bash
pnpm --filter @kitchen/api exec vitest run src/ai/recipes/__tests__/relevance.spec.ts
```

Expected: FAIL — cannot resolve `../relevance.js`.

- [ ] **Step 3: Implement**

Create `apps/api/src/ai/recipes/relevance.ts`:

```ts
import type { Locale } from '@kitchen/contracts';
import { normalizeTokens } from './dish-key.js';

/**
 * Whether a YouTube result is actually the dish.
 *
 * The previous pipeline accepted the first search hit unconditionally, which is
 * how a music video became a meal's photo: the hero image is derived from the
 * video id, so one bad match corrupts both.
 */

export interface Candidate {
  youtubeId: string;
  title: string;
  durationSeconds: number;
  embeddable: boolean;
  categoryId: string | null;
  defaultAudioLanguage: string | null;
}

/** Below this is a Short — the single largest source of irrelevant results. */
export const MIN_DURATION_SECONDS = 60;
/** Above this is a compilation, a livestream or a full cooking show. */
export const MAX_DURATION_SECONDS = 2700;
/** Rejecting this one category would have caught every bad fixture we shipped. */
export const MUSIC_CATEGORY_ID = '10';
/** Howto & Style, where genuine recipe videos live. */
export const HOWTO_CATEGORY_ID = '26';
/** Half the dish's distinctive words must appear, or it is a different dish. */
export const MIN_COVERAGE = 0.5;

const HOWTO_BONUS = 0.15;
const LANGUAGE_BONUS = 0.1;

/**
 * Returns null for a reject, otherwise a score in 0..1.25. Higher wins.
 *
 * Coverage is measured over content tokens only — `normalizeTokens` has already
 * dropped generic words — so a shared "recipe" or "easy" contributes nothing and
 * a match is always on the dish's own distinctive words.
 */
export function scoreCandidate(
  dishTitle: string,
  candidate: Candidate,
  locale: Locale,
): number | null {
  if (candidate.categoryId === MUSIC_CATEGORY_ID) return null;
  if (!candidate.embeddable) return null;
  if (candidate.durationSeconds < MIN_DURATION_SECONDS) return null;
  if (candidate.durationSeconds > MAX_DURATION_SECONDS) return null;

  const dishTokens = normalizeTokens(dishTitle);
  if (dishTokens.length === 0) return null;

  const videoTokens = new Set(normalizeTokens(candidate.title));
  const matched = dishTokens.filter((token) => videoTokens.has(token));

  // MIN_COVERAGE is above zero, so clearing it already guarantees at least one
  // distinctive token matched; no separate check is needed.
  const coverage = matched.length / dishTokens.length;
  if (coverage < MIN_COVERAGE) return null;

  let score = coverage;
  if (candidate.categoryId === HOWTO_CATEGORY_ID) score += HOWTO_BONUS;
  if (candidate.defaultAudioLanguage?.toLowerCase().startsWith(locale)) score += LANGUAGE_BONUS;
  return score;
}

/**
 * Survivors, best first. Ties keep the order YouTube returned, which is its own
 * relevance ranking and a better tiebreak than anything we can compute here.
 */
export function pickRanked<T extends Candidate>(
  dishTitle: string,
  candidates: T[],
  locale: Locale,
): T[] {
  return candidates
    .map((candidate, index) => ({ candidate, index, score: scoreCandidate(dishTitle, candidate, locale) }))
    .filter((entry): entry is { candidate: T; index: number; score: number } => entry.score !== null)
    .sort((a, b) => (b.score - a.score) || (a.index - b.index))
    .map((entry) => entry.candidate);
}
```

- [ ] **Step 4: Run the test**

```bash
pnpm --filter @kitchen/api exec vitest run src/ai/recipes/__tests__/relevance.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Teeth-check the gate**

Temporarily change `if (candidate.categoryId === MUSIC_CATEGORY_ID) return null;` to `return 1;` and re-run. The music-video test **must** fail. Revert.

This guard is the whole point of the task; confirm it bites before trusting it.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/ai/recipes/relevance.ts apps/api/src/ai/recipes/__tests__/relevance.spec.ts
git commit
```

Message: `Judge whether a video is actually the dish`.

---

### Task 4: Teach the YouTube client to report what the gate needs

`search.list` returns neither duration, nor embeddability, nor category — which is exactly why none of them can be filtered on today. A second `videos.list` call supplies all three for **1 quota unit**, against the 100 the search already cost.

**Files:**
- Modify: `apps/api/src/ai/clients/clients.interface.ts`
- Modify: `apps/api/src/ai/clients/http-youtube.client.ts`
- Modify: `apps/api/src/ai/clients/mock-youtube.client.ts`
- Test: `apps/api/src/ai/__tests__/youtube-client.spec.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `YoutubeVideo` with `durationSeconds: number` (no longer nullable), `categoryId: string | null`, `defaultAudioLanguage: string | null`, `embeddable: boolean`. Also exports `parseIsoDuration(iso: string): number` and `pickThumbnail(thumbnails): string` from `http-youtube.client.ts`.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/ai/__tests__/youtube-client.spec.ts`:

```ts
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
```

Note that `recipe-videos.spec.ts` will now fail to typecheck because its inline fakes omit the new fields — expected, and repaired in Task 6, which deletes it.

- [ ] **Step 2: Run it and watch it fail**

```bash
pnpm --filter @kitchen/api exec vitest run src/ai/__tests__/youtube-client.spec.ts
```

Expected: FAIL — `parseIsoDuration` and `pickThumbnail` are not exported.

- [ ] **Step 3: Widen the interface**

In `apps/api/src/ai/clients/clients.interface.ts`, replace the `YoutubeVideo` interface:

```ts
export interface YoutubeVideo {
  youtubeId: string;
  title: string;
  channel: string;
  thumbnailUrl: string;
  /** Always known: sourced from `videos.list`, which the client always calls. */
  durationSeconds: number;
  /** YouTube category id. '10' is Music and is always wrong for a recipe. */
  categoryId: string | null;
  defaultAudioLanguage: string | null;
  embeddable: boolean;
}
```

- [ ] **Step 4: Implement the client**

Rewrite `apps/api/src/ai/clients/http-youtube.client.ts`:

```ts
import type { Locale } from '@kitchen/contracts';
import {
  YOUTUBE_QUERY_SUFFIX,
  YoutubeUnavailableError,
  type YoutubeClient,
  type YoutubeVideo,
} from './clients.interface.js';

interface Thumbnails {
  maxres?: { url?: string };
  standard?: { url?: string };
  high?: { url?: string };
  medium?: { url?: string };
  default?: { url?: string };
}

interface SearchListResponse {
  items?: { id?: { videoId?: string } }[];
  error?: { errors?: { reason?: string }[] };
}

interface VideoListResponse {
  items?: {
    id?: string;
    snippet?: {
      title?: string;
      channelTitle?: string;
      categoryId?: string;
      defaultAudioLanguage?: string;
      thumbnails?: Thumbnails;
    };
    contentDetails?: { duration?: string };
    status?: { embeddable?: boolean };
  }[];
}

const ISO_DURATION = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/;

/** ISO-8601 durations (`PT12M22S`) → seconds. Unparseable input yields 0, which
 *  the relevance gate rejects as a Short rather than letting NaN through. */
export function parseIsoDuration(iso: string): number {
  const match = ISO_DURATION.exec(iso);
  if (!match) return 0;
  const [, days, hours, minutes, seconds] = match;
  return (
    Number(days ?? 0) * 86_400 +
    Number(hours ?? 0) * 3_600 +
    Number(minutes ?? 0) * 60 +
    Number(seconds ?? 0)
  );
}

/**
 * Highest-resolution thumbnail available. `maxres` and `standard` are 16:9;
 * `high` is 4:3 and shows pillarbox bars in a widescreen hero, so it is a last
 * resort rather than the default it used to be.
 */
export function pickThumbnail(thumbnails: Thumbnails | undefined): string {
  return (
    thumbnails?.maxres?.url ??
    thumbnails?.standard?.url ??
    thumbnails?.high?.url ??
    thumbnails?.medium?.url ??
    thumbnails?.default?.url ??
    ''
  );
}

/**
 * Real YouTube Data API v3.
 *
 * `search.list` costs 100 quota units and returns neither duration, nor
 * embeddability, nor category — the three things needed to tell a recipe from a
 * music video. `videos.list` supplies all of them for 1 more unit, so the pair
 * costs 101 against a 10,000 daily allowance.
 */
export class HttpYoutubeClient implements YoutubeClient {
  constructor(
    private readonly apiKey: string,
    private readonly baseUrl = 'https://www.googleapis.com/youtube/v3',
  ) {}

  async search(query: string, locale: Locale, max = 10): Promise<YoutubeVideo[]> {
    const ids = await this.searchIds(query, locale, max);
    if (ids.length === 0) return [];
    return this.hydrate(ids);
  }

  private async searchIds(query: string, locale: Locale, max: number): Promise<string[]> {
    const url = new URL(`${this.baseUrl}/search`);
    url.searchParams.set('part', 'snippet');
    url.searchParams.set('type', 'video');
    url.searchParams.set('videoEmbeddable', 'true');
    url.searchParams.set('maxResults', String(max));
    url.searchParams.set('q', `${query} ${YOUTUBE_QUERY_SUFFIX[locale]}`.trim());
    url.searchParams.set('relevanceLanguage', locale);
    url.searchParams.set('safeSearch', 'strict');
    url.searchParams.set('key', this.apiKey);

    const body = await this.get<SearchListResponse>(url);
    return (body.items ?? []).map((item) => item.id?.videoId).filter((id): id is string => Boolean(id));
  }

  private async hydrate(ids: string[]): Promise<YoutubeVideo[]> {
    const url = new URL(`${this.baseUrl}/videos`);
    url.searchParams.set('part', 'snippet,contentDetails,status');
    url.searchParams.set('id', ids.join(','));
    url.searchParams.set('key', this.apiKey);

    const body = await this.get<VideoListResponse>(url);
    const byId = new Map(
      (body.items ?? []).filter((item) => item.id).map((item) => [item.id!, item] as const),
    );

    // Preserve the search ordering: it is YouTube's own relevance ranking, and
    // the gate uses it to break ties.
    return ids.flatMap((id) => {
      const item = byId.get(id);
      if (!item) return [];
      const thumbnailUrl = pickThumbnail(item.snippet?.thumbnails);
      if (!thumbnailUrl) return [];
      return [
        {
          youtubeId: id,
          title: item.snippet?.title ?? '',
          channel: item.snippet?.channelTitle ?? 'YouTube',
          thumbnailUrl,
          durationSeconds: parseIsoDuration(item.contentDetails?.duration ?? ''),
          categoryId: item.snippet?.categoryId ?? null,
          defaultAudioLanguage: item.snippet?.defaultAudioLanguage ?? null,
          embeddable: item.status?.embeddable ?? false,
        },
      ];
    });
  }

  private async get<T>(url: URL): Promise<T> {
    let response: Response;
    try {
      response = await fetch(url);
    } catch {
      throw new YoutubeUnavailableError('error');
    }

    if (response.status === 403) {
      const body = (await response.json().catch(() => ({}))) as SearchListResponse;
      const quota = body.error?.errors?.some((e) => e.reason?.includes('quota'));
      throw new YoutubeUnavailableError(quota ? 'quota' : 'error');
    }
    if (!response.ok) throw new YoutubeUnavailableError('error');

    return (await response.json()) as T;
  }
}
```

- [ ] **Step 5: Update the mock client**

Rewrite `apps/api/src/ai/clients/mock-youtube.client.ts` so mock mode exercises the gate instead of bypassing it:

```ts
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
```

- [ ] **Step 6: Run the tests**

```bash
pnpm --filter @kitchen/api exec vitest run src/ai/__tests__/youtube-client.spec.ts
```

Expected: PASS. `recipe-videos.spec.ts` will now fail to typecheck because its inline fakes omit the new fields — that is expected and is repaired in Task 6, which deletes it.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/ai/clients apps/api/src/ai/__tests__/youtube-client.spec.ts
git commit
```

Message: `Ask YouTube for the facts the gate needs`.

---

### Task 5: Cache media by dish, not by recipe row

**Files:**
- Modify: `apps/api/src/db/schema.ts`
- Create: `apps/api/drizzle/<generated>.sql` (via `pnpm db:generate`)

**Interfaces:**
- Consumes: nothing.
- Produces: Drizzle tables `dishMedia` and `dishVideos`; removes `recipeVideos`.

- [ ] **Step 1: Add the enum and tables**

In `apps/api/src/db/schema.ts`, add beside the other enums:

```ts
export const dishMediaStatusEnum = pgEnum('dish_media_status', ['matched', 'none']);
```

Replace the whole `recipeVideos` table definition with:

```ts
/**
 * Resolved media for one dish in one language.
 *
 * Keyed by dish rather than recipe: recipes are household-scoped, so the same
 * dish is a distinct row per household and a recipe-keyed cache spent a fresh
 * 100-unit YouTube search on every one of them. Keyed by dish, the first
 * household to open a recipe resolves it for everybody.
 *
 * `status = 'none'` IS the negative cache — a dish YouTube has nothing for must
 * be remembered, or every request re-runs the search. It replaces the separate
 * Redis empty-answer key, and unlike that key it survives a cache flush.
 */
export const dishMedia = pgTable(
  'dish_media',
  {
    dishKey: text('dish_key').notNull(),
    locale: localeEnum('locale').notNull(),
    status: dishMediaStatusEnum('status').notNull(),
    heroYoutubeId: text('hero_youtube_id'),
    heroThumbnailUrl: text('hero_thumbnail_url'),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.dishKey, table.locale] })],
);

/** The ranked video list for a dish. `rank` 0 is the match the hero came from. */
export const dishVideos = pgTable(
  'dish_videos',
  {
    dishKey: text('dish_key').notNull(),
    locale: localeEnum('locale').notNull(),
    youtubeId: text('youtube_id').notNull(),
    title: text('title').notNull(),
    channel: text('channel').notNull(),
    thumbnailUrl: text('thumbnail_url').notNull(),
    durationSeconds: integer('duration_seconds').notNull(),
    rank: integer('rank').notNull(),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.dishKey, table.locale, table.youtubeId] })],
);
```

Ensure `pgEnum` and `primaryKey` are imported from `drizzle-orm/pg-core` at the top of the file.

- [ ] **Step 2: Generate the migration**

```bash
pnpm db:generate
```

Expected: a new file under `apps/api/drizzle/` creating both tables and the enum, and dropping `recipe_videos`. **Read the generated SQL** and confirm it drops `recipe_videos` — it is a pure cache with no user data, so the drop is intended.

- [ ] **Step 3: Apply it**

```bash
pnpm infra:up && pnpm db:migrate
```

Expected: migration applies cleanly.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/db/schema.ts apps/api/drizzle
git commit
```

Message: `Key recipe media by dish instead of by household`.

---

### Task 6: Resolve a dish's media once

**Files:**
- Create: `apps/api/src/ai/recipes/media.service.ts`
- Test: `apps/api/src/ai/__tests__/dish-media.spec.ts`
- Delete: `apps/api/src/ai/__tests__/recipe-videos.spec.ts` (superseded; its behaviours are re-asserted below)
- Modify: `apps/api/src/ai/ai.module.ts` (register `MediaService` as a provider)

**Interfaces:**
- Consumes: `dishKey` (Task 2), `pickRanked` (Task 3), `YoutubeClient`/`YoutubeVideo` (Task 4), `dishMedia`/`dishVideos` (Task 5).
- Produces:
  ```ts
  export interface DishMedia {
    status: 'matched' | 'none';
    heroThumbnailUrl: string | null;
    videos: RecipeVideo[];
  }
  export class MediaService {
    resolve(title: string, locale: Locale): Promise<DishMedia>;
    resolveMany(titles: { title: string; locale: Locale }[]): Promise<Map<string, DishMedia>>;
  }
  ```
  `resolveMany` keys its result map by `dishKey(title)` and **never triggers a search** — it reads stored rows only, so rendering a list cannot spend quota.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/ai/__tests__/dish-media.spec.ts`. This is an **integration** spec against live Postgres — faking Drizzle's builder chain is brittle, and the behaviour under test (what gets persisted, and what deliberately does not) is exactly what a fake would paper over. Run `pnpm infra:up && pnpm db:migrate` first.

```ts
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { createTestContext } from '../../testing/harness.js';
import { dishMedia, dishVideos } from '../../db/schema.js';
import { VIDEO_CACHE_TTL_DAYS } from '../ai.constants.js';
import { MediaService } from '../recipes/media.service.js';
import { YoutubeUnavailableError, type YoutubeClient, type YoutubeVideo } from '../clients/clients.interface.js';

const ctx = createTestContext();
afterAll(async () => { await ctx.client.end(); });

/** dishKey('Chicken Kabsa') — asserted directly so a normalizer change is loud. */
const KEY = 'chicken-kabsa';

beforeEach(async () => {
  await ctx.db.delete(dishVideos).where(eq(dishVideos.dishKey, KEY));
  await ctx.db.delete(dishMedia).where(eq(dishMedia.dishKey, KEY));
});

function video(over: Partial<YoutubeVideo> = {}): YoutubeVideo {
  return {
    youtubeId: 'Xtspw022mb4',
    title: 'Saudi Chicken Kabsa Recipe',
    channel: 'The White Plate',
    thumbnailUrl: 'https://i.ytimg.com/vi/Xtspw022mb4/maxresdefault.jpg',
    durationSeconds: 742,
    categoryId: '26',
    defaultAudioLanguage: 'en',
    embeddable: true,
    ...over,
  };
}

function build(search: YoutubeClient['search']) {
  return new MediaService(ctx.db, { search });
}

async function storedMedia() {
  const [row] = await ctx.db
    .select()
    .from(dishMedia)
    .where(and(eq(dishMedia.dishKey, KEY), eq(dishMedia.locale, 'en')));
  return row ?? null;
}

describe('MediaService', () => {
  it('resolves a dish once and serves every later household from cache', async () => {
    const search = vi.fn(async () => [video()]);
    const service = build(search);

    await service.resolve('Chicken Kabsa', 'en');
    // A different household, a differently-worded title, the same dish.
    await service.resolve('The Best Chicken Kabsa Recipe', 'en');

    expect(search).toHaveBeenCalledTimes(1);
  });

  it('uses the winning video thumbnail as the hero', async () => {
    const media = await build(async () => [video()]).resolve('Chicken Kabsa', 'en');

    expect(media.status).toBe('matched');
    expect(media.heroThumbnailUrl).toBe('https://i.ytimg.com/vi/Xtspw022mb4/maxresdefault.jpg');
    expect(media.videos[0]?.youtubeId).toBe('Xtspw022mb4');
  });

  it('records a rejected dish as none and does not search it again', async () => {
    const search = vi.fn(async () => [video({ categoryId: '10', title: 'Gangnam Style' })]);
    const service = build(search);

    const first = await service.resolve('Chicken Kabsa', 'en');
    await service.resolve('Chicken Kabsa', 'en');

    expect(first.status).toBe('none');
    expect(first.heroThumbnailUrl).toBeNull();
    expect(await storedMedia()).toMatchObject({ status: 'none' });
    expect(search).toHaveBeenCalledTimes(1);
  });

  it('does NOT persist none when YouTube is merely unavailable', async () => {
    const search = vi.fn(async (): Promise<YoutubeVideo[]> => {
      throw new YoutubeUnavailableError('quota');
    });
    const service = build(search);

    const first = await service.resolve('Chicken Kabsa', 'en');
    await service.resolve('Chicken Kabsa', 'en');

    // An outage is not an answer. Persisting it would blank the dish for 30 days.
    expect(first.status).toBe('none');
    expect(await storedMedia()).toBeNull();
    expect(search).toHaveBeenCalledTimes(2);
  });

  it('serves stale media through an outage rather than dead-ending', async () => {
    await build(async () => [video()]).resolve('Chicken Kabsa', 'en');

    const degraded = await build(async () => {
      throw new YoutubeUnavailableError('quota');
    }).resolve('Chicken Kabsa', 'en');

    expect(degraded.videos[0]?.youtubeId).toBe('Xtspw022mb4');
  });

  it('renews the timestamp on re-resolve, so the window can reopen', async () => {
    await build(async () => [video()]).resolve('Chicken Kabsa', 'en');

    // Age the row past the TTL, as real time would.
    const stale = new Date(Date.now() - (VIDEO_CACHE_TTL_DAYS + 1) * 86_400_000);
    await ctx.db
      .update(dishMedia)
      .set({ resolvedAt: stale })
      .where(and(eq(dishMedia.dishKey, KEY), eq(dishMedia.locale, 'en')));

    const search = vi.fn(async () => [video({ youtubeId: 'FUXpoUG_cXk' })]);
    await build(search).resolve('Chicken Kabsa', 'en');

    // Re-searched because it was stale, and the new timestamp must stick —
    // an upsert that skips on conflict freezes `resolvedAt` at the first
    // write, so the row can never go fresh again and every read re-searches.
    expect(search).toHaveBeenCalledTimes(1);
    const row = await storedMedia();
    expect(row!.resolvedAt.getTime()).toBeGreaterThan(stale.getTime());
    expect(row!.heroYoutubeId).toBe('FUXpoUG_cXk');
  });

  it('replaces the ranked list rather than merging it', async () => {
    await build(async () => [video(), video({ youtubeId: 'oldRunnerUp' })]).resolve('Chicken Kabsa', 'en');
    await ctx.db
      .update(dishMedia)
      .set({ resolvedAt: new Date(0) })
      .where(and(eq(dishMedia.dishKey, KEY), eq(dishMedia.locale, 'en')));

    const media = await build(async () => [video()]).resolve('Chicken Kabsa', 'en');

    // A video that no longer ranks must disappear, or a demoted match outlives
    // the search that demoted it.
    expect(media.videos.map((v) => v.youtubeId)).toEqual(['Xtspw022mb4']);
  });

  it('rethrows a programming error instead of hiding it as no media', async () => {
    const service = build(async () => {
      throw new TypeError('bug');
    });
    await expect(service.resolve('Chicken Kabsa', 'en')).rejects.toBeInstanceOf(TypeError);
  });

  it('returns none for a title that reduces to nothing, without touching YouTube', async () => {
    const search = vi.fn(async () => [video()]);
    const media = await build(search).resolve('easy quick recipe', 'en');

    expect(media.status).toBe('none');
    expect(search).not.toHaveBeenCalled();
  });

  it('resolveMany never triggers a search, so a list cannot spend quota', async () => {
    const search = vi.fn(async () => [video()]);
    const service = build(search);

    const map = await service.resolveMany([
      { title: 'Chicken Kabsa', locale: 'en' },
      { title: 'Shakshuka', locale: 'en' },
    ]);

    expect(search).not.toHaveBeenCalled();
    expect(map.get(KEY)?.status).toBe('none');
  });

  it('resolveMany returns media a previous resolve stored', async () => {
    await build(async () => [video()]).resolve('Chicken Kabsa', 'en');

    const map = await build(async () => []).resolveMany([{ title: 'Chicken Kabsa', locale: 'en' }]);

    expect(map.get(KEY)?.heroThumbnailUrl).toContain('Xtspw022mb4');
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
pnpm --filter @kitchen/api exec vitest run src/ai/__tests__/dish-media.spec.ts
```

Expected: FAIL — cannot resolve `../recipes/media.service.js`.

If it instead fails to connect, the database is not up: run `pnpm infra:up && pnpm db:migrate` and re-run.

- [ ] **Step 3: Implement `MediaService`**

Create `apps/api/src/ai/recipes/media.service.ts`:

```ts
import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { Locale, RecipeVideo } from '@kitchen/contracts';
import { DB, type Database } from '../../db/index.js';
import { dishMedia, dishVideos } from '../../db/schema.js';
import { VIDEO_CACHE_TTL_DAYS, YOUTUBE_CLIENT } from '../ai.constants.js';
import {
  YoutubeUnavailableError,
  type YoutubeClient,
  type YoutubeVideo,
} from '../clients/clients.interface.js';
import { dishKey } from './dish-key.js';
import { pickRanked } from './relevance.js';

export interface DishMedia {
  status: 'matched' | 'none';
  heroThumbnailUrl: string | null;
  videos: RecipeVideo[];
}

const NO_MEDIA: DishMedia = { status: 'none', heroThumbnailUrl: null, videos: [] };

/**
 * Resolves a dish to a hero image and a ranked video list, once, for everyone.
 *
 * Media is keyed by dish rather than by recipe because recipes are
 * household-scoped: the same dish exists once per household, and a
 * recipe-keyed cache therefore spent a fresh 100-unit YouTube search on each
 * one. Here the first household to open a recipe resolves it for all of them.
 */
@Injectable()
export class MediaService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(YOUTUBE_CLIENT) private readonly youtube: YoutubeClient,
  ) {}

  async resolve(title: string, locale: Locale): Promise<DishMedia> {
    const key = dishKey(title);
    // A title of nothing but generic words has no identity to cache or search.
    if (key.length === 0) return NO_MEDIA;

    const stored = await this.readMedia(key, locale);
    if (stored && this.isFresh(stored.resolvedAt)) return this.project(key, locale, stored);

    try {
      const ranked = pickRanked(title, await this.youtube.search(title, locale), locale);
      return ranked.length === 0
        ? await this.persistNone(key, locale)
        : await this.persistMatch(key, locale, ranked);
    } catch (err) {
      // Anything that is not an upstream outage is a bug: let it surface.
      if (!(err instanceof YoutubeUnavailableError)) throw err;

      // An outage is not an answer. Serve whatever is stored, however stale,
      // and write nothing — recording `none` here would blank the dish for the
      // full 30-day TTL because YouTube was briefly unreachable.
      return stored ? this.project(key, locale, stored) : NO_MEDIA;
    }
  }

  /**
   * Media for many dishes at once, read-only. A list render must never be able
   * to trigger a search: one screen of twenty recipes would otherwise cost
   * 2,000 quota units against a daily allowance of 10,000.
   */
  async resolveMany(
    requests: { title: string; locale: Locale }[],
  ): Promise<Map<string, DishMedia>> {
    const keys = [...new Set(requests.map((r) => dishKey(r.title)).filter((k) => k.length > 0))];
    const result = new Map<string, DishMedia>();
    if (keys.length === 0) return result;

    const [mediaRows, videoRows] = await Promise.all([
      this.db.select().from(dishMedia).where(inArray(dishMedia.dishKey, keys)),
      this.db.select().from(dishVideos).where(inArray(dishVideos.dishKey, keys)).orderBy(asc(dishVideos.rank)),
    ]);

    for (const row of mediaRows) {
      const videos = videoRows
        .filter((v) => v.dishKey === row.dishKey && v.locale === row.locale)
        .map(toRecipeVideo);
      result.set(row.dishKey, {
        status: row.status,
        heroThumbnailUrl: row.heroThumbnailUrl,
        videos,
      });
    }

    for (const key of keys) if (!result.has(key)) result.set(key, NO_MEDIA);
    return result;
  }

  private isFresh(resolvedAt: Date): boolean {
    return Date.now() - resolvedAt.getTime() < VIDEO_CACHE_TTL_DAYS * 86_400_000;
  }

  private async readMedia(key: string, locale: Locale) {
    const [row] = await this.db
      .select()
      .from(dishMedia)
      .where(and(eq(dishMedia.dishKey, key), eq(dishMedia.locale, locale)));
    return row ?? null;
  }

  private async project(
    key: string,
    locale: Locale,
    row: { status: 'matched' | 'none'; heroThumbnailUrl: string | null },
  ): Promise<DishMedia> {
    if (row.status === 'none') return NO_MEDIA;
    const rows = await this.db
      .select()
      .from(dishVideos)
      .where(and(eq(dishVideos.dishKey, key), eq(dishVideos.locale, locale)))
      .orderBy(asc(dishVideos.rank));
    return { status: 'matched', heroThumbnailUrl: row.heroThumbnailUrl, videos: rows.map(toRecipeVideo) };
  }

  private async persistNone(key: string, locale: Locale): Promise<DishMedia> {
    const now = new Date();
    await this.db
      .insert(dishMedia)
      .values({ dishKey: key, locale, status: 'none', resolvedAt: now })
      // Renew `resolvedAt`, never skip: doing nothing on conflict freezes the
      // timestamp at the first write, so the freshness window can never reopen.
      .onConflictDoUpdate({
        target: [dishMedia.dishKey, dishMedia.locale],
        set: { status: 'none', heroYoutubeId: null, heroThumbnailUrl: null, resolvedAt: now },
      });
    return NO_MEDIA;
  }

  private async persistMatch(
    key: string,
    locale: Locale,
    ranked: YoutubeVideo[],
  ): Promise<DishMedia> {
    const winner = ranked[0]!;
    const now = new Date();

    await this.db.transaction(async (tx) => {
      await tx
        .insert(dishMedia)
        .values({
          dishKey: key,
          locale,
          status: 'matched',
          heroYoutubeId: winner.youtubeId,
          heroThumbnailUrl: winner.thumbnailUrl,
          resolvedAt: now,
        })
        .onConflictDoUpdate({
          target: [dishMedia.dishKey, dishMedia.locale],
          set: {
            status: 'matched',
            heroYoutubeId: winner.youtubeId,
            heroThumbnailUrl: winner.thumbnailUrl,
            resolvedAt: now,
          },
        });

      // Replace rather than merge: a video that no longer ranks must disappear,
      // or a stale winner outlives the search that demoted it.
      await tx.delete(dishVideos).where(and(eq(dishVideos.dishKey, key), eq(dishVideos.locale, locale)));
      await tx.insert(dishVideos).values(
        ranked.map((video, rank) => ({
          dishKey: key,
          locale,
          youtubeId: video.youtubeId,
          title: video.title,
          channel: video.channel,
          thumbnailUrl: video.thumbnailUrl,
          durationSeconds: video.durationSeconds,
          rank,
          fetchedAt: now,
        })),
      );
    });

    return {
      status: 'matched',
      heroThumbnailUrl: winner.thumbnailUrl,
      videos: ranked.map((video) => ({
        youtubeId: video.youtubeId,
        title: video.title,
        channel: video.channel,
        thumbnailUrl: video.thumbnailUrl,
        durationSeconds: video.durationSeconds,
        locale,
      })),
    };
  }
}

function toRecipeVideo(row: typeof dishVideos.$inferSelect): RecipeVideo {
  return {
    youtubeId: row.youtubeId,
    title: row.title,
    channel: row.channel,
    thumbnailUrl: row.thumbnailUrl,
    durationSeconds: row.durationSeconds,
    locale: row.locale,
  };
}
```

Then register `MediaService` in `apps/api/src/ai/ai.module.ts` under both `providers` and `exports`.

- [ ] **Step 4: Run the test**

```bash
pnpm --filter @kitchen/api exec vitest run src/ai/__tests__/dish-media.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Teeth-check the outage rule**

Delete the `if (!(err instanceof YoutubeUnavailableError)) throw err;` guard so an outage falls through to `persistNone`, and re-run. The test `does NOT persist none when YouTube is merely unavailable` **must** fail. Revert.

- [ ] **Step 6: Delete the superseded suite**

```bash
git rm apps/api/src/ai/__tests__/recipe-videos.spec.ts
```

Its behaviours — quota exhaustion never dead-ends, ids always come from the API, empty answers are remembered, `fetchedAt` is renewed — are all re-asserted in `dish-media.spec.ts`. Confirm each one has a counterpart before deleting; if any does not, add it first.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/ai
git commit
```

Message: `Resolve a dish media once for everybody`.

---

### Task 7: Serve the hero image and the vetted videos

**Files:**
- Modify: `apps/api/src/ai/recipes/recipes.service.ts`
- Modify: `apps/api/src/ai/recipes/recipe-mapper.ts`

**Interfaces:**
- Consumes: `MediaService.resolve` / `resolveMany`, `DishMedia` (Task 6).
- Produces: `toRecipe(row, locale, snapshot?, media?)` and `toRecipeSummary(row, locale, media?)`, both setting `heroImageUrl` from `media?.heroThumbnailUrl ?? null`.

- [ ] **Step 1: Point the mappers at the resolved media**

In `apps/api/src/ai/recipes/recipe-mapper.ts`, add an optional trailing `media?: DishMedia` parameter to `toRecipeSummary` and `toRecipe`, and replace both `heroImageUrl: null` literals with:

```ts
heroImageUrl: media?.heroThumbnailUrl ?? null,
```

Delete the local `toRecipeVideo` row mapper if it now has no caller — `MediaService` returns `RecipeVideo[]` directly.

- [ ] **Step 2: Delegate from `RecipesService`**

In `recipes.service.ts`:

- Inject `MediaService`; drop the `YOUTUBE_CLIENT` and `RESPONSE_CACHE` injections **only if** nothing else in the class uses them (check before removing — `RESPONSE_CACHE` may serve other methods).
- Replace the whole body of `getVideos` with a call to `MediaService.resolve(title, locale)` returning `media.videos`.
- In `getRecipe`, resolve media for the title and pass it to `toRecipe`.
- Delete the `hashKey('recipe-videos-empty', …)` logic — `dish_media.status` replaces it.
- Remove the now-unused `recipeVideos` import.

- [ ] **Step 3: Wire list reads**

Make `media` a **required** parameter temporarily and run:

```bash
pnpm --filter @kitchen/api exec tsc --noEmit
```

The compiler now names every `toRecipeSummary` call site. For each one, collect the titles being listed, call `MediaService.resolveMany` once for the whole page, and pass each summary its entry looked up by `dishKey(title)`. Then restore the parameter to optional (`media?: DishMedia`) so callers that genuinely have no media — error paths and fixtures — still compile.

`resolveMany` reads stored rows only and never searches, so a list render cannot spend quota no matter how many recipes it shows.

- [ ] **Step 4: Run the API suite**

```bash
pnpm --filter @kitchen/api exec vitest run
```

Expected: PASS. Integration specs need `pnpm infra:up && pnpm db:migrate && pnpm db:seed` first.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/ai/recipes
git commit
```

Message: `Serve a recipe hero from its verified video`.

---

### Task 8: The web thumbnail component

**Files:**
- Create: `apps/web/src/components/ui/RecipeThumb.tsx`
- Create: `apps/web/src/components/ui/RecipeThumb.test.tsx`
- Modify: `apps/web/src/components/recipe/RecipeView.tsx:35-43`, `apps/web/src/components/recipe/RecipesIndex.tsx:35-37`, `apps/web/src/components/plans/PlanDetail.tsx:97-99`, `apps/web/src/components/plans/EntrySheet.tsx:34-36`
- Modify: `packages/i18n/src/web.en.ts` (the `web.recipe` block), `packages/i18n/src/web.ar.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks (renders whatever `heroImageUrl` the API returns).
- Produces: `<RecipeThumb src={string | null} title={string} dishKey={string} className?: string sizes?: string priority?: boolean />`

- [ ] **Step 1: Add the i18n strings**

`web.en.ts` already has a `recipe` sub-block **nested under its single top-level `web` key** (line 153). Append there:

```ts
      noPhoto: 'No photo available for {dish}',
```

and to the matching `recipe` block in `packages/i18n/src/web.ar.ts`:

```ts
      noPhoto: 'لا توجد صورة لـ {dish}',
```

The full key is therefore **`web.recipe.noPhoto`**, not `recipe.noPhoto`. Two things make that distinction load-bearing:

- Keys are **nested objects**, not flat dotted properties. `resolve()` in `packages/i18n/src/index.ts` splits the key and walks the tree, so a literal `'recipe.noPhoto':` property would never be found.
- `index.ts` merges catalogues with a **shallow** spread (`{ ...sharedEn, ...webEn, ...mobileEn }`). Adding a *top-level* `recipe` key to `web.en.ts` would replace the shared `recipe` block wholesale and delete every other recipe string. Nesting under `web` keeps the namespaces disjoint, which is exactly what the append-only rule is protecting.

`ar.ts` is typed against `en.ts`, so omitting the Arabic string is a build error. Do not reorder existing keys.

- [ ] **Step 2: Write the failing test**

Create `apps/web/src/components/ui/RecipeThumb.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Locale } from '@kitchen/i18n';
import { LocaleProvider } from '../../lib/locale';
import { RecipeThumb } from './RecipeThumb';

function renderThumb(props: { src: string | null; title: string; dishKey: string }, locale: Locale = 'en') {
  return render(
    <LocaleProvider locale={locale}>
      <RecipeThumb {...props} />
    </LocaleProvider>,
  );
}

const KABSA = { src: null, title: 'Chicken Kabsa', dishKey: 'chicken-kabsa' };

describe('RecipeThumb', () => {
  it('renders the image when one resolved', () => {
    renderThumb({ ...KABSA, src: 'https://i.ytimg.com/vi/Xtspw022mb4/hqdefault.jpg' });
    expect(screen.getByRole('img', { name: 'Chicken Kabsa' })).toBeInTheDocument();
  });

  it('renders a placeholder instead of a wrong image when nothing resolved', () => {
    renderThumb(KABSA);
    // Labelled, not silent: a screen reader must be told the photo is missing
    // rather than encountering a bare heading-like string.
    expect(screen.getByRole('img', { name: 'No photo available for Chicken Kabsa' })).toBeInTheDocument();
    expect(screen.getByText('Chicken Kabsa')).toBeInTheDocument();
  });

  it('labels the placeholder in Arabic under the Arabic locale', () => {
    renderThumb(KABSA, 'ar');
    expect(screen.getByRole('img', { name: 'لا توجد صورة لـ Chicken Kabsa' })).toBeInTheDocument();
  });
  it('gives one dish the same tone every time it is rendered', () => {
    const { container: a } = renderThumb(KABSA);
    const { container: b } = renderThumb(KABSA);
    expect(a.firstElementChild?.className).toBe(b.firstElementChild?.className);
  });

  it('gives different dishes different tones', () => {
    const { container: a } = renderThumb(KABSA);
    const { container: b } = renderThumb({ src: null, title: 'Shakshuka', dishKey: 'shakshuka' });
    expect(a.firstElementChild?.className).not.toBe(b.firstElementChild?.className);
  });
});
```

- [ ] **Step 3: Run it and watch it fail**

```bash
pnpm --filter @kitchen/web exec vitest run src/components/ui/RecipeThumb.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 4: Implement**

Create `apps/web/src/components/ui/RecipeThumb.tsx`:

```tsx
'use client';

import { AppImage } from './AppImage';
import { cn } from '../../lib/cn';
import { useLocale } from '../../lib/locale';

/**
 * A recipe's image, or an honest stand-in for it.
 *
 * Every call site used to null-guard `heroImageUrl` by hand, so a new one could
 * silently forget and render nothing. Routing all of them through here means the
 * fallback cannot be skipped.
 *
 * The tones are the two soft/text token pairs the palette guard validates, so
 * the placeholder cannot drift out of contrast compliance.
 */
const TONES = [
  'bg-primary-soft text-primary-text',
  'bg-accent-soft text-accent-text',
] as const;

/** Stable across renders and processes, so a dish keeps its colour. */
function toneFor(dishKey: string): string {
  let hash = 0;
  for (let i = 0; i < dishKey.length; i += 1) {
    hash = (hash * 31 + dishKey.charCodeAt(i)) | 0;
  }
  return TONES[Math.abs(hash) % TONES.length]!;
}

export function RecipeThumb({
  src,
  title,
  dishKey,
  className,
  sizes,
  priority = false,
}: {
  src: string | null;
  title: string;
  dishKey: string;
  className?: string;
  sizes?: string;
  priority?: boolean;
}) {
  const { t } = useLocale();

  if (src) {
    return <AppImage src={src} alt={title} className={className} sizes={sizes} priority={priority} />;
  }

  return (
    <div
      role="img"
      aria-label={t('web.recipe.noPhoto', { dish: title })}
      className={cn(
        'flex items-center justify-center overflow-hidden p-3 text-center text-sm font-medium',
        toneFor(dishKey),
        className,
      )}
    >
      <span aria-hidden className="line-clamp-3">
        {title}
      </span>
    </div>
  );
}
```

- [ ] **Step 5: Replace the four hand-rolled guards**

Each call site currently null-guards by hand. Replace them exactly, keeping every `className` so nothing shifts:

`RecipeView.tsx:35-43`:

```tsx
<RecipeThumb
  src={recipe.heroImageUrl}
  title={recipe.title}
  dishKey={recipe.title}
  priority
  sizes="(max-width: 1024px) 100vw, 900px"
  className="aspect-[21/9] w-full rounded-2xl"
/>
```

`RecipesIndex.tsx:35-37`:

```tsx
<RecipeThumb src={recipe.heroImageUrl} title={recipe.title} dishKey={recipe.title} className="aspect-video w-full rounded-xl" />
```

`PlanDetail.tsx:97-99`:

```tsx
<RecipeThumb src={entry.recipe.heroImageUrl} title={entry.recipe.title} dishKey={entry.recipe.title} className="h-14 w-14 shrink-0 rounded-lg" sizes="56px" />
```

`EntrySheet.tsx:34-36`:

```tsx
<RecipeThumb src={entry.recipe.heroImageUrl} title={entry.recipe.title} dishKey={entry.recipe.title} className="aspect-video w-full rounded-xl" />
```

Import `RecipeThumb` from `../ui/RecipeThumb` in each, and drop the `AppImage` import where nothing else uses it. `dishKey` takes the title because the API exposes no key and the value only has to be stable per dish.

- [ ] **Step 6: Run the web suite**

```bash
pnpm --filter @kitchen/web exec vitest run
```

Expected: PASS, **including** `src/lib/token-usage.test.ts` and `src/app/palette.test.ts`. If either fails, fix the component — do not touch the guard.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src packages/i18n/src
git commit
```

Message: `Show a designed placeholder instead of a wrong photo`.

---

### Task 9: The mobile thumbnail component

**Files:**
- Create: `apps/mobile/src/lib/recipe-tone.ts`
- Create: `apps/mobile/src/lib/recipe-tone.spec.ts`
- Create: `apps/mobile/src/components/RecipeThumb.tsx`
- Modify: `apps/mobile/src/app/recipe/[id]/index.tsx:60-62`, `apps/mobile/src/app/entry/[id].tsx:79-84`
- Modify: `packages/i18n/src/mobile.en.ts` (the `mobile.recipe` block), `packages/i18n/src/mobile.ar.ts`

`toneIndexFor` lives in `lib/`, not beside the component, for a concrete reason: `apps/mobile/vitest.config.ts` runs `environment: 'node'` over `src/**/*.spec.ts`, and no mobile spec imports a component because importing one pulls in `react-native`, which will not parse under node. Keeping the tone logic in a dependency-free module is what makes it testable at all.

**Interfaces:**
- Consumes: `tints` and `tintFor` from `apps/mobile/src/theme/index.ts` (already dependency-free, so safe to import from a node-env spec).
- Produces: `toneIndexFor(dishKey: string): number` from `lib/recipe-tone.ts`, and `<RecipeThumb src={string | null} title={string} dishKey={string} height={number} />`.

- [ ] **Step 1: Add the i18n strings**

`mobile.en.ts` already has a `recipe` sub-block **nested under its single top-level `mobile` key** (line 125). Append there:

```ts
      noPhoto: 'No photo available for {dish}',
```

and to the matching `recipe` block in `packages/i18n/src/mobile.ar.ts`:

```ts
      noPhoto: 'لا توجد صورة لـ {dish}',
```

The full key is **`mobile.recipe.noPhoto`**. Same wording as Task 8, but a separate namespace — each app owns its own catalogue, and nesting under `mobile` is what keeps the shallow merge in `index.ts` from clobbering the shared `recipe` block. Do **not** add a top-level `recipe` key.

- [ ] **Step 2: Write the failing test**

Mobile tests are logic-only — there is no render harness — so test the tone selection, which is the part that can be wrong. Create `apps/mobile/src/lib/recipe-tone.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { toneIndexFor } from './recipe-tone';
import { tints, tintFor } from '../theme/index';

describe('RecipeThumb tone selection', () => {
  it('is stable for a dish', () => {
    expect(toneIndexFor('chicken-kabsa')).toBe(toneIndexFor('chicken-kabsa'));
  });

  it('separates different dishes', () => {
    expect(toneIndexFor('chicken-kabsa')).not.toBe(toneIndexFor('shakshuka'));
  });

  it('always lands inside the tint tuple', () => {
    for (const key of ['chicken-kabsa', 'shakshuka', 'hummus', '', 'دجاج-كبسه']) {
      const index = toneIndexFor(key);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(tints.length);
      expect(tintFor(index)).toBeDefined();
    }
  });
});
```

- [ ] **Step 3: Run it and watch it fail**

```bash
pnpm --filter @kitchen/mobile exec vitest run src/lib/recipe-tone.spec.ts
```

Expected: FAIL — module not found.

- [ ] **Step 4: Implement**

Create `apps/mobile/src/lib/recipe-tone.ts` — pure and free of `react-native`, so the node-env spec can import it:

```ts
import { tints } from '../theme';

/** Stable per dish, so a recipe keeps its colour between launches. */
export function toneIndexFor(dishKey: string): number {
  let hash = 0;
  for (let i = 0; i < dishKey.length; i += 1) {
    hash = (hash * 31 + dishKey.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % tints.length;
}
```

Then create `apps/mobile/src/components/RecipeThumb.tsx`. Reuse the existing `tints`/`tintFor` helpers rather than introducing a second colour source — each tint already carries a matching foreground that `palette.spec` validates:

```tsx
import { Image, View } from 'react-native';
import { AppText } from './AppText';
import { useLocale } from '../lib/locale';
import { toneIndexFor } from '../lib/recipe-tone';
import { spacing, tintFor } from '../theme';

/**
 * A recipe's image, or an honest stand-in for it.
 *
 * The app previously showed whatever image it had, which is how a music-video
 * thumbnail became a meal photo. When nothing verified resolves, this renders
 * the dish's own name on a palette tint instead of a picture of something else.
 */
export function RecipeThumb({
  src,
  title,
  dishKey,
  height,
  borderRadius = 0,
}: {
  src: string | null;
  title: string;
  dishKey: string;
  height: number;
  /** Match the call site: the recipe hero is full-bleed, the entry card rounds. */
  borderRadius?: number;
}) {
  const { t } = useLocale();

  if (src) {
    return (
      <Image
        source={{ uri: src }}
        accessibilityLabel={title}
        style={{ width: '100%', height, borderRadius }}
      />
    );
  }

  const tint = tintFor(toneIndexFor(dishKey));

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={t('mobile.recipe.noPhoto', { dish: title })}
      style={{
        width: '100%',
        height,
        borderRadius,
        backgroundColor: tint.bg,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: spacing.md,
      }}
    >
      {/* AppText is the app's only text primitive — it carries the locale-aware
          scale and Arabic line-height. The tint's own validated foreground is
          passed as a style override because `color` takes a ColorToken. */}
      <AppText variant="bodyStrong" center numberOfLines={3} style={{ color: tint.fg }}>
        {title}
      </AppText>
    </View>
  );
}
```

`tintFor` already wraps out-of-range indices, and every `tints` entry pairs `bg` with an `fg` that `palette.spec.ts` asserts clears AA — so no new colour is introduced and the token guard stays green. Use only logical style keys; `marginLeft`/`left` are lint errors.

- [ ] **Step 5: Replace the two call sites**

In `apps/mobile/src/app/recipe/[id]/index.tsx:60-62`, replace the conditional with the full-bleed hero:

```tsx
<RecipeThumb src={data.heroImageUrl} title={data.title} dishKey={data.title} height={220} />
```

In `apps/mobile/src/app/entry/[id].tsx:79-84`, replace it with the rounded card image:

```tsx
<RecipeThumb
  src={recipe.heroImageUrl}
  title={recipe.title}
  dishKey={recipe.title}
  height={160}
  borderRadius={radius.md}
/>
```

Heights and radii are carried over exactly, so nothing shifts. Remove the now-unused `Image` import from each file if nothing else uses it. `dishKey` takes the title because the API exposes no key and the value only has to be stable per dish.

- [ ] **Step 6: Run the mobile suite**

```bash
pnpm --filter @kitchen/mobile exec vitest run
```

Expected: PASS, including `src/theme/palette.spec.ts` and `src/theme/token-usage.spec.ts`.

- [ ] **Step 7: Full gate**

```bash
pnpm build && pnpm typecheck && pnpm lint && pnpm test
```

Expected: all green.

- [ ] **Step 8: Commit**

```bash
git add apps/mobile/src packages/i18n/src
git commit
```

Message: `Give mobile the same honest placeholder`.

---

## Verification

After Task 9, confirm the user-visible fix in mock mode, which is what `pnpm dev` runs:

- [ ] `pnpm dev`, open `http://localhost:3100`, sign in, open a recipe. The hero must be a photograph of the dish, and the video below it must be the same dish. No celebrity faces.
- [ ] Switch the locale to Arabic and confirm the sidebar mirrors right and the placeholder text reads right-to-left.
- [ ] Confirm at least one recipe renders the placeholder rather than an image, proving the fallback path is reachable rather than merely written.
