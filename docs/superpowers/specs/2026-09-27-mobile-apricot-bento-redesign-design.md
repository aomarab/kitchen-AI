# Mobile redesign: "Apricot Bento"

**Date:** 2026-09-27
**Status:** direction approved (F, chosen from six directions explored in Figma over two rounds).
Spec under review.
**Surface:**

- `apps/mobile`: tokens, fonts, primitives, IA and every screen.
- One **additive** vision contract field (§10) and the API work behind it.

The web app does not change. It compiles unchanged against the widened type.

**Supersedes, for mobile only:**

- The mobile colour table, the card tints, the hero gradient and the app shell in
  `2026-07-27-slack-inspired-ui-design.md`.
- The three-family theme picker that grew out of that spec.
- The always-dark cook screen.
- The always-dark Text and Voice modes of `2026-08-28-mobile-live-assistant-design.md` (§9.5).

These principles from the Slack-inspired spec still apply:

- Status is never the brand colour.
- Tints are solid tokens, not opacity.
- Contrast is measured, not eyeballed.
- Arabic gets no letter-spacing.

The live-assistant honesty rules (its §4) apply unchanged.

**Figma:** [Mama's Kitchen — Round 2, Assistant style](https://www.figma.com/design/2qQOglGHfyF3H3h0kxsQYZ?node-id=28-2),
row F. This spec follows those frames:

| Frame                    | Node     | Frame               | Node     |
| ------------------------ | -------- | ------------------- | -------- |
| F1 Welcome               | `37:138` | F5 Mama (assistant) | `39:11`  |
| F2 Home                  | `37:196` | F6 Kitchen          | `39:133` |
| F3 Live scan             | `38:2`   | F7 Home, Arabic RTL | `40:2`   |
| F4 Scan results (review) | `38:93`  |                     |          |

Rows D (Periwinkle) and E (Mint) on the same page, and all of round 1 on page `0:1`, stay in the
file as rejected alternatives. There are no dark-mode mocks: dark is derived here (§6.2), and so
are the unmocked screens (§9.7).

## §1 Summary

The app keeps every feature and changes how it feels. The brief was _easy and premium_. Apricot
Bento gets there in three ways:

- **Summaries become bento tiles.** The top of each main screen is a handful of large, rounded,
  softly tinted tiles. Each one answers a question at a glance: what's for dinner, how much is at
  home, what to use first. Big numerals do the talking.
- **One warm accent does the work.** Coral marks the single thing to do on a screen: the primary
  button and the camera. Everything else is ink on cream, white, butter or sage.
- **Mama gets a face.** A small gradient orb with capsule eyes appears wherever the AI acts: the
  assistant, the scan and credits. It is the product's character, not a decoration.

The camera flow becomes the centrepiece. After a photo is analysed, pins land on the items in the
still, one per item ("Vine tomatoes · 6"), and Mama offers to add them. The pins use real positions
from a new optional box on the vision output (§10). When a box is missing, the item falls back to a
chip tray.

The tabs become **Home · Kitchen · [camera] · Plan · Shop**. "More" goes away, and everything it
held moves to an **Account** screen behind the avatar.

## §2 Scope

**In:**

- **Tokens.** One palette, "Apricot", in light and dark. It replaces the six family palettes.
  Light / Dark / System is kept.
- **Fonts.** Outfit, vendored (§7).
- **Type.** A new scale.
- **Primitives.** New ones: bento `Tile`, `OrbMascot`, `ArPins`, chat `Bubble`,
  `Composer`. Restyled ones: `QuantityStepper`, `Button`, `Chip`/`Badge`, `SegmentedControl`, `Sheet`, `Card`,
  `TabBar`, headers and inputs.
- **Navigation.** The new tab bar and IA, plus the new Account screen.
- **The six mocked screens** (F1–F6). F7 is the RTL proof.
- **The derived screens** (§9.7): Plan, Shop, Recipe, Cook, Account, Settings, auth, item and
  entry, credits, timers, wellness and smart screen.
- **Vision boxes** (§10): an optional normalised bounding box on the vision output. The API asks
  for it, sanitises it and passes it through, and mobile draws pins from it.
- **The live assistant** (`/assistant`) restyled into the F5 chat look. This is a re-skin of the
  existing Text, Voice and Live modes, not a new feature.

**Out:**

- Web. It keeps its own tokens, and web adopting Apricot needs its own spec.
- A new text-chat capability. The assistant's transport, modes, mock and demo badge are unchanged.
- Boxes, pins or any positional overlay on the **live** assistant camera. The live-assistant spec
  §4 forbids that because it would imply real vision.
- Live, on-device tracking of items in the viewfinder. Pins are placed on the captured **still**,
  after the real recognition result returns (§9.3).
- New native dependencies. That excludes blur (`expo-blur` is not a dependency, so "frosted"
  surfaces are solid translucent fills) and haptics (no `expo-haptics`).
- The app icon, splash and Android adaptive-icon colours, which stay as they are in v1 (§16).

**Data rule:** every screen renders data the app already fetches. Where a mock shows a field the
contract doesn't carry, the element is dropped rather than growing the contract. Examples:

- F2's bell (there is no notification inbox).
- F5's recipe card (assistant turns are text only).
- F6's "From scan" provenance (inventory items don't carry their source).

The one deliberate contract addition is the vision box (§10), which the user chose explicitly.

**Honesty rule:**

- A pin is only drawn from a box that a real model returned.
- Mock vision returns no boxes (§10.5), so mock mode always shows the chip tray.
- The assistant's demo badge stays.
- Nothing is written to the inventory until the user confirms.

## §3 Decisions

- **Direction:** **F · Apricot Bento**. The user's pick from D / E / F. It is the warmest, and its
  tile grammar turns a busy home screen into a few answers.
- **Theme picker:** **Apricot only.** Keep Light / Dark / System, retire violet, terracotta and
  green. One brand hue keeps "coral = do this" meaningful. Mode stays because it is an accessibility
  preference, not a brand one.
- **Dark mode:** **Derived warm dark** (§6.2), covering the whole app. The user chose dark for all
  screens. It is computed and guarded, not mocked.
- **Cook mode:** **Follows the theme**. The old always-dark cook screen was the one surface that
  ignored the user's mode.
- **Camera and media surfaces:** **Always dark**. Viewfinders, the captured still, the Live
  assistant camera and the YouTube player are dark content. The `*Inverse` group keeps that role
  (§6.4).
- **Coral label:** **Always ink, never white**. White on the mock's coral measures 2.83:1. Ink on
  coral clears AA (4.94 light, 5.91 dark).
- **Light-mode coral:** **`#F05A2B`**, nudged from the mock's `#FF6B3D`. `#FF6B3D` is 2.83:1 against
  white, under the 3:1 fill-separation guard. `#F05A2B` is 3.39:1 and still carries ink at 4.94.
  Dark mode keeps `#FF6B3D`, which is 6.10:1 on its surface.
- **Latin font:** **Outfit**, vendored static cuts 400/500/600/700. It is the mock's face and gives
  the geometric, premium tone. Vendored like Tajawal, so there's no CDN and no first-launch fetch.
- **Arabic font:** **Tajawal**, unchanged. Baseline spec §7, and already vendored.
- **Mama orb:** **Bundled PNG body plus drawn eyes**. Blurred radial blobs need either blur or SVG
  filters, and neither is a dependency. The eyes are Views, so they can blink and change state.
- **AR on scan results:** **Pins from optional model boxes, with a chip-tray fallback**. The user's
  choice. Boxes are optional in the contract, so old servers, receipts and barcodes, low-quality
  boxes and mock mode all degrade gracefully.
- **Assistant chat:** **Restyle the existing assistant**. The user's choice. Turns become bubbles
  and the composer becomes the F5 input bar. No new capability.
- **"Add all" from the camera:** **Offered only when every item is confident**. Baseline §5.1 says
  recognition returns a review list and never auto-commits. "Add all" is a user confirmation of what
  the pins show. Any unsure item routes the user to review instead.
- **Unmocked screens:** **Derived in §9.7, no further mocks**. The user's choice.

## §4 Information architecture

### §4.1 Tabs

The tabs are `Home · Kitchen · [camera] · Plan · Shop`. The centre camera keeps its own column,
which is the reason `TabBar` exists, and it still pushes `/capture`.

Route files keep their names, so URLs and every `router.push` stay valid. Expo Router groups don't
change URLs, so moving `shopping.tsx` into `(tabs)/` keeps `/shopping`.

| Tab     | Label key                        | Route file                                         | URL                     |
| ------- | -------------------------------- | -------------------------------------------------- | ----------------------- |
| Home    | `mobile.tabs.home` (existing)    | `app/(tabs)/home.tsx`                              | `/home`                 |
| Kitchen | `mobile.tabs.kitchen` (existing) | `app/(tabs)/kitchen.tsx`                           | `/kitchen`              |
| Camera  | `mobile.tabs.capture` (existing) | pushes `app/capture/index.tsx`                     | `/capture`              |
| Plan    | `mobile.tabs.plan` (new)         | `app/(tabs)/plans.tsx`                             | `/plans`                |
| Shop    | `mobile.tabs.shop` (new)         | `app/shopping.tsx` → **`app/(tabs)/shopping.tsx`** | `/shopping` (unchanged) |

`app/(tabs)/more.tsx` is deleted. Notifications carry only a `kind` and never route
(`lib/notification-scheduler.ts`), so nothing deep-links to it.

### §4.2 Account (new, `app/account.tsx`)

The avatar is a `RoundButton` (§14) with a 36pt circle showing the user's initial on `primarySoft` in
`primaryText`, inside a 44pt hit area. It sits at
the trailing end of the header row on Home, Kitchen, Plan and Shop, and tapping it pushes
`/account`. Account is a stack of white group cards that holds every row "More" held, with nothing
removed:

| Group         | Rows (existing destination)                                                                              |
| ------------- | -------------------------------------------------------------------------------------------------------- |
| _(header)_    | Name and email → `/profile`                                                                              |
| Household     | Household → `/settings/household` · Credits → `/ai-usage`, with the spendable balance as the row's value |
| Kitchen tools | Smart screen → `/screen` · Timers → `/timers` · Wellness → `/wellness`                                   |
| Preferences   | Notifications → `/settings/notifications` · Settings → `/settings`                                       |
| _(footer)_    | Sign out (ghost button) · app version · icon credit line                                                 |

The icon credit line is required by the CC-BY licence that the bundled food artwork ships under
(see `more.tsx`). It must move with the rest of the footer. The screen title adds
`mobile.account.title`, and every row reuses the key `more.tsx` uses today:

- `mobile.more.profile`, `.household`, `.credits`, `.notifications`, `.settings`, `.signOut`,
  `.appVersion` and `.iconCredit`
- `mobile.screen.entry`, `mobile.timers.entry` and `mobile.wellness.entry`

`mobile.more.shopping` is no longer rendered, because Shop is a tab.

The group names above describe the grouping; the cards carry no headings, so they add no keys. The
header row shows the name and email, and its accessibility hint is `mobile.more.profile`
("Preferences"), the screen it opens.

### §4.3 i18n

The catalogs are append-only per namespace (copilot instructions, "i18n and RTL"), so this redesign
**adds and never deletes or rewrites**.

- **Add** to `mobile.en.ts` and `mobile.ar.ts`: `mobile.tabs.plan`, `mobile.tabs.shop`,
  `mobile.account.title`, and the new copy named in §9. Every new key is listed in the screen that
  introduces it, and the Arabic is written natively, not translated word for word.
- **Leave in place** the keys that stop being rendered: `mobile.tabs.plans`, `mobile.tabs.more`,
  `mobile.more.title`, `mobile.more.shopping`, the welcome feature trio (`mobile.welcome.snap*`,
  `plan*`, `waste*`), `mobile.review.hint`, and any theme-family names. Only their code references
  go. Pruning dead keys is a separate, coordinated catalog change and is not part of this work.
- **New copy replaces changed copy.** F4's "Nothing is saved until you add it." is a new key,
  `mobile.review.savedOnAdd`, rather than a rewrite of `mobile.review.hint`.
- The server contributes no copy. The vision box change (§10) adds no error codes.

## §5 Principles

1. **Tiles for answers, lists for collections.** A main screen opens with two to five bento tiles
   that summarise. Long collections stay as lists, because a 120-item grid is not easy. That covers
   the full inventory, shopping items, plan meals and recipe steps.
2. **Coral means "do this".** The coral fill marks the one primary action on a screen, plus the
   camera button. Its label is always ink (`onFill`).
3. **Tile colour follows role.** Each tint has one job:

   | Tint    | Means                                | Examples                                 |
   | ------- | ------------------------------------ | ---------------------------------------- |
   | butter  | what you have: counts and quantities | "32 items at home", "18 in the fridge"   |
   | sage    | freshness and planning               | "Fresh for 5 more days", "Plan my week"  |
   | apricot | capture and actions                  | "Scan a receipt", the unsure-item prompt |
   | plain   | an item                              | white in light mode, `surface` in dark   |

   Status (fresh, use soon, expired) never becomes a tile fill. It stays as status-coloured text or
   a status chip.

4. **Mama is the orb.** The orb appears where the AI acts: the assistant, the camera's
   looking/result state, credits and cook mode's hands-free control. The only other place is the
   Welcome collage, where it introduces her.
5. **Numbers over sentences.** A count is set in `numeral`, with a short caption under it
   ("32 / items at home"). No caption repeats its number, and no subtitle repeats its title.
6. **Photography is real food.** Recipe images come from the media-resolution pipeline. When none
   resolves, the `RecipeThumb` placeholder or the ember hero gradient (§6.4) stands in. Text over a
   photo sits on the scrim and is white only (§6.4).

## §6 Tokens (`apps/mobile/src/theme/palettes.ts`)

The `PaletteColors` shape is kept, which avoids churn across every component. `Palette` gains these
members:

- `colors.onDanger`, the label on a `danger` fill
- `colors.onSuccess`, the tick/label on a `success` fill
- `colors.switchTrackOff`, the off-state track for native switches
- `scrim`, a structured gradient object defined in §6.4

`onFill` now labels `primary` and `primaryPressed` only, because a coral fill takes an ink label
while the light danger fill takes white.

### §6.1 Apricot light

| Token            | Value                 | Role                                                                                |
| ---------------- | --------------------- | ----------------------------------------------------------------------------------- |
| `bg`             | `#F7F3EF`             | Cream page                                                                          |
| `surface`        | `#FFFFFF`             | Cards, plain tiles, tab bar                                                         |
| `surfaceAlt`     | `#F1EAE4`             | Sunk fills: segmented track, composer, stepper "−", search                          |
| `border`         | `#E6DCD3`             | Hairlines (decorative; separation is by fill)                                       |
| `text`           | `#2A1A12`             | Ink                                                                                 |
| `textMuted`      | `#6F6056`             | Captions and **inactive tab labels** (the mock's `#8A7A70` is 4.12:1 and dropped)   |
| `primary`        | `#F05A2B`             | Coral fill                                                                          |
| `primaryPressed` | `#E95424`             | Pressed coral                                                                       |
| `primaryText`    | `#B83D0C`             | Headline keyword, links, active tab                                                 |
| `primarySoft`    | `#FFE9E0`             | Apricot soft fill                                                                   |
| `switchTrackOff` | `#7A6A60`             | Native switch off track                                                             |
| `onFill`         | `#2A1A12`             | Label on `primary` / `primaryPressed`                                               |
| `onDanger`       | `#FFFFFF`             | **New.** Label on `danger`                                                          |
| `onSuccess`      | `#FFFFFF`             | **New.** Tick/label on `success`                                                    |
| `accent`         | `#3F6A36`             | Herb: foreground on sage                                                            |
| `accentSoft`     | `#E3EDDD`             | Sage                                                                                |
| `success`        | `#1C7443`             | Status: fresh / in stock / cooked (darkened from #1E7A46: 4.8:1 on the `sage` tint) |
| `successSoft`    | `#E4F2E9`             |                                                                                     |
| `warn`           | `#9A5B00`             | Status: use soon / running low / to buy                                             |
| `warnSoft`       | `#F8ECDA`             |                                                                                     |
| `danger`         | `#C0341D`             | Status: today / expired; destructive fill                                           |
| `dangerSoft`     | `#FBE5E1`             |                                                                                     |
| `overlay`        | `rgba(42,26,18,0.45)` | Sheet backdrop                                                                      |

`shadowColor #2A1A12`, `shadowScale 1`.

### §6.2 Apricot dark (derived)

Warm, never neutral grey. The page is roasted-cocoa dark and the coral keeps the mock value.

| Token            | Value             | Token         | Value     |
| ---------------- | ----------------- | ------------- | --------- |
| `bg`             | `#16100C`         | `onFill`      | `#2A1A12` |
| `surface`        | `#221913`         | `onDanger`    | `#2A1A12` |
| `surfaceAlt`     | `#2D231C`         | `onSuccess`   | `#2A1A12` |
| `border`         | `#3D3027`         | `accent`      | `#A3CF95` |
| `text`           | `#F7EEE8`         | `accentSoft`  | `#1F2B1B` |
| `textMuted`      | `#BFAFA4`         | `success`     | `#74D29B` |
| `primary`        | `#FF6B3D`         | `successSoft` | `#15291D` |
| `primaryPressed` | `#FF8660`         | `warn`        | `#F2B45E` |
| `primaryText`    | `#FF9A73`         | `warnSoft`    | `#35260F` |
| `primarySoft`    | `#3B2218`         | `danger`      | `#FF8A78` |
| `switchTrackOff` | `#8A7A70`         | `dangerSoft`  | `#3D1C16` |
| `overlay`        | `rgba(0,0,0,0.6)` |               |           |

`shadowColor #000000`, `shadowScale 1.8`. In dark mode, cards and tiles also carry a 1px `border`
edge, the rule `palettes.ts` already documents.

### §6.3 Tile tints (`Palette.tints`)

Each tint ships with its own foreground. `tints` stays an ordered tuple, so `tintIn` rotation keeps
working (the review tiles in §9.4 rotate through it). A new `tintNamed(name)` helper serves
fixed-role tiles (§5.3).

| Name      | Light bg / fg         | Dark bg / fg          |
| --------- | --------------------- | --------------------- |
| `plain`   | `#FFFFFF` / `#B83D0C` | `#221913` / `#FF9A73` |
| `butter`  | `#FFF1C9` / `#7A5200` | `#342A12` / `#F2CD6E` |
| `sage`    | `#E3EDDD` / `#3F6A36` | `#1F2B1B` / `#A8D39A` |
| `apricot` | `#FFE9E0` / `#B83D0C` | `#3B2218` / `#FF9A73` |

### §6.4 Media surfaces, hero gradient, scrim, and the question tile

**Media (`*Inverse`)** is identical in light and dark. It is used for the capture viewfinder and
still, the Live assistant camera, the YouTube player, and controls over photos:

| Token               | Value     |
| ------------------- | --------- |
| `surfaceInverse`    | `#1A120E` |
| `surfaceInverseAlt` | `#3A2B22` |
| `borderInverse`     | `#8A7263` |
| `textInverse`       | `#FFFFFF` |
| `textInverseMuted`  | `#D9C8BC` |
| `primaryInverse`    | `#FFB08F` |
| `onPrimaryInverse`  | `#2A1A12` |

- `primaryInverse` is a light apricot for **labels and ghost controls** on media.
- The shutter and camera buttons stay `primary` coral: 6.53:1 on media, carrying an ink glyph.
- Cook mode no longer uses this group (§3).

**Hero gradient.** `gradientHero` stays as the "ember" ramp `#2A1A12 → #4A2516 → #6A3019`. It is
the backdrop of the Tonight tile when the recipe has no image.

**Scrim (new `scrim` token).** Photo tiles carry a bottom gradient of `rgba(26,18,14,α)`. It is
defined concretely, so the guard and the renderer read the same numbers:

```ts
scrim: {
  rgb: '#1A120E',
  // [position from the top of the tile, alpha]; linear between stops
  stops: [[0, 0], [0.35, 0], [0.6, 0.7], [1, 0.82]],
  textMinAlpha: 0.7,
}
```

A single linear ramp from 0 at 40% to 0.82 at the bottom would only pass α 0.70 in the bottom 9%,
which is too thin for a title and a caption. The knee at 60% gives the **bottom 40%** (88pt on the
220pt Tonight tile). Text on a photo:

- sits only where α ≥ `textMinAlpha`, which is the bottom 40%
- is `textInverse`, never muted

At α 0.70 over a pure-white photo, white text measures 6.89:1. The worst case is asserted (§14).
`Tile` renders the stops with `expo-linear-gradient` (already a dependency for the hero gradient).

**Question tile (inverted).** F4's "Is this olive oil?" tile uses `text` as its fill and `bg` as its
label. It inverts with the mode: ink in light, cream in dark. That measures 15.16 in light and
16.48 in dark. Its answer buttons are:

- **Yes**: filled `bg` with a `text` label
- **No**: a `bg` outline

There is no coral inside it, because coral on the dark-mode cream tile would not separate.

### §6.5 Measured contrast

These values must hold. They are computed with WCAG 2.x relative luminance and asserted by
`palette.spec.ts`.

| Pair                                        | Bar | Light                     | Dark                      |
| ------------------------------------------- | --- | ------------------------- | ------------------------- |
| `text` on bg / surface / surfaceAlt         | 4.5 | 15.16 / 16.73 / 14.05     | 16.48 / 15.08 / 13.41     |
| `textMuted` on bg / surface / surfaceAlt    | 4.5 | 5.46 / 6.03 / 5.06        | 8.88 / 8.12 / 7.22        |
| `accent` on bg / surface / surfaceAlt       | 4.5 | 5.72 / 6.31 / 5.30        | 10.70 / 9.80 / 8.71       |
| `primaryText` on bg / surface / soft        | 4.5 | 5.13 / 5.66 / 4.85        | 9.09 / 8.32 / 7.09        |
| `onFill` on primary / pressed               | 4.5 | 4.94 / 4.59               | 5.91 / 7.04               |
| `onDanger` on danger                        | 4.5 | 5.60                      | 7.30                      |
| `onSuccess` on success                      | 3.0 | 5.79                      | 9.11                      |
| primary / pressed / danger fill on surface  | 3.0 | 3.39 / 3.65 / 5.60        | 6.10 / 7.26 / 7.53        |
| switch track off on surface / native thumb  | 3.0 | 5.17 / 5.17               | 4.19 / 4.12               |
| success / warn / danger on own soft         | 4.5 | 4.63 / 4.65 / 4.64        | 8.37 / 7.99 / 6.66        |
| status as a border on bg and surface        | 3.0 | ≥ 4.84                    | ≥ 7.53                    |
| tint fg on tint (plain/butter/sage/apricot) | 4.5 | 5.66 / 6.16 / 5.24 / 4.85 | 8.32 / 9.24 / 8.77 / 7.09 |
| `textMuted` on each tint                    | 4.5 | 6.03 / 5.36 / 5.00 / 5.16 | 8.12 / 6.65 / 6.96 / 6.92 |
| tint distance from bg (RGB)                 | 12  | 21.5 / 38.9 / 27.6 / 19.7 | 16.6 / 40.2 / 32.2 / 42.9 |
| inverted tile: bg on text                   | 4.5 | 15.16                     | 16.48                     |

The media group is the same in both modes:

| Pair                                  | Bar | Measured |
| ------------------------------------- | --- | -------- |
| text                                  | 4.5 | 18.47    |
| muted                                 | 4.5 | 11.38    |
| `primaryInverse` label                | 4.5 | 10.43    |
| label on `primaryInverse`             | 4.5 | 9.45     |
| lifted surface                        | 1.3 | 1.36     |
| border                                | 3.0 | 4.11     |
| text on lifted                        | 4.5 | 13.56    |
| coral shutter                         | 3.0 | 6.53     |
| hero ramp minimum, `textInverse`      | 4.5 | 10.25    |
| hero ramp minimum, `textInverseMuted` | 4.5 | 6.31     |
| hero ramp minimum, `primaryInverse`   | 4.5 | 5.79     |
| scrim, white text at α 0.70           | 4.5 | 6.89     |

The orb's colours (`#FF8A5B`, `#FF4F81`, `#FFC3A0`, `#FFD166`) live only inside its PNG. They are
illustration, like a photo, and are never used as UI tokens.

### §6.6 Retired

- The three families (violet, terracotta, green), six palettes in all.
- `ThemeFamily`, `THEME_FAMILIES` and `DEFAULT_THEME_FAMILY`.
- `paletteFor(family, mode)`, which becomes `paletteFor(mode)`.
- `Theme.tintFor`, replaced by `tintIn` and `tintNamed`.

**Existing installs:** a user who had picked terracotta or green lands on Apricot. Their Light /
Dark / System choice is kept.

### §6.7 Radius, elevation, spacing, grid

| Radius | Old | New    | Used by                                                           |
| ------ | --- | ------ | ----------------------------------------------------------------- |
| `xs`   | 6   | **8**  | Small tags, location chips inside tiles                           |
| `sm`   | 10  | **12** | Segmented thumb, mini stat tiles inside a card                    |
| `md`   | 14  | **18** | Inputs, search, meal thumbnails, 64pt photo thumbs                |
| `lg`   | 18  | **24** | Group cards (lists), chat bubbles, sheets                         |
| `xl`   | 22  | **28** | Bento tiles, hero tiles, recipe content sheet                     |
| `pill` | 999 | 999    | Buttons, chips, composer (h 60), tab bar (68), camera and shutter |

**Elevation:**

- `shadow.card`: opacity 0.05, radius 12, y 4, elevation 2, in `shadowColor`. Tiles separate by
  fill, so the shadow is barely there.
- `shadow.raised`: opacity 0.14, radius 28, y 12, elevation 8. It is used by the floating tab bar,
  the coral camera, sheets and the orb bubble on the camera.

**Spacing and grid:**

- `spacing` is unchanged. The screen side margin is `lg` (16), and top-level blocks are separated
  by `xl` (24), which satisfies the existing `Screen` rhythm guard.
- The bento grid is two columns with a 12pt gutter. On a 390pt phone a half tile is 173pt wide.
- Tile padding is 16.
- Tile heights:

  | Tile                                  | Height |
  | ------------------------------------- | ------ |
  | small action tile                     | ≥ 120  |
  | count tile                            | ≥ 150  |
  | hero photo tile                       | 220    |
  | review tile (grows with Dynamic Type) | ≥ 168  |

## §7 Typography (`apps/mobile/src/theme/index.ts`, `lib/fonts.ts`)

### §7.1 Outfit

The static Outfit cuts are vendored into `apps/mobile/assets/fonts/`:

- **Files:** `Outfit-Regular.ttf`, `Outfit-Medium.ttf`, `Outfit-SemiBold.ttf`, `Outfit-Bold.ttf`,
  with the family's licence as `OFL-Outfit.txt`. Tajawal's `OFL.txt` stays.
- **Source:** `github.com/Outfitio/Outfit-Fonts`, `fonts/ttf/`, pinned at commit
  `902773808eb372f70fb34e8946dd1ffe604efc79`.
- **Version and licence:** 1.100, SIL OFL 1.1, "Copyright 2021 The Outfit Project Authors".
- **Size:** about 300 KB for the four faces.

These facts were verified by parsing the files:

- The PostScript names are exactly `Outfit-Regular`, `Outfit-Medium`, `Outfit-SemiBold` and
  `Outfit-Bold`, with weight classes 400, 500, 600 and 700.
- Every cut has the `tnum` feature.
- There are no Arabic glyphs, so any Arabic inside Latin UI falls back per glyph to the OS font.

Wiring:

- The four faces are registered by PostScript name in the same `useFonts` call as Tajawal
  (`lib/font-loader.ts`).
- `LATIN_FONTS` and `latinFontFamily(weight)` join `ARABIC_FONTS` and `arabicFontFamily`.
  `resolveFontFamily` returns Outfit for Latin once loaded, and the system font before that, the
  same fallback semantics Arabic already has.
- `assets/fonts/README.md` gains an Outfit section with the provenance above and the same
  re-verify instructions.

### §7.2 Scale

The Latin line-height factor stays 1.35, which fits Outfit's metrics (ascent 1000, descent 260,
1000 UPM). Arabic stays 1.7.

| Variant           | Size / weight | Latin tracking | Tier    | Used for                                                                        |
| ----------------- | ------------- | -------------- | ------- | ------------------------------------------------------------------------------- |
| `hero` _(new)_    | 34 / 600      | −0.68 (−2%)    | content | Welcome headline, scan-result headline, cook step instruction                   |
| `display`         | 28 / 600      | −0.56          | content | Screen titles ("Kitchen", "Let's cook, Layla"), recipe name                     |
| `title`           | 22 / 600      | −0.33          | content | Tonight dish name, sheet titles                                                 |
| `heading`         | 18 / 600      | −0.18          | content | Section heads ("Use soon", "Just added")                                        |
| `body`            | 16 / 400      | 0              | content | Paragraphs, chat bubbles                                                        |
| `bodyStrong`      | 16 / 500      | 0              | content | Tile and row titles                                                             |
| `numeral` _(new)_ | 40 / 700      | −0.8           | content | Tile counts, credit balance, cook timer. Always `fontVariant: ['tabular-nums']` |
| `button`          | 16 / **600**  | +0.1           | chrome  | Pill labels                                                                     |
| `label`           | 14 / 500      | +0.1           | chrome  | Chips, segmented labels, trailing links ("See all")                             |
| `caption`         | 13 / 400      | +0.1           | chrome  | Meta, tile captions, **tab labels** (the mock's 10 is raised to 13)             |

The headline keyword ("beautifully sorted.", "6 things", "Layla") is the same variant in
`primaryText`. Each such string is a pair of i18n keys, never split by string surgery, because
Arabic word order differs.

**Arabic**, all already enforced:

- Every `letterSpacing` is 0.
- 600 promotes to Tajawal Bold.
- The Arabic headline keyword is chosen per language by the pair of keys above.

**`typography.spec.ts` changes.** These are design decisions recorded here, not relaxations:

- "classifies every variant" gains `hero` and `numeral`, both content tier.
- "carries a 700-weight button tier" becomes 600.
- "leaves the content variants uncapped" adds `hero` and `numeral`.
- New: `numeral` carries `fontVariant: ['tabular-nums']` in both locales, and `body` carries none.
  `AppText` passes the token's `fontVariant` through.
- New: `resolveFontFamily('en', true, w)` returns the Outfit face for each of the four weights, and
  `undefined` when not loaded.

The tracking, Arabic and line-height assertions stay unchanged.

## §8 Components

### §8.1 `TabBar`

- **Shape:** a floating capsule, 358×68 on a 390pt screen (side inset 16), radius `pill`, `surface`
  fill, `shadow.raised`, plus a `border` edge in dark mode. It sits 8pt above the home-indicator
  inset, and screens pad their scroll content by bar height plus 16.
- **Layout:** five columns. The centre is the camera, a 60pt `primary` circle with an ink camera
  glyph, raised by `shadow.raised`, that pushes `/capture`. Its accessibility label is
  `mobile.tabs.capture`.
- **Tabs:** a 22pt icon over a `caption` label.
  - Active: `primaryText` icon and label.
  - Inactive: `textMuted`.
  - There is no pill behind the active tab.
- **Direction:** it mirrors in RTL.
- **Translucency:** it is opaque in v1 (no blur).
- **Tablets and the keyboard:** the capsule is capped at the content width, and it hides while the
  Android keyboard is up, where it would otherwise ride above the keys.

### §8.2 `Tile` and `Bento` (new, `components/Tile.tsx`)

`<Bento>` lays out children on the §6.7 grid. `<Tile>` takes these props:

- `span`: 1 or 2
- `tint`: a tint name, or `'photo'`
- `onPress`
- optional `image`, which is rendered under the scrim

The tile is radius `xl`, with `shadow.card` in light mode and a `border` edge in dark mode. A photo
tile has no shadow, because iOS drops the shadow of a view that clips with `overflow: 'hidden'`.

The shared anatomy, top to bottom, is optional at each step:

1. A leading icon in a 36pt circle of `surface` (on tints) or `surfaceAlt` (on plain), with the
   trailing chip or arrow at the top.
2. The `numeral` count.
3. The `caption` line in `textMuted`.

A pressable tile dims to 0.92 and scales to 0.98. It is one accessibility element, whose label is
its full sentence ("32 items at home").

### §8.3 `OrbMascot` (new, `components/OrbMascot.tsx`)

- **Body:** `assets/mama/orb.png`, `@2x` and `@3x`, exported from F5's header orb in node `39:11`
  **with the eyes hidden**. It is a transparent PNG that includes its glow. One asset serves every
  size, from 28 to 120.
- **Eyes:** two white capsule `View`s drawn over the body. Each is 0.11 × size wide and 0.22 × size
  tall, 0.14 × size apart, centred slightly above the middle.
- **States:**

  | State       | Eyes and body                                                  |
  | ----------- | -------------------------------------------------------------- |
  | `idle`      | Blinks every 4–6s                                              |
  | `looking`   | Eyes glance from side to side while recognition runs           |
  | `listening` | Eyes grow to 0.26 and the body breathes (scale 1 ↔ 1.04, 1.6s) |
  | `speaking`  | Body pulses with the assistant's `speaking` event              |

- **Accessibility:** it is decorative (`accessibilityElementsHidden`), unless it is wrapped as a
  button.
- **Reduce Motion and background:** all animation stops under Reduce Motion, and while the screen
  is unfocused or the app is backgrounded.

### §8.4 `Chip`, `Badge`, `QuantityStepper`

- **`Chip`:** a pill of height 32 with `label` text.
  - Default: `surface` fill and `text` label.
  - Selected: `text` fill and `bg` label.
  - Location chip inside a tile: radius `xs`, `surface` fill, `textMuted` label.
  - An unselected chip keeps a `border` edge in both modes, because most chips sit on white cards.
- **`Badge`** (status): a `*Soft` fill with its status text, and the word is always spelled out
  ("Use in 2 days"). A count badge is a 20pt circle with `text` fill and `bg` label. The `inverse`
  status tone is removed: cook mode was its only caller, and it now follows the theme.
- **`QuantityStepper`** (existing, restyled): `−` is a 32pt `surfaceAlt` circle with a `text` glyph, and `+` is a 32pt
  `primary` circle with an ink glyph. Each sits in a 44pt hit area. The value is `bodyStrong` with
  the unit as a caption. Its accessibility role is `adjustable`, with increment and decrement
  actions. `−` is disabled at the minimum.

### §8.5 `Button`

| Variant     | Fill / label                       | Notes                                                  |
| ----------- | ---------------------------------- | ------------------------------------------------------ |
| `primary`   | `primary` / `onFill`               | Height 56, trailing arrow optional (`DirectionalIcon`) |
| `secondary` | `surface` + `border` / `text`      |                                                        |
| `soft`      | `primarySoft` / `primaryText`      | "Review first", "Top up"                               |
| `ghost`     | none / `primaryText`               |                                                        |
| `danger`    | `danger` / `onDanger`              |                                                        |
| `media`     | `textInverse` / `onPrimaryInverse` | On camera and photo surfaces                           |

- Pressing dims to 0.85 and scales to 0.98.
- **All three `*Inverse` button variants are removed:** `primaryInverse`, `secondaryInverse` and
  `ghostInverse`. Cook mode follows the theme, and the old home hero is gone. Every call site is
  migrated:

  | Call site                                                | Today              | Becomes               |
  | -------------------------------------------------------- | ------------------ | --------------------- |
  | `cook.tsx` 85 (exit cook mode)                           | `ghostInverse`     | `ghost`               |
  | `cook.tsx` 95, 132, 219 (ask Mama, previous, step timer) | `secondaryInverse` | `secondary`           |
  | `cook.tsx` 141, 148 (finish, next)                       | `primaryInverse`   | `primary`             |
  | `home.tsx` 124, 130 (hero actions)                       | both               | `media`, then deleted |

  The home hero sits on the ember gradient, a media surface, so its actions move to `media` when the
  variants are removed (Plan 3). Plan 4 then replaces the whole hero with the Tonight tile (§9.2). A
  button on a photo or camera surface uses the new `media` variant.

- The `ButtonVariant` union loses the three members, so any missed call site is a type error, not a
  silent restyle. Cook's `surfaceInverse` backgrounds and `textInverse*` text colours become
  `bg`, `text` and `textMuted` in the same change.

### §8.6 Headers

- **Tab screens:** a `display` title, or F2's two-line greeting: a `caption` "Thursday evening"
  over `display` "Let's cook, Layla". The trailing slot holds one action and the avatar.
- **Pushed screens:** a centred `bodyStrong` title with a 40pt `RoundButton` for back (`surface` fill,
  `DirectionalIcon`) and an optional trailing `ghost` link, as in F4's "Retake".
- **There are no large-title collapse animations.**

### §8.7 `Bubble` and `Composer` (new, `features/assistant/`)

- **User bubble:** `primary` fill with an ink `body` label, aligned to the trailing edge. The corner
  radius is `lg`, except the trailing-bottom corner, which is 8.
- **Mama bubble:** `surface` with `text`, aligned to the leading edge, with a 28pt orb avatar at the
  leading edge of the first bubble in a run. The corner radius is `lg`, except the leading-top
  corner, which is 8.
- **Speaking bubble:** replaces the old speaking indicator. It is a Mama bubble holding an animated
  five-bar waveform in `primaryText`. It is static under Reduce Motion, and its accessibility label
  is `mobile.assistant.speaking`.
- **`Composer`:**
  - A pill of height 60 with `surface` fill and `border` edge.
  - Leading: a camera icon button. It switches to Live mode, and is hidden when `lockMode` is set.
  - Middle: the `TextInput` with placeholder `mobile.assistant.composerPlaceholder`.
  - Trailing: a 44pt `primary` circle. It shows the mic in Voice mode (with mute state) and send
    when the draft is non-empty.

### §8.8 `ArPins` (new, `features/capture/ArPins.tsx`, layout in `lib/ar-pins.ts`)

The overlay drawn over a captured still (§9.3). Each pin has three parts:

- **Anchor:** a 14pt `primary` dot with a 3pt white ring, at the box centre.
- **Leader:** a 26pt vertical line in `textInverse` at 80% opacity.
- **Chip:** `textInverse` fill, `onPrimaryInverse` label "Name · qty", maximum width 160, truncated
  at the end.

A low-confidence item (`isLowConfidence`, under 0.6) differs in two ways:

- its chip reads "Name?" with a `warn` dot instead of the quantity
- its accessibility label says "not sure"

The placement is a pure function, `layoutPins(items, frame, direction)`, unit-tested in
`lib/ar-pins.spec.ts`:

1. Map the normalised box (§10) to the displayed still, which is drawn with `resizeMode="cover"`.
   The crop maths comes from the image and frame aspect ratios.
2. An anchor that falls outside the visible crop, or inside the top control or bottom bubble safe
   zones, **goes to the tray**.
3. The chip goes above its anchor. If it would clip the top safe zone, or overlap a placed chip,
   flip it below. If it still overlaps, nudge it horizontally by up to 40pt, clamped to the frame.
   If it still overlaps, the item goes to the tray.
4. At most **8 pins** go on one still. The rest go to the tray, lowest confidence first.
5. Direction affects only the chip's internal order (dot and label). Positions are image space and
   never mirror.

The tray is a horizontal row of `Chip`s above the Mama bubble, captioned
`mobile.capture.alsoSpotted` ("Also spotted"). It holds:

- items with no box
- items with a rejected box
- items bumped by rules 2–4

## §9 Screens

"Existing" means the data and behaviour already ship, and only the presentation changes. New i18n
keys are named where they are introduced.

### §9.1 Welcome (F1, `(auth)/welcome.tsx`)

**Collage.** A bento collage fills the top half:

- A tall produce photo tile with two static chips ("Tomatoes · 6", "Carrots · 4").
- An apricot orb tile.
- A butter "6 / items spotted" tile.
- A sage "Fresh for 5 more days" tile with a leaf icon.
- A salad photo tile with a "Tonight · 20 min" chip.

The collage is marketing art. It is one accessibility element with the label
`mobile.welcome.collageLabel`. Its strings are i18n keys (`mobile.welcome.collage.*`), and the
chips never claim to be recognition output.

**Headline.** A `hero` headline, `mobile.welcome.headline` + `mobile.welcome.headlineAccent`
("Your kitchen," / "beautifully sorted."), with the accent in `primaryText`. Then `body` in
`textMuted`: `mobile.welcome.subtitle` ("Snap a photo — Mama counts it, dates it and turns it into
dinner.").

**Actions:**

- `primary` "Get started" with a trailing arrow → `/sign-up` (existing key `getStarted`)
- a caption line "I have an account · **Sign in**" → `/sign-in` (existing `haveAccount`, with the
  link in `primaryText`)

The OAuth buttons live on the sign-in and sign-up screens and keep their platform rules.

**Photos.** Two bundled JPEGs, `assets/images/welcome-produce.jpg` and `welcome-salad.jpg`, each
at most 1200px on the long edge and about 150 KB. They are the Unsplash photos `uws50YpXSYc` and
`_vy3L5n8VnI` used in the mock, under the Unsplash License. `assets/images/README.md` records the
provenance.

### §9.2 Home (F2 / F7, `(tabs)/home.tsx`)

**Header.** A caption with the weekday and time of day ("Thursday evening"), then the greeting in
`display`, then the avatar.

- The caption is `mobile.home.dayPart.*`, which has four parts (morning, afternoon, evening and
  night) and takes the weekday.
- The greeting is the new `mobile.home.greetingLead` ("Let's cook,") followed by the user's first
  name in `primaryText`. The name trails in both English and Arabic.
- With no display name, the existing `mobile.home.greeting` ("What should I cook tonight?") shows
  instead.

**There is no bell** (§2 data rule).

**Bento, top to bottom:**

1. **Tonight**, a span-2 photo tile at 220pt:
   - a "Tonight" chip
   - the dish in `title` in white
   - a caption with the total time (`prepMinutes + cookMinutes` from `recipeSummary`) and a
     pantry line
   - a 48pt `primary` play button → `/recipe/[id]/cook`

   **The pantry line** comes from the existing `useRecipe(entry.recipe.id, locale)`. That is the
   same query `/recipe/[id]` uses, so opening the tile afterwards is a cache hit. Its
   `ingredients[].inStock` is populated for the acting household, so the line reads "uses n of
   your items" (`mobile.home.usesYourItems`), where n counts the non-optional ingredients with
   `inStock === true`.

   While the recipe loads, or if it fails, the line falls back to the plan entry's `fullyCovered`:
   "all in your kitchen" (`mobile.home.allInKitchen`) when true, and nothing when false. The tile
   never waits on this query to render.

   Tapping the tile opens `/recipe/[id]`. With no image it uses the ember gradient. With no plan
   for tonight it becomes an apricot tile with `mobile.home.tonightEmpty` and a `primary`
   `plans.generate` → `/generate-plan` (existing).

2. **Kitchen count**, a butter tile: box icon, `numeral` total, caption "items at home"
   (`mobile.home.itemsAtHome`), with a trailing arrow → `/kitchen`.
3. **Mama**, a plain tile:
   - a 44pt orb
   - a `numeral` credit balance with the caption "credits left" (`mobile.home.creditsLeft`), from
     the existing `CreditBalance` data
   - a trailing `soft` chip "Top up" → `/buy-credits`

   The tile itself → `/assistant`, and replaces the existing assistant entry row. Its accessibility
   label is "Ask Mama, 24 credits left".

4. **Use soon**, a span-2 plain tile:
   - a heading
   - a trailing caption with the count
   - up to three mini items (FoodIcon, name, status days in status colour) from the existing
     `expiringWithinDays: 3` query

   The tile → `/kitchen`, filtered to use-soon. With none it shows `mobile.home.expiringNone`.

5. **Two action tiles:**
   - apricot "Scan a receipt" → `/capture?method=receipt`
   - sage "Plan my week" → `/generate-plan`

   When a plan exists this week, the sage tile shows the existing week progress instead ("4 of 21
   cooked", `mobile.home.weekProgress`) → `/plans`.

The old StatTiles, KitchenGlance and WeekStrip strips and the photo and barcode quick-add row are
absorbed:

- Photo is the centre tab.
- Barcode is a mode inside capture.
- Counts and progress live in tiles 2 and 5.

### §9.3 Capture (F3, `capture/index.tsx`, `features/capture/PhotoCapture.tsx`)

This is a media surface (§6.4) and stays dark in both modes.

**Chrome:**

- Top row: close (40pt `surfaceInverseAlt` circle at 80%), then a segmented control of Photo ·
  Barcode · Receipt. The track is `surfaceInverseAlt` and the selected segment is `textInverse`
  with an `onPrimaryInverse` label. Flash is on the trailing side.
- Manual entry leaves the segmented control and is reached from Kitchen's `+` instead
  (`/capture?method=manual`), which renders the existing `ManualAdd` on a normal themed screen.
- Bottom row:
  - a gallery thumb (the existing `fromLibrary`)
  - a 76pt `primary` shutter inside a 4pt white ring; after the first photo it carries a count
    badge for the photos taken
  - flip camera

  Tapping the count badge opens the existing photo tray (thumbnails with remove), which respects
  `maxPhotosFor`.

**Photo flow states:**

1. **Framing.** A caption hint (existing `captureHint`).
2. **Shot taken.** A floating Mama bubble appears above the bottom row:
   - the orb (`idle`)
   - `mobile.capture.anotherOrLook` ("Another angle, or shall I look?")
   - `primary` "Look now" (`mobile.capture.lookNow`)

   The resize (`MAX_IMAGE_EDGE_PX`) and presign order is unchanged.

3. **Looking.** The viewfinder freezes on the last still, and the orb is `looking` with the existing
   `mobile.capture.recognizing`. The upload and recognition job run as today.
4. **Result.** The still stays on screen. With several photos, it becomes a pager with dots, and
   each page holds that photo's pins, since `photoKey` ties an item to its photo. The pins land
   (§13), and the tray fills. The Mama bubble reads `mobile.capture.seeCount` ("I see 6 things")
   plus one of two offers:
   - **Every item confident:** "— add them all?". The actions are `primary` "Add all n"
     (`mobile.capture.addAll`) and `soft` "Review first" (`mobile.capture.reviewFirst`). "Add all"
     builds exactly what Review would have submitted untouched:
     1. `rows = initialReviewRows(session, locations)`, where `locations` comes from the existing
        `useLocations()`
     2. `inputs = buildInventoryInputs(rows, 'photo')`
     3. the existing `useBulkCreateInventory()` with `inputs`

     After a successful write it replaces to `/kitchen` with a toast, "Added n · Review"
     (`mobile.capture.addedToast`), that opens the just-added section.

   - **Any item unsure:** "— 1 I'm not sure about" (`mobile.capture.unsureCount`), with a single
     `primary` "Review" → `/capture/review`.

   "Add all" is offered only when **both** hold:
   - every item has `confidence ≥ LOW_CONFIDENCE`
   - `inputs.length === session.items.length`

   The second rule covers two cases. `buildInventoryInputs` silently drops a row whose `locationId`
   is `''`, which happens when the household has no locations or they have not loaded yet. It also
   drops excluded rows. If either rule fails, the confident branch falls back to "Review" alone, so
   nothing is ever skipped without the user seeing it.

   `isLowConfidence` and `pickLocationForType` already live in `lib/capture.ts`. The gate is a new
   pure helper there, `canAddAll(session, locations)`, with spec coverage.

5. **Nothing found.** The API does **not** return an empty session. When every photo is empty,
   `RecognitionService` throws `AI_NO_RESULT` with `details.emptyPhotoKeys`
   (`recognition.service.ts` 105–107).

   `PhotoCapture.submit` already catches it and would today show a generic error line through
   `captureErrorKey`. The redesign branches before that: an `ApiError` whose `code` is
   `AI_NO_RESULT` keeps the photos and moves the screen to the nothing-found state. In that state
   the orb (`idle`) says `capture.nothingFound`, with a `primary` "Retake" that clears the photos
   and returns to framing. Every other error keeps the existing `captureErrorKey` line.

   The decision is a pure helper, `isNothingFound(error)` in `lib/capture-error.ts`, next to
   `captureErrorKey`. Its spec asserts that `AI_NO_RESULT` is true, and that `PhotoUploadError`,
   `INSUFFICIENT_CREDITS` and a plain `Error` are false.

Tapping a pin opens the review screen scrolled to that item.

**Receipt and barcode.** Receipt mode shows a framing guide and runs the existing receipt job, then
goes straight to review, with no pins (receipt items carry no box). Barcode keeps
`BarcodeCapture`'s logic with the same chrome.

### §9.4 Review (F4, `capture/review.tsx`, `features/capture/ReviewList.tsx`)

This screen follows the theme.

**Header.** Back, a centred "Review", and a trailing `ghost` "Retake" (`mobile.review.retake`).

**Headline.** `hero`: `mobile.review.headline` + `mobile.review.headlineAccent` ("Nice haul —" /
"6 things" / "for your kitchen"), with the accent in `primaryText`.

**Tiles.** A two-column bento, one tile per item, rotating tints by index (`tintIn`). Each tile has:

- a 40pt `surface` circle with the `FoodIcon`
- a trailing location chip (`xs`)
- the name in `bodyStrong`
- an expiry line coloured by status ("Use in 4 days" warn, "Good for 3 wks" success)
- the `QuantityStepper` for quantity

Tapping the tile body opens an edit `Sheet` with name, quantity and unit, location, expiry (the
existing `DateField`) and **Remove**. Together these carry every existing ReviewList capability.

**Unsure items** render as the question tile (§6.4) instead: the orb at 24 with "Not sure", then
"Is this olive oil?" (`mobile.review.isThis`), then **Yes** and **No**.

- **Yes** turns it into a normal tile.
- **No** opens the edit sheet with the name focused and Remove available.

While any question is unanswered, the CTA is disabled and a caption above it reads
`mobile.review.resolveFirst` ("Answer 1 question to continue").

A final dashed `border` tile, "+ Add something" (existing `common.add`), opens the edit sheet empty.
`mobile.review.emptyPhotos` shows as a caption when some photos found nothing.

**Footer.** A sticky `primary` "Add n to Kitchen" (existing `mobile.review.addCount`). Under it, a
caption with an info icon: "Nothing is saved until you add it" (new `mobile.review.savedOnAdd`,
§4.3). The write path is unchanged: append-only events via bulk create.

### §9.5 Mama, the assistant (F5, `app/assistant.tsx`, `features/assistant/LiveAssistantScreen.tsx`)

Text and Voice modes **follow the theme**. Live mode stays a media surface.

**Header:**

- back
- a 36pt orb whose state follows the session (`listening` while live, `speaking` on the event)
- "Mama" in `bodyStrong` over a caption "Your kitchen buddy" (`mobile.assistant.subtitle`), with a
  `success` dot when `live`
- the trailing mode switch, which is the existing Text / Voice / Live segmented control, moved into
  a `⋯` sheet to keep the header calm

The **demo badge stays persistent** under the header whenever `isMock`. It is an apricot chip with
the existing `mobile.assistant.demoBadge`.

**Transcript.** `TranscriptTurn`s render as bubbles (§8.7), and the speaking indicator is the
waveform bubble.

**Empty state.** Three starter `Chip`s in place of `emptyTranscript` (`mobile.assistant.starter.*`:
"What can I make tonight?", "What's about to expire?", "Plan my week"). They send through the
existing `sendText`, which is presentation, not a new capability.

**Dropped from the mock** (§2 data rule): F5's recipe card, and chips like "Swap the eggs". Turns
are text only, and structured replies would be a new feature.

**Composer.** The F5 input bar (§8.7).

**Live mode.** The camera fills the screen with the same media chrome as capture. Detections stay
the labelled "Spotted (sample)" chip row, never pins (live-assistant spec §4). Confirm-before-write
is unchanged.

**Cook's locked-voice overlay.** A bottom sheet with the orb at 72 and the waveform, over the cook
screen.

### §9.6 Kitchen (F6, `(tabs)/kitchen.tsx`)

**Header.** `display` "Kitchen" (existing `inventory.title`), then a search icon button, a 40pt
`primary` `+` (→ manual add, §9.3) and the avatar. Search expands to an inline `surfaceAlt` field
with the existing `searchPlaceholder`.

**Place tiles:**

- The place with the most items is a span-1, double-height butter tile: `numeral` count, caption
  "in the fridge" (`mobile.kitchen.inPlace`), and a trailing `warn` badge "4 soon" when it has
  expiring items.
- The next two places stack beside it as small tiles, sage then apricot.
- A household with more than three places (settings → places) continues the grid in the same
  rotation.

Tapping a place tile filters the list below to it. It then shows as the selected `Chip` in the
filter row, which also holds "All".

**Use these first.** A `heading` with a trailing "See all", then a three-column grid of plain mini
tiles (FoodIcon, name, days left in status colour) from the expiry sort. Up to 6 show. The section
is hidden when there are none.

**Just added.** The six most recent items (existing `sort.recent`) in the same grid. It has no
"From scan" provenance (§2).

**All items.** A group card of rows, keeping the existing sort control (expiry, name, recent) and
the empty state (`inventory.emptyLocation` with `inventory.addItem`). Each row has a FoodIcon, the
name, the quantity and a status badge, and → `/item/[id]`.

### §9.7 Derived screens (no mocks)

These screens are specified in words. Each reuses the primitives above.

**Plan (`(tabs)/plans.tsx`, `plan/[id]`, `generate-plan`)**

- Header: `display` "Plan", then a `primary` `+` → `/generate-plan`, then the avatar.
- Controls: the existing Day / Week / Month segmented control, then a 7-day chip strip. Today is a
  `primary` chip with an ink label, and planned days carry a dot.
- Tiles: a butter "n of N cooked", and a warn-toned plain tile "n to buy" → `/shopping`, from the
  existing progress.
- Day sections: a `heading` per day, then meal rows in a group card. Each row has a 64pt photo
  thumb (`md`), a caption with slot and time, the title and a status `Badge`.
- `generate-plan` is a form of chips and steppers on `surface` cards with one `primary` CTA. The
  job-polling state shows the orb `looking`.

**Shop (`(tabs)/shopping.tsx`)**

- Header: `display` "Shop", then share, then the avatar.
  - **Share** is React Native's `Share.share({ message })`. There is no new route. The message is
    built by a pure helper, `formatShoppingListForShare(items, locale)` in `lib/shopping-share.ts`:
    the unpurchased items, one per line, as localised name, quantity and unit.
  - Share is hidden when nothing is unpurchased. Its spec covers Arabic, and a list with no
    unpurchased items.
- **An inline add field**, styled like the composer (pill, height 56), with a `primary` `+`. The
  add route (`addShoppingItemsRequestSchema`) takes `{ ingredientId, quantity, unit }`, not free
  text, so the field is a catalog picker:
  1. Typing runs the existing `useSearchIngredients(term)`, debounced 250 ms, and shows up to five
     suggestions in a `surface` list under the field. Each shows a FoodIcon and the localised name.
  2. Choosing one calls the existing `useAddShoppingItems()` with
     `{ planId: null, items: [{ ingredientId, quantity: 1, unit: ingredient.defaultUnit }] }`, then
     clears the field. The quantity is edited afterwards on the row.
  3. With no match it shows `mobile.shop.noMatch`. The `+` is disabled until a suggestion is
     chosen, because free-text items are not in the contract, and adding them would be a contract
     change outside this redesign.
- Items sit in a group card with round 24pt checkboxes. A checked box is a `success` fill with an
  `onSuccess` tick (white in light, ink in dark). The `shopping.purchased` group is struck through
  in `textMuted`.
- A sticky `primary` "Move n to Kitchen" (existing `shopping.moveToKitchen`) uses the existing
  write path.

**Recipe (`recipe/[id]/index.tsx`)**

- A full-bleed photo, 360pt, with 40pt white round controls: back and save (heart).
- A content sheet, radius `xl`, overlapping the photo by 28 on `bg`. It holds the `display` name, a
  caption of meta, and three mini stat tiles from F5's card:

  | Tile       | Tint    | Shows          |
  | ---------- | ------- | -------------- |
  | time       | apricot | cook time      |
  | in stock   | sage    | "6 of 7"       |
  | difficulty | butter  | the difficulty |

- Then an Ingredients / Steps segmented control. Ingredient rows carry a FoodIcon and a have or
  missing badge. The existing YouTube player sits under Steps.
- A sticky footer: the servings `QuantityStepper`, and `primary` "Start cooking" with a play glyph.

**Cook (`recipe/[id]/cook.tsx`)**

- It follows the theme, and keep-awake stays.
- Header: close, the dish name with the caption "Step n of N", and a 44pt orb button for
  hands-free. The orb is `listening` while on and opens the locked-voice overlay (§9.5).
- A segmented progress bar: done is `primary`, pending is `border`. It doesn't mirror.
- Body:
  - a `hero` instruction
  - this step's ingredients as chips
  - a butter timer tile: a `numeral` tabular countdown and a `primary` "Start" (existing
    `startStepTimer` and running/done keys)
  - an outlined "Up next" card
- Footer: a back icon button and `primary` "Next" or "Finish".

**Account and Settings (`account`, `settings/*`, `profile`)**

- Group cards (`lg`) of 56pt rows, each with a 36pt `surfaceAlt` icon circle, the label, an
  optional value in `textMuted`, and a chevron through `DirectionalIcon` for detail pages.
- The appearance picker (§14) is a System / Light / Dark segmented control.
- `delete-account` keeps its `danger` CTA with `onDanger`.

**Auth (`sign-in`, `sign-up`, `onboarding`)**

- `bg`, then the orb at 72, then a `hero` headline with an accent keyword.
- Fields: `surface`, radius `md`, height 56, `border` edge, and a `primary` 2pt focus ring.
- One `primary` CTA. The Apple and Google buttons follow their platform rules unchanged.
- Onboarding steps use one chip grid per question, with a `primary` "Continue".

**Item and entry (`item/[id]`, `entry/[id]`)**

- A header tile: a 64pt FoodIcon circle, the `display` name, and mini tiles for quantity
  (`QuantityStepper`), location (chip) and expiry (status badge).
- The event history as rows. The ledger is unchanged.

**Credits and usage (`buy-credits`, `ai-usage`)**

- A butter balance tile with the orb and a `numeral` balance.
- Packs as plain tiles. The selected one gets a 2pt `primary` edge.
- One `primary` purchase CTA. RevenueCat and Apple rules are unchanged.
- The usage list sits in a group card.

**Timers, wellness and smart screen (`timers`, `wellness`, `screen`)**

- Tokens and primitives only.
- Running timers are butter tiles with `numeral` countdowns.
- The smart screen keeps its layout, and its hero uses the ember gradient.

## §10 Vision boxes (contract, API, clients)

This is the one contract change. It is additive and optional, so it is safe in both directions:

- **An old app on a new API** ignores the field. Zod strips unknown keys, and nothing reads it.
- **A new app on an old API** receives no box and uses the tray.

It ships as its own coordinated commit before any screen work (§15). Per the repo rule, that commit
is made centrally, not from an app.

### §10.1 Schema (`packages/contracts/src/ai.ts`)

```ts
/** Normalised to the uploaded image: origin top-left, fractions of width/height. */
export const normalizedBoxSchema = z
  .object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    w: z.number().gt(0).max(1),
    h: z.number().gt(0).max(1),
  })
  .refine((b) => b.x + b.w <= 1 + 1e-6 && b.y + b.h <= 1 + 1e-6, 'box exceeds image');
export type NormalizedBox = z.infer<typeof normalizedBoxSchema>;

/** Model-facing and deliberately loose: sanitised by the API, never trusted as-is. */
const rawBoxSchema = z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() });
export type RawVisionBox = z.infer<typeof rawBoxSchema>;

// visionIngredientSchema gains:
box: modelNullable(rawBoxSchema).catch(null),
// recognizedItemSchema gains:
box: normalizedBoxSchema.nullish(),
```

- **The raw model field is loose on purpose.** A strict 0..1 schema would fail validation on a
  slightly out-of-range number, which triggers the gateway's repair retry and a second full-priced
  call. That is the exact failure `modelNullable` was introduced to avoid. `.catch(null)` extends
  it to a box that is malformed outright (an array, a string, a missing side): the item keeps
  parsing and simply has no box. A position is a nicety, never worth a paid retry.
- **The raw output type makes `box` required** (`RawVisionBox | null`), because the default fills
  it. Typed `VisionResult` literals must therefore spell `box: null`; see §14.
- **The response field is `nullish`,** not `.nullable().default(null)`. That keeps it optional in
  the inferred type, so the other `RecognizedItem` constructors compile unchanged: receipts, web
  barcode, web and mobile mocks, and assistant detections. Clients treat `null` and `undefined`
  alike, as "no box".

### §10.2 Prompt (`apps/api/src/ai/prompts/vision.prompt.ts`)

`VISION_PROMPT_VERSION` becomes `'vision/v2'`. The version is an identifier for tests and
debugging only: `AiGateway` receives it inside the prompt object but neither stores it in
`ai_usage` nor sends it to the provider, so bumping it changes no ledger or analytics. The JSON
shape adds `"box"`, and the system prompt adds this sentence:

> "box" is {x,y,w,h} as fractions (0–1) of the image width and height, origin top-left, drawn
> tightly around the item. If several of the same item are visible, box the group. Use null if you
> cannot localise it.

The rest of the prompt is unchanged. No new routes, error codes or credit prices are added.

### §10.3 Sanitising (`apps/api/src/ai/recognition/box.ts`, new)

`sanitizeBox(raw): NormalizedBox | null` returns `null` in these cases:

- the input is `null`
- any value is non-finite
- any value is below −0.05 or above 1.05. This is probably another scale, such as 0–1000. It is
  never rescaled on a guess.

Otherwise it clamps `x` and `y` to [0,1] and clips `w` and `h` to fit. It then rejects:

- a `w` or `h` under 0.02 (too small to be a real localisation)
- an area over 0.9 (the model boxed the whole frame)

`recognition.service.ts` sets `box: sanitizeBox(item.box)` on every item it builds.

### §10.4 Coordinates on the client

The box is relative to the image stored at `photoKey`. That is the resized JPEG from
`resizeForUpload`, whose output is already orientation-normalised. The client draws pins over its
**local copy of that same resized file**, not the original capture, so the model and the overlay
share pixels and aspect ratio.

Today nothing ties a local file to its key. `resizeForUpload` returns only a URI (it discards the
manipulator's `width` and `height`), and `PhotoCapture` hands `uploadPhotos` a bare `string[]` and
receives a bare key array back. The redesign makes the mapping explicit:

1. `resizeForUpload` returns `{ uri, width, height }` from the manipulator result. `PhotoCapture`
   keeps that object per photo, and its callers read `.uri`.
2. `uploadPhotos` preserves input order, so after upload `PhotoCapture` zips the photos with the
   returned keys into an ordered `CapturedPhoto[] = { uri, photoKey, width, height }[]`.
3. `useCaptureStore.setSession` gains an optional `photos: CapturedPhoto[]`. Receipt sessions pass
   none.
4. The result pager and `ArPins` look up each item's photo by `item.photoKey`.

**Fallback.** An item whose `photoKey` has no entry, or whose photo has unknown dimensions, gets no
pin and appears only in the tray. That covers a store reset, a relaunch after process death, and a
mock session. The tray is always complete, so losing the mapping can never lose an item.

### §10.5 Mocks and honesty

- **The API `MockVisionProvider` fixtures stay without boxes,** so the field defaults to null. A
  fixture box laid over a real photo would draw a confident pin on the wrong thing.
- **The mobile MSW `mocks/data.ts` stays without boxes** for the same reason.
- **Mock mode therefore always shows the tray.** That is the honest degradation.
- **The live assistant's `DetectedItem` does not gain a box** (§2).

### §10.6 Cost

A box adds four short numbers per item, which is a few output tokens. `AiGateway` records the real
usage in `ai_usage`, and `CREDIT_COSTS` is unchanged. Re-check scan margins against the ledger after
a week of real traffic, per the model-routing spec.

### §10.7 Tests

**API:**

- New `ai/recognition/box.spec.ts` (pure): null in; each rejection rule; clamping; clipping; a
  0–1000 input returning null.
- New `ai/__tests__/vision-box.spec.ts`: builds `RecognitionService` on the real `AiGateway`,
  `SchemaGuard` and `BudgetService` behind a stub provider, so the raw JSON is parsed by the same
  code that parses a real model's answer. It asserts that a model box comes back sanitised on the
  item, that a 0–1000 box and a missing box yield null, and that an all-empty result still throws
  `AI_NO_RESULT` with `emptyPhotoKeys`. It is an integration spec and needs the database (see "Test
  topology").
- `ai/__tests__/real-model-output.spec.ts`: one recorded v2 output with boxes, and one v1 output
  without them, which proves both parse.
- New `ai/prompts/vision.prompt.spec.ts` (pure) asserts that the prompt's version is
  `'vision/v2'` and that the system text mentions `"box"` in both locales. No prompt test exists
  today.

**Contracts:** a new `packages/contracts/src/ai.spec.ts` asserts that `normalizedBoxSchema`
accepts an edge-touching box and rejects one that overflows, and that a vision item without `box`
still parses (an old server, a new client).

**Mobile:** `lib/ar-pins.spec.ts` covers:

- cover-crop mapping for portrait and landscape
- out-of-crop anchors going to the tray
- flip, nudge and demote
- the cap of 8
- RTL leaving positions unmoved
- reading order

`lib/capture.spec.ts` covers `canAddAll`:

- false with any unsure item
- false with no locations, or while locations are unloaded (an empty array)
- true only when every item is confident and each resolves to a location

`lib/capture-error.spec.ts` covers `isNothingFound`, as in §9.3. `lib/image.spec.ts` asserts that
`resizeForUpload` returns the manipulator's `width` and `height` alongside the `uri`.

**Web:** no change, and `typecheck` and `test` stay green.

## §11 RTL and Arabic (F7)

Layout follows direction:

- The bento grid mirrors. The leading tile of a row sits at the right in Arabic.
- The tab bar, header slots, bubbles and composer all mirror. User bubbles sit on the left in
  Arabic.
- The week strip mirrors.

Other rules:

- **Styles:** logical style keys only. The ESLint `styleKeys` rule enforces this.
- **Icons:** directional icons go through `DirectionalIcon`. That covers back, chevrons, "See all",
  the tile arrows (F7's kitchen-count arrow points left), the Get-started arrow and send.
- **What doesn't mirror:**
  - the play glyph on the Tonight tile and the Start-cooking button, a media convention that F7
    keeps pointing right
  - photos
  - the camera and still
  - pin positions (§8.8)
  - the cook progress bar and timer
  - the orb (it is symmetric)
- **Numerals and dates** follow the existing `easternNumerals` and `showHijri` settings. F7 shows
  Eastern Arabic numerals.
- **Type:** Tajawal, no tracking, 1.7 line-height. Headline accents come from their own key pair
  (§7.2). Copy is written natively: F7's greeting is "مساء الخميس" over "هيا نطبخ يا ليلى".

## §12 Accessibility

- Every text pair meets AA in both modes (§6.5), and the guards assert it for both.
- **Touch targets** are at least 44pt. Visuals smaller than that are handled one of two ways:
  - They sit inside a 44pt Pressable: `QuantityStepper`'s 32pt circles and every `RoundButton`
    (36–40pt).
  - They extend through the theme's `hitSlop` (12): `Chip` at 32 becomes 56 effective, as it does
    today.

  `token-usage.spec.ts` registers each new control (§14).

- **Dynamic Type.** Content variants are uncapped, and chrome is capped at 1.6×. Tiles grow in
  height rather than truncating. `numeral` wraps its caption onto the next line.
- **Screen readers:**
  - A tile is one element with a full-sentence label.
  - Pins are buttons ("Vine tomatoes, 6"; "Olive oil, not sure"), read top to bottom and then in
    the locale's reading direction, followed by the tray.
  - The orb is hidden unless it is a button.
  - Icon-only buttons carry labels: camera, `+`, search, back, send, mic, save, the avatar
    ("Account") and the orb buttons ("Ask Mama", "Hands-free").
- **Status is spelled out in words,** never by colour alone.
- **Reduce Motion is honoured** (§13).

## §13 Motion

Motion is restrained, with a few moments of character:

- **Press:** pressables dim to 0.85, and filled pills and tiles also scale to 0.98 (tiles dim to
  0.92). The shutter scales to 0.92.
- **Pins landing:** each pin scales from 0.6 and fades in from its anchor with a spring (damping 18,
  stiffness 220), staggered by 40ms in reading order. Under Reduce Motion they appear instantly.
- **Orb:** blinks and states as in §8.3. The orb is the only looping animation in the app, and only
  while visible.
- **Waveform:** five bars animate while `speaking`. They are static under Reduce Motion.
- **Count badge:** pops (scale 1 → 1.15 → 1, 180ms) on each photo.
- **Everything else:** tab switches are instant, sheets and pushes use platform defaults, and the
  cook progress segment fills over 200ms. There are no entrance animations on tiles.

This uses React Native's `Animated` on the native driver (`useNativeDriver: true`), including the
pin spring. `react-native-reanimated` 4.5 is listed in `package.json`, but it needs
`react-native-worklets`, which is only a transitive dependency. Under pnpm that package is neither
declared nor autolinked, and nothing in the app uses reanimated.

## §14 Migration and guards

### Code

- **`theme/palettes.ts`:**
  - `palettes` becomes `{ apricot: { light, dark } }` (§6).
  - Add `onDanger`, `scrim`, the named tints and `tintNamed`.
  - Remove everything in §6.6. `theme/index.ts` stops re-exporting `THEME_FAMILIES` and
    `DEFAULT_THEME_FAMILY`.
- **`theme/useTheme.ts`:** drop the `themeFamily` selector, call `paletteFor(mode)`, and expose
  `tintIn` and `tintNamed`. Drop `tintFor`.
- **`stores/settings.ts`:** drop `themeFamily` and `setThemeFamily` from the state, from
  `current()` and from the loader. An old settings file that still has the key loads without error
  and the key is ignored. `themePreference` is unchanged.
- **`features/settings/ThemePicker.tsx`:** becomes an appearance picker, a System / Light / Dark
  segmented control reusing the existing `mobile.settings.mode*` keys.
- **`components/Button.tsx`:** the `danger` label uses `onDanger`, and the `media` variant is added.
  Remove the three `*Inverse` variants from the union and migrate the call sites per §8.5.
- **`components/Card.tsx`:** already takes a `Tint`. Callers pass `tintNamed(...)` or `tintIn(...)`.
- **Call sites of `tintFor`:** `app/(auth)/welcome.tsx`, `app/(tabs)/home.tsx`,
  `features/home/KitchenGlance.tsx`, `StatTiles.tsx` and `WeekStrip.tsx`.
  - Components absorbed by the new Home (§9.2) are deleted, and their data hooks stay.
  - `WeekStrip` survives on Plan and its planned bar uses `tintNamed('apricot')`, because
    `tintIn(0)` is `plain` — the card's own surface.
- **Fonts (§7.1):**
  - `lib/fonts.ts`: `LATIN_FONTS`, `latinFontFamily` and the Latin branch of `resolveFontFamily`.
  - `lib/font-loader.ts`: register the four Outfit faces.
  - `assets/fonts/`: the four TTFs and `OFL-Outfit.txt`.
  - **`app.json`:** add the four `./assets/fonts/Outfit-*.ttf` paths to the `expo-font` plugin's
    `fonts` array, next to the three Tajawal paths. Without this a native build embeds no Outfit
    and every Latin screen silently falls back to the system font.
  - **`components/AppText.tsx` keeps its rule** of omitting `fontWeight` whenever a `fontFamily`
    resolved. The family name already selects the cut, and adding `fontWeight` on top makes iOS
    synthesise a heavier face. This now applies to Latin as well as Arabic.
- **Capture (§9.3, §10.4):**
  - `lib/image.ts`: `resizeForUpload` returns `{ uri, width, height }`.
  - `stores/capture.ts`: `setSession(session, source, photos?)`.
  - `lib/capture.ts`: `canAddAll`.
  - `lib/capture-error.ts`: `isNothingFound`.
- **Small controls.** Round buttons under 44pt share a new `components/RoundButton.tsx`. It takes a
  visual `size`, is a Pressable fixed at 44×44, and centres the visual circle inside it. That covers
  back and close (40), the recipe controls (40), the Kitchen search button (40) and the avatar
  (36). The `ArPins` pin label is its own Pressable with a 44pt minimum height.

### Tests: every guard that changes

Each change below is **mechanical**: the thresholds and the intent of every assertion are kept.

- **`theme/palette.spec.ts`:**
  - **Fixtures.** The describe-each over `Object.keys(palettes) as ThemeFamily[]` (line 31) becomes
    `keyof typeof palettes`, now yielding `apricot light` and `apricot dark`. The tint-rotation
    fixture `palettes.violet.light` (285) becomes `palettes.apricot.light`.
  - **Kept, over both apricot modes:**
    - text and muted on every surface
    - accent
    - fill separation
    - status on soft, and status as a border
    - the `primaryText` pairs
    - the recipe-thumb placeholder pairs
    - card tints (over the four named tints)
    - the hero gradient ramp (over the ember ramp)
    - tint distance from the ground, including `surface` and `surfaceAlt`
    - tint rotation
    - `resolveThemeMode`
  - **Changed:** "button fills carry readable labels" asserts `onFill` on `primary` and
    `primaryPressed`, and **`onDanger` on `danger`**.
  - **Renamed:** the three "cook mode …" tests become "media surfaces …", with identical
    assertions and thresholds. The `primaryInverse` fill and label pairs stay because `media`
    buttons use them. The assertion labelled "ghostInverse label" is relabelled "media ghost
    label", since that variant is gone.
  - **Added:**
    - `primary` on `surfaceInverse` ≥ 3.0 (the shutter)
    - the scrim worst case: `textInverse` over the composite of `scrim` at `textMinAlpha` on
      `#FFFFFF` ≥ 4.5
    - the inverted tile: `bg` on `text` ≥ 4.5
    - the scrim's shape: alpha is at least `textMinAlpha` over the whole bottom 40%, and 0 over
      the top 35%, so the knee that fixed the linear ramp cannot regress
    - the media group is identical in light and dark
    - every `TintName` resolves through `tintNamed`
  - **Removed with the feature it guarded:** "families are distinguishable" (the block from line 301), because
    there is one family.
- **`components/visual-rhythm.spec.ts`:**
  - The fixture `palettes.violet.light` (15) becomes `palettes.apricot.light`.
  - The ghost-padding regex (24–26) drops the `|| variant === 'ghostInverse'` alternative and
    becomes `/paddingHorizontal:\s*variant === 'ghost'\s*\?\s*0\s*:\s*spacing\.lg/`.
    `Button.tsx`'s `borderWidth` expression changes the same way.
  - The "home screen palette" assertions move with the elements they name: progress-in-brand
    targets the sage plan tile's progress, and no-chevron stays on action tiles.
- **`components/recipe-thumb.spec.ts`:** the fixture `palettes.violet.light` (13) becomes
  `palettes.apricot.light`.
- **`lib/fonts.spec.ts`:** the Arabic cases stay. "never overrides the system font for Latin
  locales" (39–42) is **replaced**, because the rule it guards is deliberately reversed:
  - `LATIN_FONTS` uses the PostScript names the files self-report (§7.1).
  - `latinFontFamily` maps 400, 500, 600 and 700 to four distinct cuts. Unlike Tajawal, Outfit
    ships a SemiBold, so 600 is not promoted.
  - `resolveFontFamily('en', true, w)` returns the Outfit face for each weight.
  - `resolveFontFamily('en', false, w)` returns `undefined` (the system font until loaded).
- **`stores/settings.spec.ts`, the "theme preference" block (157–208):**
  - 158, "defaults to violet following the system": becomes "defaults to following the system"
    and asserts `themePreference` only, read from `getInitialState()` so earlier tests cannot leak
    into it.
  - 164, "persists both halves of the choice": **rewritten** as "persists the appearance choice".
    It sets only `themePreference: 'dark'` and asserts the written file has it and has no
    `themeFamily` key, so preference persistence keeps its coverage.
  - 176, "restores a saved theme": the file keeps a stale `themeFamily: 'green'`. It asserts
    `themePreference === 'light'` and that the state has no `themeFamily` key.
  - 192, the unknown-values fallback: keeps `themePreference: 'sepia'` → `'system'`, and drops the
    family half.
  - 202, the older settings file: unchanged in intent, and asserts `themePreference` only.
- **`theme/token-usage.spec.ts`:**
  - The `QuantityStepper.tsx` entry stays. The restyled file keeps the 44×44 Pressable as its
    first `height:` declaration, with the 32pt circle as an inner view, so `/height:\s*(\d+)/`
    still reads 44. Nothing is renamed.
  - The new controls are registered as the guard's comment requires:
    - `'RoundButton.tsx': /height:\s*(\d+)/`
    - `'Tile.tsx': /minHeight:\s*(\d+)/`
    - `'ArPins.tsx': /minHeight:\s*(\d+)/`
    - `'SegmentedControl.tsx': /minHeight:\s*(\d+)/`, because the 44pt dimension moves from the
      segments to the track
    - `'TabBar.tsx': /minHeight:\s*(\d+)/`, which locks the tabs at 44 through the capsule rebuild
  - The `lineHeight` sweep is unchanged. (The mobile sweep has no hex or letter-spacing rule;
    only the web `token-usage.test.ts` sweeps for hex.)
- **API `VisionResult` fixtures:** the typed literals in `credits/cost-attribution.spec.ts` (88) and
  `credits/credit-debits.spec.ts` (106) gain `box: null`, because the raw output type makes `box`
  required (§10.1). Untyped fixtures such as `vision.fixtures.ts` are parsed and need no change.
- **`lib/image.spec.ts`:** "returns the uri from the manipulator" (70) destructures `{ uri }`, and
  a new case asserts the manipulator's `width` and `height` pass through.
- **New specs** are listed with their features: `lib/capture.spec.ts` and
  `lib/capture-error.spec.ts` (§10.7), and `lib/shopping-share.spec.ts` (§9.7).
- **Unchanged:** `theme/typography.spec.ts` beyond §7.2, `layout.spec.ts`, `mocks/coverage.spec.ts`
  and the i18n parity typecheck.

### Docs

- The copilot instructions' "Design tokens" section names the mobile token file. Note there that
  mobile has one palette in two modes, and that `onFill` is ink on coral.
- `assets/fonts/README.md`: Outfit.
- `assets/images/README.md`: new.

## §15 Implementation order

Each step leaves the workspace building and the suite green:

1. **Contract and API (§10).** The schema, prompt v2, `sanitizeBox`, the service mapping and the
   tests. Run `pnpm --filter @kitchen/contracts build`, then the API vision specs and web
   `typecheck`. This is one commit.
2. **Tokens and fonts.** `palettes.ts`, `index.ts` (scale, radius, shadow), `useTheme`, the
   settings store, the appearance picker, Outfit vendoring with its `app.json` entry, and the §14
   changes to `palette.spec`, `recipe-thumb.spec`, `fonts.spec` and `settings.spec`.
3. **Primitives.** `Tile`/`Bento`, `OrbMascot` (export the PNG from Figma node `39:11`), `Chip`,
   `Badge`, `QuantityStepper`, `RoundButton`, `Button` (the variant removal and the cook and home
   call sites, with the `visual-rhythm.spec` change), headers, `SegmentedControl`, `Sheet`, `Card`
   and `TabBar`. Register the new controls in `token-usage.spec`.
4. **IA.** Tab relabel, the Shop tab move, `/account`, deleting `more.tsx`, and the i18n keys.
5. **Mocked screens.** In order:
   1. Home
   2. Kitchen
   3. Capture, with `ArPins`, `lib/ar-pins.ts`, the photo mapping (§10.4), `canAddAll` and
      `isNothingFound`
   4. Review
   5. Mama
   6. Welcome, with its photos
6. **Derived screens (§9.7).**
7. **Sweep.** Remove leftover `tintFor` references and any code still rendering a retired key. The
   keys themselves stay in the catalogs (§4.3). Run a grep for `gradientHero` outside `Card` and
   Tonight.
8. **Verification.**
   - `pnpm turbo run typecheck lint test --filter=@kitchen/mobile --filter=@kitchen/contracts`.
   - The API vision specs, after `pnpm infra:up && pnpm db:migrate && pnpm db:seed`:
     `pnpm --filter @kitchen/api exec vitest run src/ai/recognition src/ai/__tests__/vision-box.spec.ts src/ai/__tests__/real-model-output.spec.ts src/credits/cost-attribution.spec.ts`.
   - `pnpm turbo run typecheck --filter=@kitchen/web`.
   - Simulator screenshots of F1–F7 in light, and of Home, Kitchen, Review, Mama and Cook in dark
     and Arabic, compared against the Figma frames.
   - One pass of the pins against a real vision key, with `AI_MOCK=false`. This spends real credits
     and cannot be done in mock mode by design (§10.5).

## §16 Out of scope

- Web adopting Apricot, which needs its own spec. Until then the brand differs between web
  (violet) and mobile (apricot).
- The app icon, splash and Android adaptive-icon background (`#E6F4FE`). A matching icon is a
  follow-up.
- Tab-bar or camera-chrome blur (`expo-blur`), and haptics (`expo-haptics`).
- Pins on the live viewfinder or the live assistant, and any on-device detection.
- Structured assistant replies, such as recipe cards or action chips, beyond the static starters.
- Any contract field other than the vision box. That includes item source ("From scan"), a
  notification inbox (the bell), and free-text shopping items (§9.7).
- Pruning the i18n keys this redesign stops rendering (§4.3).
- Mobile share of anything but the shopping list.
