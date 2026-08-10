# Device Compatibility Design

Date: 2026-08-10
Status: approved
Scope: sub-project 3 of 4 (see the [decomposition table](./2026-08-09-product-feedback-admin-console-design.md#decomposition))

## 1. Problem

The mobile app has never been run anywhere except a portrait iPhone simulator.
Four concrete defects follow from that, each verified in the current source:

| # | Defect | Evidence |
| - | ------ | -------- |
| 1 | `app.json` declares `"supportsTablet": true` while locking `"orientation": "portrait"`. The app tells Apple it is an iPad app, then refuses to rotate. iPad review exercises rotation. | `apps/mobile/app.json:7,12` |
| 2 | Chrome grows unbounded at large Dynamic Type sizes, pushing content off-screen. Buttons, labels, and captions expand with the user's text preference, breaking the layout before the content text even has room to scale. | `apps/mobile/src/theme/index.ts:133` |
| 3 | `QuantityStepper` renders a 40×40 control, below the 44pt (Apple) and 48dp (Android) minimum touch target. | `apps/mobile/src/components/QuantityStepper.tsx:33-34` |
| 4 | There is no keyboard avoidance anywhere, so on short devices the keyboard can cover the field being typed into. | no `KeyboardAvoidingView` in `apps/mobile/src` |

The app also contains no `useWindowDimensions`, no `Dimensions`, and no
font-scale caps, so there is currently no mechanism by which any layout can
respond to the size of the screen it is on.

Defect #2 already has a live instance beyond the shared theme.
`src/app/recipe/[id]/cook.tsx:64` hard-codes `fontSize: 30, lineHeight: 44` on
the cook-mode step text, bypassing the type scale entirely: at 2× Dynamic Type
React Native renders 60pt glyphs inside a 44pt line box. Cook mode is read at
arm's length with busy hands, which makes it the worst screen in the app to
carry unscalable text.

Two things are already correct and are load-bearing for this design: `Screen`
applies safe-area insets through `SafeAreaView`, and `AppText` is the only text
primitive in the app. Every typography fix therefore lands in one file.

## 2. Goal

A phone-shaped app that adapts gracefully to any screen it is placed on,
including iPad, and that honours the user's text-size preference without
breaking. Not a tablet-specific product.

## 3. Decisions

These were settled during brainstorming and constrain everything below.

| Decision | Choice | Consequence |
| -------- | ------ | ----------- |
| Tablet ambition | Adapt gracefully; no iPad-specific design | Rules out multi-column and master–detail |
| Orientation | Rotation on tablets only; phones stay portrait | No landscape phone layouts to design |
| Text scaling | Scale correctly; uncapped content, chrome capped at `1.6×` | Accessible where it matters, controls stay intact |
| Verification | iOS simulators now; Android correct-by-construction, verified later | No Android SDK on the build machine |
| Testing | Pure functions + source-scanning guards, per existing mobile convention | No render harness, no new dependency |
| Approach | Constrain-and-center | Smallest change that satisfies iPad review |

## 4. Architecture

Four independent changes. Each is separately reviewable and separately
testable, and each is a *rule that phones already satisfy* — which is what
keeps the blast radius of touching shared components down to zero visible
change on a phone.

### 4.1 Orientation configuration

`apps/mobile/app.json` keeps `"orientation": "portrait"`, which is what pins
Android phones, and adds an explicit per-idiom override for iOS:

```json
"infoPlist": {
  "UISupportedInterfaceOrientations~ipad": [
    "UIInterfaceOrientationPortrait",
    "UIInterfaceOrientationPortraitUpsideDown",
    "UIInterfaceOrientationLandscapeLeft",
    "UIInterfaceOrientationLandscapeRight"
  ]
}
```

iOS reads the `~ipad` variant only on iPad, so iPhone stays portrait from the
Expo-generated `UISupportedInterfaceOrientations` while iPad gets all four.
This is declarative: no runtime orientation code, no new dependency.

Android has no per-idiom manifest equivalent. From API 36 Android ignores
orientation restrictions on large screens, which produces the same split for
free. On older Android tablets the app stays portrait — degraded but not
broken, which is within the stated goal.

### 4.2 Typography scaling

`theme/index.ts` exports:

```
typography(locale: Locale): Record<TypographyVariant, TextStyleToken>
maxFontScaleFor(variant: TypographyVariant): number | undefined
```

`typography()` computes `lineHeight` as `round(fontSize × factor)`, where
`factor` is `1.35` Latin / `1.7` Arabic. React Native 0.86 automatically scales
both `fontSize` and an explicitly-set `lineHeight` by the system font scale at
render time, so `typography()` returns unscaled base values — it does not and
must not apply `fontScale` here.

`maxFontScaleFor(variant)` returns `1.6` for the chrome variants — `button`,
`label`, `caption` — and `undefined` for the content variants — `display`,
`title`, `heading`, `body`, `bodyStrong`. Chrome is capped because fixed-height
rows (button rows) cannot accommodate unbounded growth. Content is
uncapped so the user's text-size preference is honoured for long-form reading.
`undefined` rather than a sentinel like `Infinity` because the value is passed
to React Native's `maxFontSizeMultiplier` prop, which accepts `null`, `0`, or a
number `>= 1`; `Infinity` is not legal there.

**Tab bars are not covered by `maxFontScaleFor`.** Tab labels render through
react-navigation's `BottomTabItem`, not through `AppText`, so they never receive
a `maxFontSizeMultiplier` cap from this mechanism. The implemented behaviour is:
`BottomTabItem` sets `allowFontScaling = SUPPORTS_LARGE_CONTENT_VIEWER ? false :
undefined`. On iOS this disables Dynamic Type scaling entirely for tab labels —
users get the long-press large-content viewer instead, so the tab bar cannot
overflow. On Android tab labels scale uncapped; whether they clip at accessibility
text sizes is unverified and is a named follow-up.

`AppText` imports `maxFontScaleFor` and passes `maxFontSizeMultiplier={maxFontScaleFor(variant)}`
to the underlying `<Text>` element. It calls `typography(locale)` and applies the returned
`fontSize`, `lineHeight`, `letterSpacing`, and `color` from the theme. This cap is the
*only* scale-related thing applied in the theme — it is enforced at render time by React
Native when it applies the system font scale.

This rests on one platform behaviour worth stating explicitly: React Native 0.86
scales both `fontSize` and an explicitly-set `lineHeight` by the system font scale
at render time. Because `typography()` returns unscaled base values, the only
scale-related thing the theme exports is `maxFontScaleFor()`, which is consumed as
`maxFontSizeMultiplier` on the `<Text>` element. This enforces the cap at render
time, when RN applies the scale, not by pre-multiplying into the line-height value.

**Correction (verified on simulator, 2026-08-10).** An earlier revision of this spec
claimed React Native does not scale an explicitly-set absolute `lineHeight`. That is
false for RN 0.86: it scales `lineHeight` just as it scales `fontSize`. Pre-multiplying
by `fontScale` therefore double-scaled the line box and pushed content off screen at
accessibility text sizes. The multiplication was removed in `dc63793`. The durable
Dynamic Type fix on this branch is `maxFontScaleFor`, which caps chrome growth at 1.6×
while leaving content text uncapped.

### 4.3 Fluid layout

A pure function in the theme:

```
contentMaxWidth(width: number): number | undefined
```

Returns `undefined` below the tablet breakpoint of `700` — meaning full bleed,
the current phone behaviour — and `640` at or above it.

`Screen` reads the live window width from `useWindowDimensions()` and, when a
cap is returned, applies `maxWidth` with a centering horizontal margin. Because
the rule keys off the *window* and not the device, iPad landscape, iPad
portrait, Split View, Slide Over and Stage Manager resizing are all the same
case; a narrow Split View pane returns `undefined` and renders exactly like a
phone.

`Screen` also extends its safe-area edges from `['top', 'bottom']` to include
`'left'` and `'right'`. On a portrait phone those insets are `0`, so this is
invisible there; it is what keeps content clear of the rounded corners and
home indicator once an iPad can rotate.

### 4.4 Touch targets and keyboard

`QuantityStepper` moves from a fixed `40×40` to `44×44`.

`Screen` wraps its content in a `KeyboardAvoidingView` using `padding`
behaviour on iOS and **no** behaviour on Android. Expo defaults
`android.softwareKeyboardLayoutMode` to `"resize"`, so Android already shrinks
the window for the keyboard; setting a behaviour on top of that double-adjusts
and pushes content off-screen. This is the one change with a genuine
interaction risk — combined carelessly with `SafeAreaView` it double-pads on
iOS too — so it carries a mandatory visual check on the shortest supported
device.

## 5. Testing

Mobile tests in this repo run in a node environment with no render harness, by
design. This design does not change that. Layout decisions are therefore
extracted into pure functions that can be asserted directly, and everything
that cannot be expressed that way is pinned by a source-scanning guard.

### 5.1 Pure function tests

`contentMaxWidth`:

| Input | Expected | Why |
| ----- | -------- | --- |
| `390` (iPhone) | `undefined` | Phones are untouched |
| `834` (iPad portrait) | `640` | Caps a wide measure |
| `1194` (iPad landscape) | `640` | Same cap, not a second layout |
| `507` (narrow Split View) | `undefined` | Keys off the window, not the device |
| `700` (exact breakpoint) | `640` | Boundary is inclusive and pinned |

`typography`:

| Case | Expected |
| ---- | -------- |
| `typography('en')` body | `lineHeight` is `round(16 × 1.35)` = `22` |
| `typography('ar')` body | `lineHeight` is `round(16 × 1.7)` = `27` |
| `typography('en')` button | Text is 16pt; `maxFontScaleFor('button')` is `1.6` |
| `typography('ar')` any | `letterSpacing` is `0` |

The core tests for `typography(locale)` assert fixed values like `Math.round(16 × 1.35)`
for body text, and these values do not change across this work — `typography()` returns
unscaled base values, so the tests simply pass unchanged. That unchanged-test-suite
is the evidence that the implementation is correct.

`maxFontScaleFor`: `1.6` for each chrome variant, `undefined` for each content
variant, asserted per variant so adding a variant without classifying it fails.

### 5.2 Guard tests

Added to the existing mobile guard suite, in the style of
`src/lib/store-policy.spec.ts`:

- **The originating contradiction:** fail if `supportsTablet` is `true` while
  the iPad orientation list does not include both landscape orientations. This
  encodes defect #1 so it cannot recur.
- **No raw `lineHeight`** outside `theme/index.ts`. A literal elsewhere
  silently opts that text out of Dynamic Type scaling — the exact shape of
  defect #2.
- **No interactive component** declares `width`, `height` or `minHeight` below
  `44`.

Each guard must be verified to fail when the condition it describes is
reintroduced. A guard that cannot fail is not a guard.

### 5.3 Visual verification

Tests cannot see clipping, double-padding or a broken tablet layout. The
following matrix is checked on simulators and is part of the definition of
done:

| Device | Text size | Locales |
| ------ | --------- | ------- |
| iPhone 17e (smallest available) | default, largest | en, ar |
| iPhone 17 Pro Max | default, largest | en, ar |
| iPad | default, largest | en, ar |

iPad is additionally rotated to confirm §4.1 took effect and that content
centers rather than stretching.

### 5.4 Existing tests

`src/theme/typography.spec.ts` calls `typography(locale)` with one argument and
will continue to pass unchanged, because `typography()` returns unscaled base values.
The four existing tests assert specific `lineHeight` values — e.g. `Math.round(16 × 1.35)` —
and those assertions remain true. Leaving them untouched is stronger evidence that the
new `maxFontScaleFor()` function is a pure addition than editing them would be. The
test assertions — Latin tracking present, Arabic tracking zero — are preserved, not relaxed.
The same applies to `theme/palette.spec.ts` and the web token guards, which this work
does not touch.

### 5.5 A gap the tests cannot close

The pure functions are tested and `Screen` consumes them, but no mobile test
can observe that `Screen` is actually wired to `contentMaxWidth` — hard-coding
the cap leaves every unit test green. That gap is why §5.3 is part of the
definition of done rather than a nicety, and it is the same class of gap that
let a spec file ship inside the app bundle earlier in this project: green
suite, broken app.

## 6. Risks

| Risk | Mitigation |
| ---- | ---------- |
| Android is unverified — no SDK on the build machine | §4.2–§4.4 are shared React Native code that cannot diverge by platform; §4.1 is declarative config. Android verification is a named follow-up, not a silent assumption. |
| The API 36 large-screen orientation behaviour may not apply on older Android | Failure mode is an Android tablet that stays portrait: degraded, not broken, and within the goal |
| `Screen` is used by every screen, so a mistake there is global | Contained by the phone-width assertions in `apps/mobile/src/theme/layout.spec.ts`, which prove phone output is unchanged |
| `KeyboardAvoidingView` double-pads when combined with `SafeAreaView` | Platform-specific configuration plus a mandatory visual check on the shortest device |
| Dense screens remain tight at the largest text sizes | Accepted. This work fixes clipping; it does not redesign dense screens. |

## 7. Out of scope

Stated explicitly so the implementation does not drift into them:

- iPad-specific layouts, multi-column layouts, master–detail.
- Landscape layouts for phones.
- The web app. Its `AppShell` already ships a mobile drawer (`md:hidden`), a
  hamburger control, responsive padding and a centered `max-w-6xl` main, so
  phone browsers are already handled.
- Redesigning dense screens for the largest accessibility text sizes.
- Android build setup and Android device verification.
