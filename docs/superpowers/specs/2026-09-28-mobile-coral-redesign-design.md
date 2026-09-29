# Mobile redesign — J · Coral

- **Status:** approved for implementation (user: "implement", 2026-09-28)
- **Supersedes:** the _visual_ sections of
  `2026-09-27-mobile-apricot-bento-redesign-design.md` (F · Apricot Bento): §5 principles 1, 3, 4
  and 6, §6 tokens, §7 typography, §8 components and the look of every screen in §9. F's
  information architecture (§4), vision boxes (§10), RTL behaviour (§11), accessibility (§12)
  and motion (§13) **stay in force** except where this spec overrides them.
- **Design source:** Figma file `2qQOglGHfyF3H3h0kxsQYZ`, page `108:2` ("J · Coral").
  <https://www.figma.com/design/2qQOglGHfyF3H3h0kxsQYZ?node-id=108-2>

## §1 Summary

J · Coral is a quiet, editorial, _non-AI-looking_ interface: a white page, near-black ink, one
coral for action, and hairlines instead of pastel fills. It has **square corners everywhere**
(radius 0), 44pt controls, sentence-case copy, Tajawal for both scripts, and hand-drawn line
icons and illustrations instead of emoji, gradients and the orb mascot.

Nothing about _what_ the app does changes: every route, query, mutation, offline rule, guard and
i18n key keeps working. This is a restyle of every screen and primitive, plus four new
primitives (`Checkbox`, `Toggle`, `Progress`, `SearchField`, `Illustration`), the `IconButton`
rename and the SVG glyph set.

## §2 Scope

In scope, all in `apps/mobile`:

- Tokens, radius, elevation and typography (§5, §6).
- `react-native-svg`, the 82 J icons and 42 J illustrations (§7).
- Every primitive in `src/components` (§8).
- Every route in `src/app` and every view in `src/features` (§9), in light, dark and Arabic.
- Guard tests that encode F-only visuals are rewritten for J; guards that encode _rules_
  (contrast, 44pt targets, keyboard avoidance, no physical-direction styles, no raw line
  heights, no hex outside the palette, Arabic never letter-spaced) are kept, never relaxed (§14).

Out of scope: see §16.

## §3 Sources of truth

| What              | Where                                                                                                                                                                               |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Visual design     | Figma page `108:2`: 00 Cover `172:5489`, 01 Foundations `117:10`, 02 Icons & illustrations `110:2`, 03 Components `120:10`, 04–09 screens, 10 Arabic `166:4305`, 11 Dark `169:4518` |
| Screen copy       | the existing i18n keys; the Figma frames only illustrate them. Never hard-code a string from a mock                                                                                 |
| Frame ↔ route map | §9                                                                                                                                                                                  |
| Glyph geometry    | `src/components/glyphs/*` (generated once from Figma `110:2`, §7)                                                                                                                   |

Implementers additionally receive per-frame reference PNGs (390pt wide, 1×) and a
component-spec digest out of band; those are working files, not committed.

## §4 Principles

1. **One coral action per view.** The coral fill (`primary`) marks the single primary action,
   the scan key in the tab bar and a selected chip — nothing else. Secondary actions are a coral
   outline, tertiary ones are ghost text.
2. **Square.** Every corner is 0: buttons, chips, fields, cards, sheets, thumbnails, avatars,
   bubbles, the toggle and its knob, the checkbox and the status dot. The single exception is the
   camera shutter, which is a circle because it is a physical-camera metaphor.
3. **Hairlines, not fills.** Structure comes from `border` (hairline) and `rowline` rules and a
   soft card shadow. Grey `surfaceAlt` is for inputs, thumbnails, bubbles and banners only.
4. **Status is a dot and a word.** A 6×6 square dot in the status colour plus a `label` word
   ("Use soon", "Fresh", "Expired"). Never a filled pill, never colour alone.
5. **Selection:** a selected **chip** is coral with a white label; a selected **segment** is ink
   (`inverse`) with an `onInverse` label. A selected **day** is a coral block.
6. **Danger:** destructive actions are `danger` text on a ghost button; only the final,
   irreversible confirmation is a `danger` fill.
7. **Line art, not emoji.** Food, places and empty states use J illustrations (ink strokes with a
   coral accent) on a `surfaceAlt` square. Recipe photography stays real (media-resolution
   pipeline); with no photo, a `surfaceAlt` block with the `plate` illustration stands in.
8. **No AI tropes.** No sparkles, gradients, glows, orbs or chat-bot mascots. Mama is a square
   avatar with the letter "M".

## §5 Tokens (`src/theme/palettes.ts`)

The palette keeps the existing semantic names so every call site keeps compiling; the table maps
each name to its J role. **All hex values live only in `palettes.ts`.** One palette family,
renamed `coral`, in light and dark.

### §5.1 Colours

| Token                                                                      | J role                                                         | Light             | Dark              |
| -------------------------------------------------------------------------- | -------------------------------------------------------------- | ----------------- | ----------------- |
| `bg`                                                                       | page                                                           | `#FFFFFF`         | `#0F0F10`         |
| `surface`                                                                  | card / sheet (J `card`)                                        | `#FFFFFF`         | `#18181A`         |
| `surfaceAlt`                                                               | fills: search, thumbs, bubbles, banners (J `surface`)          | `#F4F4F5`         | `#1E1E20`         |
| `border`                                                                   | hairline (J `hairline`)                                        | `#E5E5E7`         | `#2C2C2F`         |
| `rowline` **new**                                                          | list-row divider                                               | `#EFEFF1`         | `#232326`         |
| `cardEdge` **new**                                                         | 1px card outline (invisible in light)                          | `#FFFFFF`         | `#2C2C2F`         |
| `text`                                                                     | ink                                                            | `#1A1A1A`         | `#F4F4F5`         |
| `textMuted`                                                                | muted                                                          | `#6B6B70`         | `#A1A1A6`         |
| `control` **new** (`switchTrackOff` stays as a deprecated alias until C16) | checkbox/toggle-off/chevron/empty star                         | `#8A8A8F`         | `#7C7C82`         |
| `primary`                                                                  | coral fill                                                     | `#DC343C`         | `#DC343C`         |
| `primaryPressed`                                                           | pressed fill                                                   | `#C22A32`         | `#C22A32`         |
| `primaryText`                                                              | coral as text (§5.2)                                           | `#CC2E36`         | `#FF6B70`         |
| `primaryArt` **new**                                                       | coral strokes in icons/illustrations (decorative)              | `#F5424B`         | `#FF6B70`         |
| `primarySoft`                                                              | avatar ground, soft highlight                                  | `#FDECEC`         | `#2A1415`         |
| `onFill`                                                                   | label on `primary`                                             | `#FFFFFF`         | `#FFFFFF`         |
| `success`                                                                  | fresh                                                          | `#1A7F37`         | `#4CC76A`         |
| `successSoft`                                                              |                                                                | `#EAF5EC`         | `#13261A`         |
| `onSuccess`                                                                |                                                                | `#FFFFFF`         | `#111111`         |
| `warn`                                                                     | amber "use soon"                                               | `#9A5B00`         | `#E0A040`         |
| `warnSoft`                                                                 |                                                                | `#FBF1E0`         | `#2B2110`         |
| `danger`                                                                   |                                                                | `#B3261E`         | `#FF8A80`         |
| `dangerSoft`                                                               |                                                                | `#FBE9E7`         | `#2E1715`         |
| `onDanger`                                                                 |                                                                | `#FFFFFF`         | `#111111`         |
| `inverse` **new**                                                          | ink block: selected segment, toast, Apple button, "You" bubble | `#1A1A1A`         | `#F4F4F5`         |
| `onInverse` **new**                                                        |                                                                | `#FFFFFF`         | `#111111`         |
| `onInverseMuted` **new**                                                   |                                                                | `#B4B4B9`         | `#55555A`         |
| `primaryOnInverse` **new**                                                 | toast action                                                   | `#FF8A8F`         | `#C22A32`         |
| `overlay`                                                                  | sheet scrim                                                    | `rgba(0,0,0,0.4)` | `rgba(0,0,0,0.6)` |

**Media group** (camera, photos, video, live assistant) is one shared object, identical in both
modes: `surfaceInverse #111111`, `surfaceInverseAlt #2A2A2D`, `borderInverse #8A8A8F`,
`textInverse #FFFFFF`, `textInverseMuted #B4B4B9`, `primaryInverse #FF8A8F`,
`onPrimaryInverse #111111`, `warnInverse #A56300` (a dark amber, so the warn dot still clears 3:1
on a white chip — 4.79 — and on the viewfinder — 3.94). Media icon buttons use black at 45% —
expose it as the media-group token `mediaButton: 'rgba(0,0,0,0.45)'`.

**Photo scrim** keeps F's stop geometry (`[0,0] [0.35,0] [0.6,0.7] [1,0.82]`, `textMinAlpha
0.7`) in pure black (`rgb #000000`).

### §5.2 Why `primaryText` is not the Figma `#DC343C`

The Figma coral-text is the fill colour, which measures 4.57 on white but 4.15 on `surfaceAlt`
and 4.0 on `primarySoft` — both under AA. `#CC2E36` is visually indistinguishable at text size
and measures 5.23 on white, 4.76 on `surfaceAlt` and 4.58 on `primarySoft`, so a coral label is
legal on every surface and the existing guard "primaryText reads as text on its own soft chip"
keeps passing unchanged. Coral _fills_ stay `#DC343C`.

### §5.3 Retired — in two steps

J has no tinted tiles, gradients, herb green or recipe-thumb tones. Those members still have
consumers in every screen, so they retire in two steps to keep each group green:

1. **C1 keeps them as deprecated members with J interim values**, marked `/** @deprecated J: removed
in C16 */`, so untouched screens keep compiling and every existing guard keeps passing:
   - `tints`: all four names keep their slots (rotation and naming guards unchanged) with
     `bg = surfaceAlt` and `fg = text`. Light `#F4F4F5` / `#1A1A1A`, dark `#1E1E20` / `#F4F4F5`.
   - `gradientHero`: the media ramp `['#111111', '#1A1A1A', '#2A2A2D']`.
   - `accent` = `success`, `accentSoft` = `successSoft`.
   - `switchTrackOff` = `control`.
2. **Each screen group stops using them** as it restyles its screens. C16 then deletes the
   members, `Tint` / `TintName` / `tintIn` / `tintNamed`, `components/recipe-thumb-tones.ts` and
   the guards that only covered them: the tint, hero-gradient, recipe-thumb-tone and
   tint-rotation blocks. A guard goes only in the same commit as the thing it guards.

In J a tile is `surface` + `cardEdge` + card shadow. A photo-less hero is `surfaceAlt` with the
`plate` illustration. `expo-linear-gradient` stays installed for the photo scrim.

### §5.4 Radius, elevation, spacing

- `radius`: every existing key (`xs sm md lg xl pill`) becomes **0** in the foundation task so
  the whole app squares at once; the sweep (§15, C16) deletes the object's F keys and leaves
  `radius = { none: 0, shutter: 999 }`. A source guard forbids any other `borderRadius` value
  (§14).
- `shadowFor(palette)` returns three J elevations. Dark mode draws no shadow: opacity 0 **and** Android
  `elevation: 0` (opacity alone does not suppress an Android elevation shadow); cards get their
  depth from `cardEdge` instead.

  | Key      | Offset y | Blur | Opacity (light) | Android `elevation` | Use                                               |
  | -------- | -------- | ---- | --------------- | ------------------- | ------------------------------------------------- |
  | `card`   | 6        | 20   | 0.07            | 2                   | recipe card, place tile, timer, stat, credit pack |
  | `raised` | 10       | 28   | 0.16            | 8                   | toast, floating controls (J "Float")              |
  | `sheet`  | −8       | 30   | 0.10            | 12                  | bottom sheets                                     |

- `spacing` keeps `xs 4 · sm 8 · md 12 · lg 16 · xl 24 · xxl 32` and adds `gutter: 20`, the J
  page margin. `Screen`'s padded layouts switch from `lg` to `gutter`; blocks inside a page stay
  `xl`/`xxl` apart (the visual-rhythm rule "blocks separate by more than rows" is kept).
- Hit targets: 44pt minimum everywhere, enforced by `token-usage.spec.ts` `TOUCH_TARGETS`, which
  reads the dimension each control declares. A control drawn smaller than 44 — a 36pt S button, a
  36pt stepper, a 22pt checkbox, a 26pt toggle — renders its visual shell **inside a Pressable
  whose `minHeight` (or `height`/`width`) is 44**. That Pressable's dimension is what the guard
  tracks. `hitSlop` alone does not count, with one exception: `Chip`, whose slop is already
  measured by `controls.spec.ts` ("a chip reaches 44pt through the theme slop").
  `SegmentedControl` is drawn 44 high (Figma 40) so the track is itself the target.

## §6 Typography (`src/theme/index.ts`, `src/lib/fonts.ts`)

**Tajawal for text in both scripts** (Regular 400, Medium 500, Bold 700). It is already vendored,
with its licence and checksums. There is no 600 cut, so anything that asked for 600 resolves to
Bold.

**Numerals keep Outfit Medium.** The count, credit-balance and timer tiers must use tabular
figures, and Tajawal cannot provide them: its digits are proportional (advances 375–565) and it
has no `tnum` feature. Outfit has `tnum`, so `numeral` and `numeralSmall` render in
`Outfit-Medium` with `fontVariant: ['tabular-nums']` in **both** locales. That is safe because
those tiers only ever carry digits and separators, and Arabic keeps Latin digits.

What changes in the font plumbing:

- `lib/fonts.ts`: `resolveFontFamily(locale, loaded, weight, variant?)` returns `Outfit-Medium`
  for the two numeral variants and Tajawal otherwise. `LATIN_FONTS` maps every weight to Tajawal.
  Add a `NUMERAL_FONT` constant.
- `lib/font-loader.ts`, the `expo-font` plugin list in `app.json`, and `assets/fonts/README.md`:
  drop `Outfit-Regular`, `Outfit-SemiBold` and `Outfit-Bold`. Keep `Outfit-Medium` and
  `OFL-Outfit.txt`. Delete the three unused TTFs.
- `AppText` passes its variant to `resolveFontFamily`.

Line heights are **explicit per locale**, with no multiplier. Arabic sets its larger titles a
little smaller and gives every tier more leading. Digits stay Latin. The existing variant names
stay, so call sites compile, and **six** are added: `bodyLarge`, `small`, `eyebrow`,
`buttonSmall`, `numeralSmall` and `tab`.

| Variant                | J style                       | Latin size/line | Arabic size/line | Weight | Latin tracking |
| ---------------------- | ----------------------------- | --------------- | ---------------- | ------ | -------------- |
| `hero`                 | Display                       | 34/40           | 30/44            | 500    | −0.4           |
| `display`              | Title 1                       | 28/34           | 26/38            | 500    | −0.3           |
| `title`                | Title 2                       | 22/28           | 20/30            | 500    | −0.2           |
| `heading`              | Title 3                       | 18/24           | 17/26            | 500    | 0              |
| `bodyLarge` **new**    | Body large                    | 17/27           | 17/30            | 400    | 0              |
| `body`                 | Body                          | 15/22           | 15/26            | 400    | 0              |
| `bodyStrong`           | Body strong                   | 15/22           | 15/26            | 500    | 0              |
| `label`                | Meta strong                   | 13/18           | 13/22            | 500    | 0.1            |
| `caption`              | Meta                          | 13/18           | 13/22            | 400    | 0.1            |
| `small` **new**        | Caption                       | 12/16           | 12/18            | 400    | 0.1            |
| `eyebrow` **new**      | Eyebrow                       | 12/16           | 12/18            | 700    | 0.2            |
| `button`               | Button                        | 15/20           | 15/22            | 700    | 0.1            |
| `buttonSmall` **new**  | Button small                  | 13/18           | 13/20            | 700    | 0.1            |
| `numeral`              | Numeral (Outfit Medium)       | 44/48           | 44/52            | 500    | −0.5, tabular  |
| `numeralSmall` **new** | Numeral small (Outfit Medium) | 28/32           | 28/36            | 500    | −0.3, tabular  |
| `tab` **new**          | Tab label (a11y/tablet only)  | 11/14           | 11/16            | 500    | 0.1            |

Latin tracking deviates slightly from the Figma (0%) on purpose: the repository rule is that
Latin tiers carry tracking and Arabic carries none (copilot instructions, "Design tokens").
Arabic letter-spacing is always 0. Chrome variants capped at `CHROME_MAX_FONT_SCALE` 1.6:
`button`, `buttonSmall`, `label`, `caption`, `small`, `eyebrow`, `tab`. Content variants stay
uncapped. Eyebrows are sentence case — never `textTransform: 'uppercase'` (Arabic has no case,
and J does not shout).

## §7 Icons and illustrations

### §7.1 Rendering

Add `react-native-svg` with `npx expo install react-native-svg` (then `pod install` for the iOS
dev build). Glyph geometry lives in two generated, hand-edit-free modules:

- `src/components/glyphs/icon-paths.ts` — `ICON_PATHS: Record<GlyphName, readonly string[]>`,
  82 icons in a 24×24 box, drawn as strokes, width 1.75, round caps and joins. Derived from
  Lucide (ISC): the file carries the ISC notice.
- `src/components/glyphs/illustration-paths.ts` — `ILLUSTRATION_PATHS: Record<IllustrationName,
readonly (readonly [d: string, tone: 'ink' | 'coral'])[]>`, 42 drawings in a 64×64 box. Original
  artwork for this app.

`Icon` (`components/Icon.tsx`) renders `<Svg viewBox="0 0 24 24">` with `stroke = color ??
colors.text`, `strokeWidth 1.75` (scaled so a 24 icon is 1.75 and an 18 icon stays ≥ 1.5),
`fill="none"` unless `filled` (used by filled stars). It stays decorative by default
(`accessible={false}`) — the parent control owns the label.

`Illustration` (`components/Illustration.tsx`, new) renders `ink` paths in `colors.text` and
`coral` paths in `colors.primaryArt`, `fill="none"`, stroke width by size: 2 at ≥ 56, 1.75 at ≥ 40,
1.5 below. Always decorative (`accessible={false}`, `importantForAccessibility="no-hide-descendants"`).

### §7.2 Names

`GlyphName` is the J set: `activity alert arrowL arrowR bag barcode bell bookmark box calendar
camera captions cart chat check checkCircle chevD chevL chevR chevU clock coffee coins copy droplet
eye feedback flame flashOff flip fridge globe heart help history home image info keyboard leaf
list lock logout mail mic micOff minus moon more pause pencil person pin play plus receipt refresh
scan search send settings share shuffle sliders sort star stop sun tablet text timer trash user
userPlus users utensils video volume wifi wifiOff x zap`.

C16 removed the migration aliases: `IconName = GlyphName | BrandIconName`, where brand marks are
only `apple` and `google`. Callers now use glyph names directly; `LEGACY_ICON_ALIASES`,
`LegacyIconName`, and `@expo/vector-icons` use were deleted except for those brand marks.

| Legacy    | Glyph    | Legacy       | Glyph    | Legacy             | Glyph                  |
| --------- | -------- | ------------ | -------- | ------------------ | ---------------------- |
| home      | home     | kitchen      | fridge   | plans              | calendar               |
| more      | more     | camera       | camera   | cameraReverse      | flip                   |
| flash     | zap      | images       | image    | barcode            | barcode                |
| receipt   | receipt  | manual       | keyboard | plus / minus       | plus / minus           |
| search    | search   | check        | check    | close              | x                      |
| clock     | clock    | calendar     | calendar | trash              | trash                  |
| edit      | pencil   | warning      | alert    | info               | info                   |
| flame     | flame    | leaf         | leaf     | star / starOutline | star (filled / stroke) |
| basket    | bag      | share        | share    | restaurant         | utensils               |
| settings  | settings | bell         | bell     | user               | user                   |
| household | users    | play         | play     | mic / micOff       | mic / micOff           |
| send      | send     | captions     | captions | wallet             | coins                  |
| sparkles  | coins    | offline      | wifiOff  | sync               | refresh                |
| location  | pin      | snowflake    | box      | box                | box                    |
| swap      | shuffle  | chevron      | chevR    | chevronDown        | chevD                  |
| back      | chevL    | arrowForward | arrowR   | water              | droplet                |
| stretch   | activity | sunrise      | sun      | timerPause         | pause                  |
| screen    | tablet   | pause        | coffee   |                    |                        |

During the C16 migration, the wellness "break" cup moved from legacy `pause` to `coffee`, and the
timer pause control moved from legacy `timerPause` to `pause`. No caller uses legacy keys after
C16.

**Directional glyphs** mirror under RTL through `DirectionalIcon` (scaleX −1): `chevL chevR
arrowL arrowR send logout`. Everything else is symmetric in intent and never mirrors.

**Brand marks** (`apple`, `google`) are not J glyphs: `OAuthButtons` keeps the official marks
(Apple and Google branding rules), rendered at 18pt.

### §7.3 Food and place art

`FoodIcon` becomes a J Thumb: a square `surfaceAlt` block with an `Illustration` at ~72% of its
size (sizes 40 / 56 / 72). `lib/food-icon.ts` keeps resolving an item to a key; a new
`FOOD_ILLUSTRATION` map sends each key to the nearest J drawing, falling back by category:
produce `carrot`, dairy `milk`, meat and fish `chicken`, grains and bakery `bread`, spices
`spice`, frozen `freezer`, drinks `glass`, pantry and other `plate`. Keys with an exact drawing
use it (`apple bread carrot cheese chicken egg garlic herb(s) lemon milk oil onion potato rice salt
tomato yoghurt`).

Places use `fridge freezer pantry spicerack`; unknown places use `pantry`. Empty states use the
drawing named in §9. The emoji PNGs under `assets/emoji`, `lib/food-icon-assets.ts` and the CC-BY
icon credit line on Account retire together in the sweep once nothing references them.

## §8 Components

Every primitive keeps its file and public props where it can; new props are additive. Values
below are J's; "S" = 36pt visual inside a 44pt target.

**Actions**

- `Button` — variants `primary` (coral / `onFill`), `secondary` (transparent, 1.5 `primary`
  outline, `primaryText` label), `ghost` (no fill, `text` label; `tone="danger"` → `danger`
  label; no horizontal padding, keeps the existing visual-rhythm rule), `destructive` (`danger` /
  `onDanger`), `inverse` (`inverse` / `onInverse`); disabled = `surfaceAlt` fill + `textMuted`
  label. Size L 44 high, padding 0·20, gap 8, `button`; size S draws a 36-high shell, padding 0·14,
  `buttonSmall`, centred in a 44-high Pressable (§5.4). Optional leading/trailing 18 icon.
  Pressed: `primaryPressed` (primary), 6% ink overlay (others).
- `IconButton` (rename of `RoundButton`; the old name re-exports until the sweep, and the guard
  entry moves to the new file) — square; the Pressable is always 44, and the visual is 44 (icon 22)
  or 36 (icon 18); tones `plain`, `surface` (`surfaceAlt`), `outline` (1px `border`), `coral`
  (`primary` + `onFill` icon), `inverse`, `media` (`mediaButton` + `textInverse`). Requires
  `accessibilityLabel`. `size` keeps accepting larger values (Tonight play control, 48).
- `OAuthButtons` — full-width 44: Apple = `inverse` fill + `onInverse` label; Google = `bg` fill,
  1px `border`, `text` label; 18pt mark, gap 10.
- `Fab` — retired in C16 together with its `TOUCH_TARGETS` entry (J has no floating action
  buttons); screens that used it move to a header action or a primary button as they are
  restyled.

**Inputs**

- `Field` — label `label` in `text` above, gap 6; box 48 high, padding 0·14, `bg` fill, 1px
  `border`; focus 1.5 `text`; error 1.5 `danger` + help `caption` in `danger`; disabled
  `surfaceAlt` + `textMuted`. `DateField` shares the box.
- `Search` (new, `components/SearchField.tsx`) — 44 high, `surfaceAlt`, padding 0·12, 20 `search`
  icon in `textMuted`, `body` input, optional trailing `mic` 44 icon button.
- `Textarea` — `Field` with `multiline`, box 132, padding 14, count `small` `textMuted` at the
  bottom end.
- `SegmentedControl` — 44 high (§5.4), `bg`, 1px `border`; selected segment `inverse` fill +
  `onInverse` `buttonSmall`; others `text`. No sliding thumb shape — the selected block
  cross-fades (§13). Media variant: `surfaceInverseAlt` track, selected `textInverse` fill with
  `surfaceInverse` label.
- `Chip` — 36 high, padding 0·14, gap 6, reaching 44 through the theme `hitSlop` (the existing
  `controls.spec.ts` rule); unselected `bg` + 1px `border` + `text`; selected `primary` + `onFill`,
  no border; optional leading 18 icon and count.
- `QuantityStepper` — 118×36 visual box, 1px `border`; − and + are 36 squares with 18 icons, each
  inside a 44 Pressable (the guarded dimension); value `bodyStrong` centred. Stays one adjustable
  accessibility element.
- `Checkbox` (new) — 22 square; off `bg` + 1.5 `control` border; on `primary` + 16 `check` in
  `onFill`. Inside a 44 Pressable with `accessibilityRole="checkbox"` and `checked` state.
  `features/shop/ShoppingCheckbox.tsx` becomes a thin wrapper over it.
- `Toggle` (new, replaces the native `Switch` in `ToggleRow`) — 44×26 square track (`control` off,
  `primary` on), 20 square knob `onFill`, inset 3, 160ms slide, inside a 44-high Pressable.
  `accessibilityRole="switch"`.
- `StarRating` — 20 stars, gap 4; filled `primary` (`filled` icon), empty stroke `control`;
  each star 44 target when interactive.

**Status and feedback**

- `Badge` — dot 6×6 square + `label` word in the tone colour (`success`, `warn`, `danger`,
  `textMuted`, `primaryText`), gap 6, no fill. `CountBadge`/Counter: min 20×20, padding 0·6,
  `primary` + `eyebrow` `onFill`.
- `Progress` (new) — 4 high, track `border`, fill `primary` (paused/idle `control`).
- `Toast` — `inverse` fill, padding 12·16, gap 12, `raised` shadow, 20 icon, `body` `onInverse`,
  action `buttonSmall` `primaryOnInverse`.
- `OfflineBanner` / `SyncFailuresBanner` / credits banner — `surfaceAlt`, padding 10·14, gap 10,
  18 icon (`wifiOff`, `refresh`, `alert` in `danger`, `coins`), `label` `text`, optional ghost
  action.
- `States` — `EmptyState`: padding 32·24, centred, gap 10, 88 `Illustration`, `title`, `body`
  `textMuted`, optional primary L button. `LoadingState` = skeleton rows (56 `surfaceAlt` thumb +
  bars 12 and 10 high). `ErrorState` = EmptyState with `alert`-style copy and Retry.

**Identity, navigation, structure**

- `Avatar` — square 32/40/56/80, `primarySoft` fill, initials in `primaryText` (`label` at 32,
  `bodyStrong` at 40, `title` at 56+). `AccountButton` = 44 target around a 32 avatar.
- `TabBar` — `bg`, top hairline `border`, padding 6·8·(safe-area), five equal slots, icon-only
  (24): inactive `text`, active `primary` with a 4×4 `primary` square 5 below the icon. Centre
  slot is the scan key: 52×40 `primary` block, `scan` 22 in `onFill`, pushes `/capture`. Every
  slot keeps its `accessibilityLabel` (tab label key) and `selected` state. No labels under
  icons (J), but `tab` variant labels show on tablets ≥ 600pt wide.
- `TabHeader` (large) — 64 high, padding 8·20·12, optional `caption` `textMuted` kicker above the
  `display` title ("Thursday evening" / "Let's cook, Chef"), trailing 44 icon button(s) + 32
  avatar. `Header` (nav) — 52 high: 44 back (`chevL`, directional) at start, centred
  `bodyStrong` title, optional trailing 44 action.
- `Sheet` — `surface` fill, `sheet` shadow, square top; grabber 36×4 `border`, header row `title` +
  44 close; body padding 4·20·(safe-area + 20), gap 16; scrim `overlay`.
- `SectionLabel` → section head: `heading` title in `text`, optional trailing action in `label`
  `primaryText`.
- `ListRow` — padding 12·0, gap 14, bottom 1px `rowline` (no group card around rows; `ListGroup`
  becomes a plain column with the section head), leading 22 icon in `text`, `body` title + `caption`
  `textMuted` sub, trailing chevron 18 `control` / value `caption` `textMuted` / `Toggle` / 18
  `check` `primary`. `ToggleRow` = ListRow + Toggle.
- `Card` — `surface`, 1px `cardEdge`, `card` shadow, padding 16, radius 0.
- `Tile` / `Bento` → **place tile** and **quick action**: place tile = `Card` 158 high, 44
  illustration, `bodyStrong` name, `caption` count, optional `warn` Badge ("2 soon"); quick action
  = `surfaceAlt` block, 24 icon, `caption` label, no chevron. `Bento` becomes a 2-column (tiles)
  or 3-column (quick actions) grid with 16 / 10 gaps. `tile-layout.ts` keeps the width maths.
- `RecipeThumb` — photo (or `surfaceAlt` + `plate` illustration) at 56 / 72 / full-bleed 196.
- `CreditBalance` — `coins` icon + "146 credits left" `body` + trailing ghost "Top up" chevron row.
- `OrbMascot`, `Ring` — retired. Where F showed the orb (assistant header, capture looking state,
  credits, cook hands-free), J shows the Mama avatar ("M") or nothing.

**Domain rows and blocks** (built in the screen group that owns them, as components in
`features/<area>/`):

- Item row — padding 10·0, gap 14, `rowline`; `FoodIcon` 56 (drawing 40); `bodyStrong` name,
  `caption` meta ("0.8 kg · Fridge"); trailing end-aligned `Badge` over a `small` "when".
- Recipe card — photo 196 full-bleed; body padding 16·16·18, gap 6: `eyebrow` `primaryText`
  ("Tonight · 50 min"), `title`, `caption` `textMuted`, actions (primary S + secondary S) with 10
  top padding. `Card` chrome.
- Recipe row — photo 72 square, `bodyStrong` title, `caption` meta, have-badge, chevron.
- Ingredient row — fixed qty column `bodyStrong`, name `body`, 18 have icon (`check` `success` /
  `alert` `warn` / `x` `danger`).
- Step — 28 square number box with 1.5 `text` border and `label` numeral, `body` text.
- Plan day — 40 date column (`small` dow `textMuted`, `heading` day; today in `primaryText`), 56
  photo, `bodyStrong` + `caption`, chevron. Cooked: `success` dot + "Cooked".
- Shopping row — `Checkbox`, `body` name (done → `textMuted`, no strike), `caption` meta.
- Day cell — 44×60, `small` dow + `bodyStrong` number; today `primaryText`; selected `primary`
  block with `onFill` text.
- Timer — `Card`; `numeralSmall` time + `caption` name; 44 `surface` pause/play and 44 stop icon
  buttons; `Progress` (paused `control`); done → "Time is up" + Remove.
- Bubble — max width 290, padding 10·14, square; Mama `surfaceAlt` / `text`; You `inverse` /
  `onInverse`, end-aligned. Composer — top hairline, padding 8·12·8·16, gap 6: 44 `surfaceAlt`
  field, 44 `mic` icon button, 44 `coral` send.
- Waveform — 3-wide bars, gap 3, `text` (on media `textInverse`).
- Detection box (capture) — `primary` corner brackets 18 long × 3 thick + a 22-high `primary`
  tag with `eyebrow` `onFill`; low confidence = `textInverseMuted` brackets + "not sure".
- Shutter — 76 ring (3 `textInverse`) around a 60 `textInverse` core; busy = core at 40% opacity.
- Credit pack — `Card` padding 20, gap 16: 56 `coins` illustration + `title` + `caption`; price
  `title` + primary L.
- Stat — `Card` padding 16: `numeralSmall` value + `caption` label.

## §9 Screens

Build each screen to its frame; keep every behaviour, query, key and accessibility label that
exists today. Copy comes from the existing i18n keys; add keys (append-only, en + ar natively)
only where the frame introduces copy with no key.

| Figma frame (node)                                                                                                                          | Route / view                                                                            | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Welcome `128:300`, AR `166:4308`, Dark `169:4521`                                                                                           | `(auth)/welcome.tsx`                                                                    | full-bleed food photo top half, `hero` two-line headline, primary L "Get started", ghost "I already have an account"                                                                                                                                                                                                                                                                                                                                                                                                       |
| Sign in `128:391`                                                                                                                           | `(auth)/sign-in.tsx`                                                                    | `AuthLayout`: `display` title, Apple/Google, "or" hairline divider, Fields, primary L, switch link                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Sign up `128:487`                                                                                                                           | `(auth)/sign-up.tsx`                                                                    | as sign in, name field first                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Household · Create `128:601`, Join `128:663`                                                                                                | `(auth)/onboarding.tsx`                                                                 | Segmented Create/Join, Field, primary L Continue                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Home · full page `133:626`, AR `166:4449`, Dark `169:4610`                                                                                  | `(tabs)/home.tsx`                                                                       | TabHeader (kicker + greeting, bell, avatar) · Search "What should I cook tonight?" (opens assistant) · Tonight recipe card · 3 quick actions (Scan a receipt, Plan my week, Quick add) · "Use these soon" item rows · "This week" progress + day strip · "Kitchen at a glance" 2×2 place tiles · credits row                                                                                                                                                                                                               |
| Home · no plan, offline `133:923`                                                                                                           | `(tabs)/home.tsx` states                                                                | offline banner; no-plan card with `calendar` illustration + primary S                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Kitchen `133:1065`, AR `166:4997`, Dark `170:4737`                                                                                          | `(tabs)/kitchen.tsx`                                                                    | TabHeader + add action · Search · place chips (All + places, counts) · "Use these first" · "All items" item rows                                                                                                                                                                                                                                                                                                                                                                                                           |
| Kitchen · Fridge `133:1268`                                                                                                                 | `(tabs)/kitchen.tsx` filtered                                                           | drill-in: nav Header with back and add action; below the header, summary at start and sort at end; sections are "Use these first" then "All items" only; no chip row or search, no "Just added" section, and no search query carried in                                                                                                                                                                                                                                                                                    |
| Item · Chicken breast `147:2304`                                                                                                            | `item/[id].tsx` (page)                                                                  | Nav header with trailing `pencil` (opens the existing edit sheet); 72 thumb + `display` name + Badge/when; fact rows Quantity (trailing `QuantityStepper`, keeping inline ± and its accessibility actions), Brand, Location, Expiry (rows open the edit sheet); "History" rows from the event ledger (existing `mobile.item.history*`); footer: ghost danger "Remove from kitchen" (existing delete flow + confirm sheet) and secondary "Edit item"                                                                        |
| Item · Edit & rate `147:2454`, Dark `170:5778`                                                                                              | `item/[id].tsx` edit `Sheet` + `features/inventory/ProductReview.tsx`                   | the existing edit sheet restyled to the frame's fields (name + "Use catalog name", unit, brand, location, expiry, primary Save). Quantity is **not** a sheet field: it stays the page's inline stepper, an append-only `useAdjustQuantity` event, and never enters the `useUpdateInventoryItem` body; the frame's "Rate this product" block is the existing `ProductReview` (Stars, Textarea, secondary "Send review", privacy caption), which stays on the item page below History. No new route                          |
| Plan · Weekly `137:1097`, AR `166:5392`, Dark `170:4937`; Daily `137:1342`; empty `137:1483`                                                | `(tabs)/plans.tsx`                                                                      | Segmented Daily/Weekly/Monthly · week progress · plan-day rows · shortfall → shopping line; empty = EmptyState `calendar` + primary "Generate plan"                                                                                                                                                                                                                                                                                                                                                                        |
| Generate a plan `147:2617`, Generating `147:2819`                                                                                           | `generate-plan.tsx`, `(tabs)/plans.tsx`                                                 | Generate screen = Segmented period, Chips (preferences), Stepper people, primary L; generating = Plans tab title + matching scope Segmented, pot illustration card, Progress, step copy and skeleton rows                                                                                                                                                                                                                                                                                                                  |
| Plan · Meal sheet `147:2914`                                                                                                                | `entry/[id].tsx` (meal-plan entry)                                                      | stays a pushed route (no navigation change) laid out as the sheet's content: Nav header "Meal"; recipe row (photo 72, title, slot · date · serves, have-badge) → recipe; "Status" Segmented Planned/Cooked/Skipped (existing `useUpdatePlanEntry`); one "Change meal" row (`shuffle`) — the single existing action, `useRegeneratePlanEntry` with `excludeRecipeIds: [recipe.id]`; the frame's "Suggest another" row is the same action and is not a second control; primary at the bottom per the existing primary action |
| _(no frame — derive from Plan · Weekly)_                                                                                                    | `plan/[id].tsx` (plan detail)                                                           | unchanged behaviour; Nav header, week progress, plan-day rows, shortfall line — same components as the Plan tab                                                                                                                                                                                                                                                                                                                                                                                                            |
| Shop `137:1579`, AR `166:5728`, Dark `170:5116`; empty `137:1704`                                                                           | `(tabs)/shopping.tsx`                                                                   | TabHeader + share · add Field · grouped shopping rows · "Purchased" section; empty = EmptyState `bag` with helper body and no move-to-kitchen footer                                                                                                                                                                                                                                                                                                                                                                       |
| Capture · Photo `139:1624`, Shot taken `139:1702`, Results `139:1765`                                                                       | `capture/index.tsx`, `features/capture/PhotoCapture.tsx`                                | media surface; top bar close + flash (media icon buttons); mode Segmented (media) Photo/Barcode/Receipt/Type; Shutter; results = detection boxes + bottom sheet list + primary "Review n items"                                                                                                                                                                                                                                                                                                                            |
| Capture · Barcode `139:1852`, Receipt `139:1944`, Manual `142:1713`, Nothing found `142:2301`                                               | `features/capture/*`                                                                    | barcode frame brackets with hint and compact Enter barcode affordance on the media; receipt guide; manual = light sheet with Search + catalog rows, then Quantity number Field, Unit dropdown, location chips, expiry controls, and pinned primary "Add to kitchen"; nothing found = EmptyState on media                                                                                                                                                                                                                   |
| Review before adding `142:1873`, Dark `170:5517`; Edit item `142:2035`                                                                      | `capture/review.tsx`, `features/capture/ReviewList.tsx`                                 | Nav header, "Nothing is saved until you add it." caption, flat item rows (quantity edits move to Edit), "not sure" rows first, primary L "Add n items"; edit = compact Sheet with Fields, Quantity number Field, Unit dropdown, location chips, expiry, Remove, and Save                                                                                                                                                                                                                                                   |
| Recipe · Ingredients `145:2064`, AR `166:5975`, Dark `170:5252`; Steps `145:2194`; Watch how `145:2274`; I cooked this `145:2468`           | `recipe/[id]/index.tsx`                                                                 | photo 260 with media back/bookmark buttons, `display` title, meta row, Segmented Ingredients/Steps/Video, ingredient rows / steps / YouTube player, sticky primary "Start cooking"; cooked = Sheet with Stars + primary                                                                                                                                                                                                                                                                                                    |
| Cook mode · dark `145:2365`                                                                                                                 | `recipe/[id]/cook.tsx`                                                                  | always dark via the scoped theme override (§11) around the whole route, including its loading/error states: step n of m, `hero` step text, Progress, timers, prev/next buttons, hands-free mic                                                                                                                                                                                                                                                                                                                             |
| Account `149:2731`, AR `166:6176`, Dark `170:5364`                                                                                          | `account.tsx`                                                                           | Avatar 56 + name/email row → profile, then ListRows grouped per F §4.2 under section heads, credits value, ghost danger Sign out, version `small`                                                                                                                                                                                                                                                                                                                                                                          |
| Preferences `149:2900`                                                                                                                      | `profile.tsx`                                                                           | Fields, dietary Chips, Stepper people, allergens, primary Save                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Settings `149:3216`                                                                                                                         | `settings/index.tsx`                                                                    | ListRows + ToggleRows; appearance Segmented System/Light/Dark; language rows; ghost danger "Delete account"                                                                                                                                                                                                                                                                                                                                                                                                                |
| Household `149:3382`                                                                                                                        | `settings/household.tsx`                                                                | household name, invite code (copy), member rows with Avatars                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Credits `155:3117`                                                                                                                          | `ai-usage.tsx`                                                                          | `numeral` balance + free/purchased Stats, usage rows, primary "Buy credits"                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Buy credits `155:3203`, added `155:3272`                                                                                                    | `buy-credits.tsx` → `screens/BuyCreditsScreen.tsx`                                      | credit pack Cards; added = Toast/banner success                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Out of credits `155:3341`, Dark `170:5683`                                                                                                  | out-of-credits state (`components/States.tsx`, `features/credits/LowBalanceNotice.tsx`) | `coins` illustration, `title`, body, primary Buy credits, ghost Not now                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Notifications `155:3426`                                                                                                                    | `settings/notifications.tsx`                                                            | ToggleRows                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Kitchen places `155:3517`, Places · Move `155:3655`                                                                                         | `settings/places.tsx`                                                                   | place rows with drawings; move = Sheet with place rows (drawing, name, `danger` "Move here and remove" subtitle, chevron); a tap moves and removes                                                                                                                                                                                                                                                                                                                                                                         |
| Wellness reminders `156:3467`                                                                                                               | `settings/reminders.tsx`                                                                | ToggleRows + time rows                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Assistant voice `156:3605`                                                                                                                  | `settings/assistant.tsx`, `features/settings/AssistantPersonaPicker.tsx`                | intro `body` `textMuted`; one `Card`-like bordered block per existing persona (40 Avatar initial, `bodyStrong` name + `caption` dialect, `caption` description); selected = 1.5 `text` border + `check` "Selected" in `primaryText`; info banner (existing disclaimer copy). Same persona data and persistence — no new settings                                                                                                                                                                                           |
| Send feedback `156:3683`, Thank you `156:3746`                                                                                              | `settings/feedback.tsx`                                                                 | Chips category, Textarea, primary Send; thanks = EmptyState `check`                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Delete your account `156:3806`                                                                                                              | `settings/delete-account.tsx`                                                           | consequences list, confirm Field, **destructive** fill button (the only one)                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Assistant · Text `159:3668`, Chat `159:3769`, Voice `159:3855`, Live `159:3971`, Mode `159:4103`, Add spotted `159:4193`, Paused `159:4294` | `assistant.tsx`, `features/assistant/*`                                                 | header: close, Mama avatar + "Mama · Demo" + status dot, more; demo banner (`isMock`); Bubbles; Composer; voice = Waveform + big mic; live = media camera + detection chips + "Add to kitchen" sheet (never auto-writes); mode = Sheet with rows                                                                                                                                                                                                                                                                           |
| Cooking timers `161:4012`, New timer `161:4123`, empty `161:4274`                                                                           | `timers.tsx`                                                                            | Timer cards; new = Sheet with "What is cooking?" Field, plain Minutes number Field, Start timer, and Cancel; empty = EmptyState `timer` with compact New timer action                                                                                                                                                                                                                                                                                                                                                      |
| Wellness nudges `161:4326`                                                                                                                  | `wellness.tsx`                                                                          | nudge Cards with `droplet` / `activity` / `sun`, ToggleRows                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Kitchen screen `161:4424`, wide `161:4497`, tablet `161:4554`                                                                               | `screen.tsx`                                                                            | kiosk: large clock `numeral`, tonight card, timers, use-soon rows; wide/tablet = 2–3 columns                                                                                                                                                                                                                                                                                                                                                                                                                               |

### §9.1 Implementation notes

- Welcome/auth: password reveal controls and six-box invite entry were omitted; the existing auth
  fields and single invite-code field remain.
- Home: the offline banner remains the existing global banner rather than a duplicate Home-local
  banner; the assistant search row opens `/assistant` and does not add separate mic behavior. By
  user ruling, labelled **Chat / Voice / Live** shortcut buttons (`AssistantModeShortcuts`,
  `secondary` size S) sit directly under that row and open `/assistant?mode=text|voice|live`: the
  search-style row alone did not read as the way into the chat, and Live mode had no entry at all.
- Kitchen/item/places: item quantity stays on the page as an append-only adjustment; item history
  does not invent unavailable source prose; unit/location editing keeps existing chip selection.
- Kitchen: By user ruling (2026-09-29), the “Use these first” header action is a coral “Sort”
  control that opens the existing sort sheet, replacing the previous see-all scroll behavior to
  match the Kitchen frame.
- Plans: “Suggest another” and “Change meal” are one regenerate action; shortfall “Add to list”
  keeps the existing navigation-to-shopping behavior; default meal slots remain
  Breakfast/Lunch/Dinner. By user ruling (2026-09-29), plan generation leaves the Generate
  screen after the job starts and shows the generating/failure states inside the Plans tab while
  polling the existing job.
- Shop: the purchased-section “Clear” / bulk missing action was omitted because no existing
  plan-specific bulk-add or clear behavior was present.
- Capture/review: the review row uses plain location meta rather than a place chip; the barcode
  flash slot was added; receipt credit-quote sample copy was omitted because no quote behavior
  exists. By user ruling (2026-09-29), the capture results/looking/nothing-found post-shutter
  surface uses the Coral full-bleed bottom sheet layout, but the Apricot add-all confidence/location
  gate remains unchanged: "Review first" + "Add all n" appears only when `canAddAll`, otherwise the
  sheet shows a single "Review". By user ruling (2026-09-29), the Review header removes the trailing
  "Retake" action; photo users can still leave with Back and retake from the capture results refresh
  control.
- Capture/review/timers: user rulings R1–R3 chose the frame controls: Timers New uses text fields
  instead of the duration stepper/preset chips; capture Review rows are flat while Assistant
  add-spotted keeps the richer existing rows; capture Manual add and Review edit use a Quantity
  number Field plus Unit dropdown, while Kitchen item edit keeps its existing unit chips.
- Recipe/cook: recipe hero height follows the frame at 280pt, not the 260pt note; bookmark/share
  and cooked-sheet stars were omitted because no existing behavior or contract field supports them.
  By user ruling (2026-09-29), the recipe hero has no top media band, the compact recipe header and
  tabs fade in only after the hero clears them, the servings stepper lives in a Servings sheet opened
  from the Serves meta cell, and cook pause/resume/stop use the existing timer update route. Per-step
  ingredient chips remain only where the existing step-to-ingredient matcher finds data; no new source
  is invented for missing chips.
- Plans: By user ruling (2026-09-29), the meal entry opens as an iOS `formSheet` over Plans with the
  frame header, one "Keep this meal" footer action, no servings stepper, and the existing Change meal
  regenerate row; the separate "Suggest another" frame row remains covered by the one-regenerate
  note above.
- Account/settings: Twemoji attribution is no longer visible. By user ruling (2026-09-29), the
  Account frame governs the sign-out treatment, so Sign out is an outlined danger button rather
  than the earlier table's ghost danger wording. By user ruling (2026-09-29), Household exposes the
  existing `leaveHousehold` route behind a destructive confirmation, clears or switches the active
  household on success, and routes household-less users to the existing create/join onboarding.
  Feedback category chips remain omitted because the existing mobile flow does not expose them.
- Credits: out-of-credits appears as a sheet over Generate plan by user ruling; the shared
  `OutOfCreditsPanel` is also reused inline by `ErrorState`.
- Assistant: add-spotted keeps the richer existing `ReviewList`; captions remain in Voice/Live
  controls, and live mode uses the real camera/permission gate rather than a static mock photo.
- Timers/wellness/kiosk: timer +1 minute remains; inline wellness reminder toggles and new
  recipe/inventory kiosk queries were not invented where existing behavior/data was absent.

## §10 RTL and Arabic

F §11 stays: logical style keys only (`marginStart`, `paddingEnd`, `start`/`end` — ESLint
rejects the physical ones), `DirectionalIcon` for §7.2's directional set, and row layouts that
follow the writing direction. J additions:

- Quantities that mix digits and Arabic units are wrapped in a first-strong isolate
  (`\u2066…\u2069`) by the existing formatter — never concatenate a raw fraction into Arabic text.
- The tab bar order mirrors (Home at the right); the scan key stays centred.
- The status dot sits at the logical start of its word; the item-row trailing column is
  end-aligned in both directions.
- Arabic uses the Arabic line heights in §6 — no per-screen overrides.

## §11 Dark mode

Dark is the same layout with the dark column of §5.1. No shadows; every `Card` shows its
`cardEdge`. Media surfaces are unchanged. `StatusBar` style follows the resolved mode (light
content on dark), except over media where it is always light.

**Scoped mode override.** `useTheme` today has no provider: it resolves the mode from the
persisted preference and the phone. C1 adds a `ThemeModeOverride` context
(`theme/ThemeModeOverride.tsx`, default `null`). `useTheme` uses the override when one is set, and
otherwise falls back to the preference exactly as it does today. The user's setting is never
written.

Cook mode wraps its entire route in `<ThemeModeOverride mode="dark">`, including the loading and
error returns and any nested sheet or assistant UI, and mounts a light-content `StatusBar`. That
makes cook mode always dark whatever the preference. `resolveThemeMode` stays pure and its tests
stay unchanged; add tests for the override precedence.

## §12 Accessibility

F §12 stays. J adds: every icon-only control (tab slots, icon buttons, stepper, checkbox,
toggle, stars) has an `accessibilityLabel` and role; selection is exposed through
`accessibilityState` (never colour alone — chips and segments already show a label; status
always shows a word). Minimum contrast is enforced by `palette.spec.ts` (§14). Illustrations and
the glyphs inside labelled controls are hidden from assistive tech.

## §13 Motion

Short and physical, no bounce: presses dim to 0.85 opacity (or `primaryPressed`) in 80ms;
selection cross-fades 120ms; the toggle knob slides 160ms; sheets rise with the existing spring;
the count badge keeps its pop. Everything respects Reduce Motion (as the existing animated views
already do) by switching to a 0ms change.

## §14 Guards and tests

Kept and passing unchanged in intent — contrast (`palette.spec.ts`), 44pt targets and raw line
heights and keyboard avoidance (`token-usage.spec.ts`), Arabic never letter-spaced and Latin
tracking present (`typography.spec.ts`), no physical-direction style keys (ESLint), no hex
outside `palettes.ts`, media tokens identical in both modes, scrim geometry.

Rewritten for J (the F rule they encoded is gone, so the J rule replaces it — never a weaker
check of the same property):

- `palette.spec.ts`:
  - `SURFACES` stays `bg surface surfaceAlt`.
  - The tint, hero-gradient, recipe-thumb-tone and tint-rotation blocks keep passing against
    the interim values (§5.3) and are deleted in C16 with the members they cover.
  - The switch-track test uses `control` against `surface` and against the `onFill` knob
    (`NATIVE_SWITCH_THUMB` becomes the J knob, `#FFFFFF`).
  - **"surface is visibly separate from bg" is replaced by "a card is visibly separate from the
    page".** J light cards are white on white by design, so fill distance alone can no longer
    carry the rule. Its intent, that a card must never vanish, is kept per mode and made stricter:
    - fill distance ≥ 12; **or**
    - a `cardEdge` at distance ≥ 12 from `bg` **and** from `surface`; **or**
    - a card shadow with opacity ≥ 0.05 (light).

    `surfaceAlt` keeps its own fill-distance assertion unchanged. A companion assertion pins
    dark `shadowFor` to opacity 0 **and** `elevation` 0 for every key, so Android draws no
    shadow that the dark cards' `cardEdge` was meant to replace.

  - Add these minimums:
    - `onFill` on `primary` and on `primaryPressed` ≥ 4.5
    - `onInverse` and `onInverseMuted` on `inverse` ≥ 4.5
    - `primaryOnInverse` on `inverse` ≥ 4.5
    - `control` on `bg` and on `surface` ≥ 3
    - `primary` on `bg` ≥ 3
    - `textMuted` on `primarySoft` ≥ 4.5
    - `border` separates from `bg` by distance ≥ 12
    - `primaryText` on `surfaceAlt` ≥ 4.5
- `typography.spec.ts`:
  - The button tier is 700 at 15.
  - Line heights are asserted as explicit values (`en body 22`, `ar body 26`) instead of
    multipliers.
  - Tabular numerals are still asserted in both locales, and `resolveFontFamily` must return
    `Outfit-Medium` for `numeral` and `numeralSmall` in `en` and `ar`.
  - The variant list includes the **six** new variants: chrome (capped at 1.6) for
    `buttonSmall small eyebrow tab`, content (uncapped) for `bodyLarge numeralSmall`.
- `token-usage.spec.ts`:
  - `TOUCH_TARGETS` keeps every entry and its ≥ 44 assertion. When a control is restyled, its
    pattern moves to the 44 Pressable dimension (§5.4).
  - The Field-only extra assertion changes from the F auth box (56) to the J box: ≥ 48, still on
    top of the global ≥ 44.
  - **Add** entries for `IconButton.tsx`, `Checkbox.tsx`, `Toggle.tsx` and `SearchField.tsx`.
  - **Add** a sweep that fails on `borderRadius` set to anything but `0`/`radius.none`, or
    `radius.shutter` in `features/capture/Shutter.tsx` only.
  - **Add** a sweep that fails on `textTransform: 'uppercase'`.
- `lib/information-architecture.spec.ts` asserts F screen details (butter timer tiles, the
  ember `Card` hero on the smart screen, and so on). Each screen group rewrites the assertions
  for **its** screens to the J equivalent: the same structural intent, such as "timer controls
  stay individually focusable" or "countdowns use the numeral variant", with the J primitive
  names. It deletes only assertions about a device J removed (a tint, the gradient).
- `visual-rhythm.spec.ts`, `controls.spec.ts`, `button-tones.spec.ts`, `field-tones.spec.ts`,
  `tile-layout.spec.ts` and `recipe-thumb.spec.ts` are updated to J tones and geometry by the
  group that restyles the primitive they cover. A test is removed only together with the thing
  it tests.
- New: `glyphs.spec.ts` (every glyph has ≥ 1 path, coordinates within its box, every legacy alias
  targets an existing glyph, the directional set exists), `illustration.spec.ts` (stroke width by
  size), `food-illustration.spec.ts` (every food key and every category resolves to a drawing).

## §15 Implementation order

Branch `feat/mobile-coral`, stacked on `feat/mobile-redesign-screens` (#58). One implementer per
group, test-first, each followed by a review; ledger in `.superpowers/sdd/coral/progress.md`. The
workspace stays green (`pnpm turbo run typecheck lint test --filter=@kitchen/mobile`) after every
group.

1. **C1 Foundation** — §5, §6, §11: the palette with its new tokens, the deprecated interim
   members (§5.3; nothing is deleted yet), radius 0, shadows, `gutter`, the type scale, Tajawal
   text with Outfit Medium numerals (`fonts.ts`, `font-loader.ts`, `app.json`, fonts README),
   `ThemeModeOverride`, and the guards.
2. **C2 Glyphs** — §7: react-native-svg, glyph modules, `Icon`, `DirectionalIcon`,
   `Illustration`, `FoodIcon`, aliases, glyph tests.
3. **C3 Controls** — §8 actions + inputs: Button, IconButton, OAuthButtons, Field/DateField,
   SearchField, SegmentedControl, Chip, QuantityStepper, Checkbox, Toggle/ToggleRow, StarRating.
4. **C4 Structure** — §8 status, identity, navigation: Badge/CountBadge, Progress, Toast,
   banners, States, Avatar/AccountButton, TabBar, TabHeader/Header, Sheet, SectionLabel,
   ListRow/ListGroup, Card, Tile/Bento, RecipeThumb, CreditBalance, AuthLayout.
5. **C5–C15 Screens** (§9), one group each:
   - C5 Welcome + auth
   - C6 Home
   - C7 Kitchen + item (with ProductReview) + settings/places
   - C8 Plans + generate-plan + plan/[id] + entry/[id] (the meal)
   - C9 Shop
   - C10 Capture + review
   - C11 Recipe + cook
   - C12 Account + profile + the remaining settings pages
   - C13 Credits
   - C14 Assistant
   - C15 Timers + wellness + kitchen screen

   Each group moves its screens off the deprecated members and updates its IA-spec assertions.

6. **C16 Sweep** —
   - Delete: the aliases, `RoundButton`, `Fab`, `OrbMascot`, `Ring`, the emoji assets and the
     icon credit line, the deprecated palette members and `recipe-thumb-tones`, the radius F
     keys, and the guards that only covered deleted things.
   - Add the radius and uppercase sweeps.
   - Update the docs.
7. **Verify** —
   - Rebuild the iOS dev build (pods for svg).
   - Check every frame in the Simulator in light.
   - Then check Home, Kitchen, Plan, Shop, Recipe and Account in dark and in Arabic.
   - Fix what you find, run a final review, and open the PR with Figma-vs-Simulator media.

## §16 Out of scope

Web (`apps/web`) and its tokens; API and contracts; new features or copy beyond what the frames
need; Android-specific polish beyond `elevation`; pruning dead i18n keys; custom brand fonts
beyond the vendored Tajawal; animated illustrations.
