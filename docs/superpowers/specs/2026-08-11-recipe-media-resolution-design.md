# Recipe media resolution

Status: approved, not yet implemented
Date: 2026-08-11
Supersedes: the recipe-video half of spec §5.5

## Summary

Recipes show a hero image that does not depict the dish, and videos that are not
the dish either. This design makes both correct by deriving them from one
verified source, and makes the pipeline survive more than a hundred recipes a
day.

Three changes, in order of importance:

1. **A relevance gate on YouTube results.** Today the first search hit is
   accepted unconditionally. Candidates are now filtered on category, duration
   and embeddability, then scored against the dish title, and rejected outright
   when nothing clears the bar.
2. **The hero image is the winning video's thumbnail.** Image and video come
   from a single verified match, so they cannot disagree about the dish. Cost is
   zero — no image generation, no second API.
3. **Media is cached per dish, not per recipe row.** Recipes are
   household-scoped, so the same dish is a distinct row for every household and
   today costs a separate 100-unit search each. Keying the cache by a normalized
   dish title collapses those into one.

When nothing clears the gate the recipe renders a designed placeholder built
from its own data. A wrong image is worse than no image.

## What already exists

- `recipes` (`apps/api/src/db/schema.ts`) — household-scoped, with an unused
  `hero_image_key` column. Nothing writes it.
- `recipe_videos` — cache keyed by `recipe_id`, 30-day TTL via `fetched_at`.
- `RecipesService.getVideos` (`apps/api/src/ai/recipes/recipes.service.ts`) —
  fresh-cache check, a Redis "empty answer" key, `youtube.search`, upsert with
  `fetchedAt` renewal, and a degrade path that serves stale rows when the quota
  is exhausted.
- `HttpYoutubeClient` — `search.list` with the title plus
  `YOUTUBE_QUERY_SUFFIX[locale]`. Throws `YoutubeUnavailableError` on quota or
  error.
- `recipe-mapper.ts` — returns `heroImageUrl: null` from both mapping
  functions.
- Web renders `heroImageUrl` in four places, each already null-guarded, so real
  recipes today show no image at all. `i.ytimg.com` is already allowlisted in
  `next.config.ts`.
- Mobile `YoutubePlayer` renders a tappable thumbnail and mounts the WebView
  lazily.

## Decisions

- **Image derives from video, not the reverse.** The alternative — a stock photo
  API — yields cleaner photography but generic results, and lets the image and
  the video disagree about the dish. Accuracy beats polish here because
  inaccuracy is the reported defect.
- **No AI image generation.** Cost per image is real, and generated food does
  not match the recipe it illustrates, which is the complaint restated at a
  price.
- **Strict gate, accepting reduced coverage.** Some genuine dishes will fall
  back to the placeholder rather than show a loosely related video. This is
  chosen deliberately.
- **Cache key is the dish, not the recipe.** The global cache is what makes the
  YouTube quota survivable, and it makes list cards free for popular dishes.
- **`hero_image_key` is left alone.** It keeps its S3 object-key meaning for a
  possible future user-photo feature. Resolved media is joined, never
  denormalized onto `recipes`, so it cannot drift.
- **`packages/contracts` does not change.** `heroImageUrl` is already
  `string | null` and the video shape is unchanged, so no cross-cutting
  coordination is required.

## Architecture

### `apps/api/src/ai/recipes/dish-key.ts` — new

`dishKey(title: string, locale: Locale): string` produces the normalized join
key. Pure, no I/O, heavily tested.

Normalization, in order: trim and collapse whitespace; lowercase; strip
punctuation; for Arabic strip tashkeel (U+064B–U+0652) and the tatweel
(U+0640), fold alef variants (أإآ → ا), fold ta marbuta (ة → ه) and alef maqsura
(ى → ي); drop leading articles (`the`, `ال`); drop generic recipe words; sort
remaining tokens and join with `-`.

Sorting the tokens makes "kabsa chicken" and "chicken kabsa" the same dish,
which is the point of the key.

`GENERIC_TOKENS` is exported for reuse by the scorer: `recipe`, `recipes`,
`easy`, `quick`, `best`, `homemade`, `how`, `to`, `make`, `style`, `authentic`,
`وصفة`, `وصفات`, `طريقة`, `عمل`, `سهلة`, `سريعة`, `ألذ`, `أفضل`, `بالبيت`.

### `apps/api/src/ai/recipes/relevance.ts` — new

`scoreCandidate(dishTitle, candidate, locale): number | null` returns `null`
for a hard reject, otherwise a score in `0..1.25`. Pure, no I/O.

Hard rejects:

| Condition | Reason |
| --- | --- |
| `categoryId === '10'` (Music) | The single rule that rejects both fixtures currently in the mock client. |
| `durationSeconds < 60` | Shorts — the largest source of irrelevant results. |
| `durationSeconds > 2700` | Compilations and livestreams. |
| `embeddable !== true` | Fails silently inside the player today. |
| coverage `< 0.5` | Not the same dish. |
| no distinctive token shared | Generic-word-only overlap, e.g. "easy recipe". |

Coverage is the fraction of the dish's content tokens (after `GENERIC_TOKENS`
removal) that appear in the normalized video title. A *distinctive* token is a
content token that is not in `GENERIC_TOKENS`; at least one must match, which is
what stops a title sharing only the word "chicken" from winning.

Score is `coverage`, plus `0.15` when `categoryId === '26'` (Howto & Style),
plus `0.10` when `defaultAudioLanguage` starts with the active locale. The
highest scoring candidate wins; ties break on the original API ordering, which
is YouTube's own relevance.

### `apps/api/src/ai/clients/clients.interface.ts` — edited

`YoutubeVideo` gains the fields the gate needs: `categoryId: string | null`,
`defaultAudioLanguage: string | null`, `embeddable: boolean`. `durationSeconds`
becomes non-nullable — it is now required for filtering, and `videos.list`
always returns it.

### `apps/api/src/ai/clients/http-youtube.client.ts` — edited

`search.list` gains `type=video`, `videoEmbeddable=true`, `safeSearch=strict`,
`relevanceLanguage` (`ar` or `en`), and `maxResults=10`.

A second call to `videos.list` with `part=contentDetails,status,snippet` over
the returned ids supplies duration, embeddability, category and audio language —
none of which `search.list` returns, which is why none of them can be filtered
on today. It costs **1 quota unit** for the whole batch.

ISO-8601 durations (`PT1H2M10S`) are parsed to seconds. A `videos.list` failure
throws `YoutubeUnavailableError` like any other, so the existing degrade path
applies unchanged.

### `apps/api/src/ai/clients/mock-youtube.client.ts` — edited

The current fixtures are a rickroll and a pop video, which is how they surfaced
in the app. Replaced with plausible cooking-video fixtures carrying the new
fields, including at least one that the gate must reject (a Short) so mock mode
exercises the gate rather than bypassing it.

### `apps/api/src/db/schema.ts` — edited

`recipes` gains `dishKey: text('dish_key')`, indexed, written on insert by the
recipe writer.

Rows that predate the column are **not** backfilled: Arabic folding is not
practical in SQL, so the column stays nullable and `MediaService` computes the
key on read when it is null, writing it back on the way through. Existing
recipes therefore resolve media normally on first open instead of silently
losing it, and the backfill happens as a side effect of use.

`recipe_videos` is replaced by two tables. It is a pure cache, so the migration
drops and rebuilds it; no user data exists in it.

```
dish_media          PK (dish_key, locale)
  status              'matched' | 'none'
  hero_youtube_id     text null
  hero_thumbnail_url  text null
  resolved_at         timestamptz not null default now()

dish_videos         PK (dish_key, locale, youtube_id)
  title, channel, thumbnail_url  text not null
  duration_seconds    integer not null
  rank                integer not null   -- 0 is the winner
  fetched_at          timestamptz not null default now()
```

`status='none'` **is** the negative cache, replacing the Redis empty-answer key
in `getVideos`. One mechanism instead of two, and it survives a Redis flush.

Generated with `pnpm db:generate`; the SQL is committed under
`apps/api/drizzle/`.

### `apps/api/src/ai/recipes/media.service.ts` — new

Owns dish media so `RecipesService` does not grow a second responsibility.

`resolve(dishKey, title, locale): Promise<DishMedia>`:

1. Read `dish_media`. Fresh (`resolved_at` within 30 days) → return it,
   including a fresh `none`.
2. Search via the client, score every candidate, discard rejects.
3. No survivors → upsert `status='none'` and return it.
4. Survivors → upsert `status='matched'` with the winner's id and thumbnail,
   replace `dish_videos` for that key, return.
5. `YoutubeUnavailableError` → return whatever is stored even if stale;
   if nothing is stored, return a **transient** `none` that is *not* persisted.

Step 5's distinction is load-bearing and already learned once in this codebase:
"YouTube was down" must never be cached as "YouTube has nothing", or an outage
poisons a dish for thirty days.

The hero thumbnail is the highest-resolution entry present in the candidate's
`snippet.thumbnails`, checked in the order `maxres`, `standard`, `high`,
`medium`, `default`, and the first one present wins. `maxres` and `standard` are
16:9; `high` is 4:3 and shows pillarbox bars, so it is a last resort rather than
the default it is today.

### `apps/api/src/ai/recipes/recipes.service.ts` — edited

`getVideos` delegates to `MediaService.resolve` and maps `dish_videos` by
`rank`. The Redis empty-key logic is deleted — `dish_media.status` replaces it.

### `apps/api/src/ai/recipes/recipe-mapper.ts` — edited

Both mappers take an optional resolved `DishMedia` and set
`heroImageUrl: media?.heroThumbnailUrl ?? null`. Recipe reads join `dish_media`
on `(dish_key, locale)`; list reads join too, which costs nothing extra because
they are already one query.

A list therefore shows real images for dishes some household has already opened,
and placeholders for the rest. No list render ever triggers a search.

### `apps/web/src/components/ui/RecipeThumb.tsx` — new

Single entry point for recipe imagery: renders `AppImage` when `heroImageUrl` is
present, else the placeholder. Replaces the four hand-rolled null-guards, so the
fallback cannot be forgotten at a new call site.

The placeholder is a cuisine glyph over a tone chosen by hashing `dish_key` into
a fixed list of **token names** — `bg-primary-soft`, `bg-accent-soft`,
`bg-info-soft`, `bg-success-soft`. Referencing tokens by name keeps
`token-usage.test.ts` satisfied, which rejects hex literals outside the token
files and opacity tints where a solid `*-soft` token exists.

Call sites updated: `RecipeView`, `RecipesIndex`, `PlanDetail`, `EntrySheet`.

### `apps/mobile/src/components/RecipeThumb.tsx` — new

The same component against `theme/index.ts` tokens, used wherever mobile renders
recipe imagery.

## Quota

`search.list` is 100 units, `videos.list` is 1, against 10,000 per day.

| | Unit of caching | Ceiling |
| --- | --- | --- |
| Today | one recipe row | ~100 recipe rows/day, all households |
| After | one dish + locale | ~99 distinct dishes/day, shared by every household, 30-day TTL |

The ceiling is nominally unchanged; what changes is what it is spent on. Dishes
repeat heavily across households, so a fixed catalogue of common dishes resolves
once and is then free for everyone. Growth in households stops driving quota
growth, which is the property the current design lacks.

## Error handling

| Condition | Behaviour |
| --- | --- |
| Quota exhausted, media stored | Serve stored media, stale included. |
| Quota exhausted, nothing stored | Placeholder; `none` **not** persisted, so it retries. |
| `videos.list` fails after a successful search | Treated as unavailable; nothing persisted. |
| No candidate clears the gate | Persist `status='none'` for 30 days; placeholder. |
| Thumbnail URL 404s at render | `next/image` shows the box; mobile falls back to placeholder. |

No path throws to the client. Media is decoration; a recipe without it is still
a complete recipe.

## Testing

API, `apps/api/src/ai/recipes/__tests__/`:

- `dish-key.spec.ts` — tashkeel stripped; alef, ta marbuta and alef maqsura
  folded; token order irrelevant; generic words dropped; English and Arabic
  titles for the same dish produce *different* keys, since media is per locale.
- `relevance.spec.ts` — a music-category video is rejected for "Chicken Kabsa"
  (the exact defect reported); a Short is rejected; a non-embeddable video is
  rejected; a genuine match scores above threshold; generic-word-only overlap is
  rejected; category 26 and matching audio language rank a candidate above an
  equal-coverage rival.
- `dish-media.spec.ts` — two households requesting the same dish trigger **one**
  search; a stored `none` does not re-search; an outage with nothing stored does
  **not** persist `none`; an outage with stale rows serves them; `resolved_at`
  is renewed rather than frozen; a recipe with a null `dish_key` resolves and
  has the key written back.
- `http-youtube.client.spec.ts` — the hardened query parameters are sent; ISO-8601
  durations parse, including hours; a `videos.list` failure raises
  `YoutubeUnavailableError`.

Web, `apps/web/src/`:

- `RecipeThumb.test.tsx` — image when present, placeholder when null, stable
  tone for a given `dish_key`.
- Existing palette and `token-usage` guards must stay green unmodified. They are
  not to be relaxed to accommodate the placeholder.

Mobile, `apps/mobile/src/`:

- `recipe-thumb.spec.ts` — tone selection is deterministic and every tone
  resolves to a real theme token.

## Internationalisation

Placeholder text is the dish title itself, already localized on the recipe. Any
new string (e.g. an accessibility label for the placeholder) is added to
`web.en.ts`/`web.ar.ts` and `mobile.en.ts`/`mobile.ar.ts`, never to the shared
catalogue, per the append-only namespace rule.

The placeholder uses logical properties only, so it mirrors under RTL without a
special case.

## Out of scope

- User-uploaded photos of cooked dishes. `hero_image_key` is reserved for it.
- Stock-photo APIs as a second fallback tier.
- AI image generation.
- Migrating the AI provider to reduce cost — a separate design.
- Credit-based monetization — a separate design, and one that should follow the
  provider migration so pricing reflects real unit cost.
