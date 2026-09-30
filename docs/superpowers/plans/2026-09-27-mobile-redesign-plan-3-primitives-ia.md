# Mobile Redesign · Plan 3: Primitives and navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build every Apricot Bento primitive and the new navigation, so Plans 4–5 compose screens
from finished parts. The primitives are buttons, round buttons, headers, chips, badges, the stepper,
the segmented control, fields, cards, sheets, tiles, Mama's orb and the floating tab bar. The
navigation is Home · Kitchen · [camera] · Plan · Shop, with Account behind an avatar.

**Architecture:**

- **Colour decisions are pure tables.** `button-tones.ts` and `control-tones.ts` map a variant to its
  fill, label and edge. Components read them, and specs measure every pair for WCAG contrast in node,
  in both modes.
- **Geometry is pure and specced.** `tile-layout.ts`, `lib/orb.ts` and `lib/tab-bar.ts` hold the
  numbers, so the components that use them stay thin.
- **No control under 44pt is tappable at its visual size.** `RoundButton` and the stepper centre a
  32–40pt circle in a 44×44 Pressable, and each control is registered in `token-usage.spec.ts`.
- **Motion is React Native `Animated` on the native driver.** It stops under Reduce Motion, when the
  screen loses focus, and when the app is backgrounded.
- **Screens are not restyled here.** That is Plans 4–5. A screen changes only where a primitive
  forces it: cook mode (the removed variants), the home hero (an interim variant), the stepper's
  callers, and the tab screens (clearance and headers).

**Tech Stack:** Expo 57, React Native 0.86, expo-router, expo-linear-gradient, zustand 5, and Vitest
(node environment, mobile). WCAG contrast comes from `apps/mobile/src/theme/contrast.ts`.

**Spec:** `docs/superpowers/specs/2026-09-27-mobile-apricot-bento-redesign-design.md`. The relevant
sections:

- §4: tabs, Account and i18n
- §6.7: radius, elevation and the grid
- §8.1–§8.6: the components
- §12–§13: accessibility and motion
- §14: code migration and every guard change
- §15: steps 3 and 4 are this plan

**Builds on Plans 1–2** (PR #56). Branch from `feat/mobile-redesign-primitives`, which carries
them, the orb artwork and this plan.

## Global Constraints

- Run every command from the repo root. Node >= 20 (CI uses 22). pnpm 10.34.5.
- **Colour hex literals live only in `apps/mobile/src/theme/palettes.ts`.** Components get colour
  from `useTheme()` or the tone tables. The `#000` in `components/YoutubePlayer.tsx` and
  `lib/youtube.ts` predates this plan.
- **Guard tests are never relaxed to make a change pass.** Contrast is 4.5 for text and 3.0 for
  non-text.
- **Touch targets:**
  - `token-usage.spec.ts` reads the **first** literal matching a control's pattern.
  - Keep the 44pt-or-larger literal first in each registered file.
  - `/height:\s*(\d+)/` is case-sensitive, so it does not match `minHeight:`.
- **No raw `lineHeight` outside the theme.** An existing guard enforces this.
- **Never hard-code `letterSpacing`.** Arabic is cursive, and tracking breaks the joins.
- **No physical-direction style keys on mobile** (`marginLeft`, `left`, `borderRightColor`…).
  ESLint's `styleKeys` rule rejects them, so use `start`/`end` and `marginStart`/`marginEnd`.
  `top` and `bottom` are fine. `hitSlop` takes a number.
- **Animation uses `Animated` from `react-native` with `useNativeDriver: true`, not
  `react-native-reanimated`.** Reanimated 4.5 needs `react-native-worklets`. That package is only a
  transitive dependency, so under pnpm it is neither declared nor autolinked, and nothing uses
  reanimated today. The spec's §13 is amended to match.
- **The i18n catalogs are append-only.** This plan adds exactly `mobile.tabs.plan`,
  `mobile.tabs.shop` and `mobile.account.title`. The keys that stop rendering stay (§4.3):
  `mobile.tabs.plans`, `mobile.tabs.more`, `mobile.more.title` and `mobile.more.shopping`.
- **Nothing outside `apps/mobile` and `packages/i18n` changes.** No contract, API or web code
  changes.
- **Imports:** mobile relative imports have no file extension.
- **Visual verification is Plan 5's** (§15 step 8). If you have a simulator, a smoke pass is
  welcome, but it is not a gate here.
- **Out of scope:**
  - **Plan 4:** Home, Kitchen, Capture, Review, Mama and Welcome, plus `Bubble`/`Composer`,
    `ArPins`, the Tonight tile and the count-badge pop.
  - **Plan 5:** the derived screens (§9.7) and the sweep.
- **Format only the files you touched:**
  `npx prettier --config packages/config/prettier.config.mjs --write <paths>`. Never run
  `pnpm format`.
- **Every commit message ends with the trailer**
  `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>`.

## Before you start

- [ ] **Install, force-build the shared packages, and record the baseline**

```bash
pnpm install --frozen-lockfile
pnpm exec turbo run build --filter='./packages/*' --force
pnpm --filter @kitchen/mobile test
```

Expected: **54 files, 629 tests passed.** The per-task counts below are relative to this. `--force`
matters: a `dist` left over from another branch is the usual cause of a phantom failure.

- [ ] **Confirm Mama's orb artwork is present and unaltered**

The branch carries it in `chore(mobile): add Mama's orb artwork`. Task 5 reads it, and its spec
checks the PNG headers.

```bash
shasum -a 256 apps/mobile/assets/mama/orb.png apps/mobile/assets/mama/orb@2x.png apps/mobile/assets/mama/orb@3x.png
```

Expected, matching the table in `apps/mobile/assets/mama/README.md`:

```text
5fa7455eadcbf41f110ff830950c46b78290be31e1a40732fcbc69b0d1c425a0  apps/mobile/assets/mama/orb.png
c30bbb472406683569238dae6dbe4f6968337f194bc55c4a7822caafdb6e3b7e  apps/mobile/assets/mama/orb@2x.png
e4a4ae6ae6998bd5a9c60980b396ac6c6903f3459dbc57b5db2aaa8565e7c4fc  apps/mobile/assets/mama/orb@3x.png
```

## File map

| File (under `apps/mobile/src/`)                  | Responsibility after this plan                                                  |
| ------------------------------------------------ | ------------------------------------------------------------------------------- |
| `components/button-tones.ts`                     | `buttonTone` and `roundButtonTone`: fill, label and edge per variant            |
| `components/Button.tsx`                          | Six variants (`primary` 56pt, optional arrow); press dims and scales            |
| `components/RoundButton.tsx`                     | A 36/40/44pt circle inside a fixed 44×44 target: icon or initial                |
| `components/Header.tsx`                          | Pushed-screen header: back `RoundButton`, centred `bodyStrong` title, trailing  |
| `components/control-tones.ts`                    | Chip, count badge, stepper and segment colours                                  |
| `components/Chip.tsx`                            | `pill` (32pt) and `tag` (location label) variants                               |
| `components/Badge.tsx`                           | Status `Badge` (no `inverse` tone) and the new `CountBadge`                     |
| `components/QuantityStepper.tsx`                 | 32pt circles in 44pt targets, one `adjustable` element, optional unit           |
| `components/SegmentedControl.tsx`                | `surfaceAlt` track with a lifted `surface` thumb                                |
| `components/Field.tsx`                           | Radius `md`, `lg` horizontal padding                                            |
| `components/tile-layout.ts`                      | `bentoRows`: how halves pair up into rows                                       |
| `theme/scrim.ts`                                 | `scrimGradient`: the photo-tile scrim as `LinearGradient` props                 |
| `components/Tile.tsx`                            | `Tile`, `Bento` and `BentoColumn`                                               |
| `components/Card.tsx`, `components/Sheet.tsx`    | Light lift by shadow, dark by edge; Sheet on `shadow.raised` with a round close |
| `lib/orb.ts`, `hooks/motion.ts`                  | Orb geometry and timing; `useReduceMotion`, `useAppActive`                      |
| `components/OrbMascot.tsx`                       | Mama's orb: the PNG body plus animated eyes                                     |
| `lib/tab-bar.ts`                                 | Tab-bar geometry, content clearance, and the leading/trailing split             |
| `components/TabBar.tsx`, `Fab.tsx`, `Screen.tsx` | Floating capsule, 60pt camera, and `Screen tabBar` clearance                    |
| `lib/initial.ts`                                 | `initialOf`: the avatar's glyph                                                 |
| `components/AccountButton.tsx`, `Avatar.tsx`     | The avatar as a control (tab headers) and as a picture (Account)                |
| `components/TabHeader.tsx`                       | Tab-screen header: `display` title, one action, avatar                          |
| `components/ListRow.tsx`, `ListGroup.tsx`        | Grouped 56pt rows with an icon circle and a value, in a white group card        |
| `app/(tabs)/_layout.tsx`                         | Home · Kitchen · [camera] · Plan · Shop                                         |
| `app/(tabs)/shopping.tsx`                        | Shop, moved from `app/shopping.tsx`; the URL is still `/shopping`               |
| `app/account.tsx`                                | Everything More held, in group cards                                            |

---

### Task 1: Button variants, and cook mode follows the theme

**Files:**

- Create: `apps/mobile/src/components/button-tones.ts`, `apps/mobile/src/components/button-tones.spec.ts`
- Replace: `apps/mobile/src/components/Button.tsx` (whole file)
- Modify: `apps/mobile/src/components/visual-rhythm.spec.ts:17-29`
- Modify: `apps/mobile/src/lib/cook-screen.spec.ts:7-16, 48-54`
- Modify: `apps/mobile/src/app/recipe/[id]/cook.tsx:47-53, 69-80, 82-88, 92-98, 101-107, 117-135, 138-151, 190-206, 216-222`
- Modify: `apps/mobile/src/app/(tabs)/home.tsx:121-133`
- Modify: `apps/mobile/src/components/Badge.tsx:3-9, 16-25`

**Interfaces:**

- Consumes: `PaletteColors` and `useTheme()` from Plan 2.
- Produces:
  - `BUTTON_VARIANTS`: `primary`, `secondary`, `soft`, `ghost`, `danger`, `media`.
  - `ButtonVariant`, `ButtonTone`, and `buttonTone(colors, variant)`.
  - `ButtonProps` gains `arrow?: boolean`, a trailing `DirectionalIcon` arrow. `primaryInverse`,
    `secondaryInverse` and `ghostInverse` are gone, so a missed call site is a type error.
  - `BadgeTone` loses `inverse`.

- [ ] **Step 1: Write the tone spec, and update the two guards it changes**

```ts
import { describe, expect, it } from 'vitest';
import { BUTTON_VARIANTS, buttonTone } from './button-tones';
import { palettes, type ThemeMode } from '../theme/palettes';
import { contrast } from '../theme/contrast';

const AA_TEXT = 4.5;
const AA_NON_TEXT = 3;

describe.each(['light', 'dark'] as ThemeMode[])('button tones, apricot %s', (mode) => {
  const { colors } = palettes.apricot[mode];

  it('offers exactly the Apricot variants', () => {
    // The three *Inverse variants are gone for good: cook mode follows the
    // theme, and anything on a photo or the camera uses `media`.
    expect([...BUTTON_VARIANTS].sort()).toEqual(
      ['danger', 'ghost', 'media', 'primary', 'secondary', 'soft'].sort(),
    );
  });

  it.each(BUTTON_VARIANTS.filter((variant) => variant !== 'ghost'))(
    '%s carries a readable label on its fill, pressed or not',
    (variant) => {
      const tone = buttonTone(colors, variant);
      expect(contrast(tone.label, tone.fill), `${variant} label`).toBeGreaterThanOrEqual(AA_TEXT);
      expect(
        contrast(tone.label, tone.pressedFill),
        `${variant} label, pressed`,
      ).toBeGreaterThanOrEqual(AA_TEXT);
    },
  );

  it('ghost labels read on the page and on a card', () => {
    const { label } = buttonTone(colors, 'ghost');
    expect(contrast(label, colors.bg), 'ghost on bg').toBeGreaterThanOrEqual(AA_TEXT);
    expect(contrast(label, colors.surface), 'ghost on surface').toBeGreaterThanOrEqual(AA_TEXT);
  });

  it('media buttons separate from the dark surface they sit on', () => {
    const { fill } = buttonTone(colors, 'media');
    expect(contrast(fill, colors.surfaceInverse)).toBeGreaterThanOrEqual(AA_NON_TEXT);
  });

  it('labels the coral in ink and the light red in its own token', () => {
    // A reviewer's shorthand for spec §3: coral is never white-labelled.
    expect(buttonTone(colors, 'primary').label).toBe(colors.onFill);
    expect(buttonTone(colors, 'danger').label).toBe(colors.onDanger);
  });
});
```

Ghost buttons get no horizontal padding, so their label aligns with the content margin:

```diff
--- a/apps/mobile/src/components/visual-rhythm.spec.ts
+++ b/apps/mobile/src/components/visual-rhythm.spec.ts
@@ -17,13 +17,11 @@ const colors = palettes.apricot.light.colors;
 describe('borderless buttons align to the content margin', () => {
   const source = read('./Button.tsx');

-  it('gives ghost variants no horizontal padding', () => {
+  it('gives the ghost variant no horizontal padding', () => {
     // A ghost button paints neither fill nor border, so `paddingHorizontal`
     // only offsets its label from the margin. On the home screen that put
     // "See all" 16pt inside the right edge of every card beneath it.
-    expect(source).toMatch(
-      /paddingHorizontal:\s*variant === 'ghost' \|\| variant === 'ghostInverse'\s*\?\s*0\s*:\s*spacing\.lg/,
-    );
+    expect(source).toMatch(/paddingHorizontal:\s*variant === 'ghost'\s*\?\s*0\s*:\s*spacing\.lg/);
   });

   it('keeps the touch target legal without that padding', () => {
```

Cook mode stops painting the media surface and follows the theme:

```diff
--- a/apps/mobile/src/lib/cook-screen.spec.ts
+++ b/apps/mobile/src/lib/cook-screen.spec.ts
@@ -7,10 +7,7 @@ import { describe, expect, it } from 'vitest';
  * are policed by sweeping the source, the same idiom as
  * `apps/mobile/src/lib/reminder-surfaces.spec.ts`.
  */
-const source = readFileSync(
-  join(__dirname, '..', 'app', 'recipe', '[id]', 'cook.tsx'),
-  'utf8',
-);
+const source = readFileSync(join(__dirname, '..', 'app', 'recipe', '[id]', 'cook.tsx'), 'utf8');

 describe('cook mode screen', () => {
   it('has source to police', () => {
@@ -48,7 +45,14 @@ describe('cook mode screen', () => {
     expect(tickAt).toBeLessThan(earlyReturnAt);
   });

-  it('uses no physical-direction style keys on the inverse surface', () => {
+  it('uses no physical-direction style keys', () => {
     expect(source).not.toMatch(/\b(marginLeft|marginRight|paddingLeft|paddingRight)\b/);
   });
+
+  it('follows the theme instead of painting the media surface', () => {
+    // Spec §3: cook mode was the one screen that ignored the user's Light /
+    // Dark choice. The `*Inverse` tokens belong to the camera and to photos.
+    expect(source).not.toMatch(/Inverse/);
+    expect(source).toContain('backgroundColor: colors.bg');
+  });
 });
```

- [ ] **Step 2: Run them and watch them fail**

```bash
pnpm --filter @kitchen/mobile exec vitest run src/components/button-tones.spec.ts src/components/visual-rhythm.spec.ts src/lib/cook-screen.spec.ts
```

Expected: **3 files failed; 2 failed | 10 passed (12)**. The failures are:

- `button-tones.spec.ts` fails to load with `Failed to load url ./button-tones`.
- "gives the ghost variant no horizontal padding" fails with
  `expected 'import { ActivityIndicator, Pressable…' to match /paddingHorizontal:\s*variant === 'gho…/`.
- "follows the theme instead of painting the media surface" fails with
  `expected 'import { useState } from \'react\';\n…' not to match /Inverse/`.

- [ ] **Step 3: Write the tone table**

```ts
import type { PaletteColors } from '../theme/palettes';

/**
 * The Apricot button variants (spec §8.5). Kept free of React Native so the
 * palette guards can check every fill and label pair without a renderer, the
 * same way `recipe-thumb-tones.ts` does for the placeholder.
 */
export const BUTTON_VARIANTS = [
  'primary',
  'secondary',
  'soft',
  'ghost',
  'danger',
  'media',
] as const;

export type ButtonVariant = (typeof BUTTON_VARIANTS)[number];

export interface ButtonTone {
  fill: string;
  pressedFill: string;
  label: string;
  /** The 1px edge. Equal to the fill wherever the fill is the edge. */
  border: string;
}

export function buttonTone(colors: PaletteColors, variant: ButtonVariant): ButtonTone {
  switch (variant) {
    case 'primary':
      // Coral takes an ink label in both modes: white on it is 2.83:1 (§3).
      return {
        fill: colors.primary,
        pressedFill: colors.primaryPressed,
        label: colors.onFill,
        border: colors.primary,
      };
    case 'secondary':
      return {
        fill: colors.surface,
        pressedFill: colors.surface,
        label: colors.text,
        border: colors.border,
      };
    case 'soft':
      return {
        fill: colors.primarySoft,
        pressedFill: colors.primarySoft,
        label: colors.primaryText,
        border: colors.primarySoft,
      };
    case 'ghost':
      return {
        fill: 'transparent',
        pressedFill: 'transparent',
        label: colors.primaryText,
        border: 'transparent',
      };
    case 'danger':
      // Not `onFill`: the light-mode red takes white, so the destructive fill
      // carries its own label token.
      return {
        fill: colors.danger,
        pressedFill: colors.danger,
        label: colors.onDanger,
        border: colors.danger,
      };
    case 'media':
      // On the camera, the still and photos, which are dark in every mode.
      return {
        fill: colors.textInverse,
        pressedFill: colors.textInverse,
        label: colors.onPrimaryInverse,
        border: colors.textInverse,
      };
  }
}
```

- [ ] **Step 4: Rebuild `Button` on it**

`minHeight: 48` stays the first `minHeight` literal, because `token-usage.spec.ts` and
`visual-rhythm.spec.ts` both read it. Primary overrides it to 56. The coral darkens to its
`pressedFill` when pressed; every other fill dims to 0.85. Everything except ghost also scales to
0.98.

```tsx
import { ActivityIndicator, Pressable, View, type ViewStyle } from 'react-native';
import { AppText } from './AppText';
import { buttonTone, type ButtonVariant } from './button-tones';
import { DirectionalIcon } from './DirectionalIcon';
import { Icon, type IconName } from './Icon';
import { hitSlop, radius, spacing } from '../theme';
import { useTheme } from '../theme/useTheme';

export type { ButtonVariant } from './button-tones';

export interface ButtonProps {
  title: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  icon?: IconName;
  /** A trailing arrow ("Get started →"). Mirrors in RTL. */
  arrow?: boolean;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  accessibilityLabel?: string;
  style?: ViewStyle;
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  icon,
  arrow,
  loading,
  disabled,
  fullWidth = true,
  accessibilityLabel,
  style,
}: ButtonProps) {
  const { colors } = useTheme();
  const tone = buttonTone(colors, variant);
  const isDisabled = disabled || loading;
  // Only the coral has a pressed colour; every other fill dims instead.
  const hasPressedFill = tone.pressedFill !== tone.fill;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: !!isDisabled, busy: !!loading }}
      disabled={isDisabled}
      onPress={onPress}
      hitSlop={hitSlop}
      style={({ pressed }) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: spacing.sm,
          minHeight: 48,
          // Ghost has no fill and no border, so horizontal padding is
          // invisible weight that pushes the label off the content margin: the
          // home "See all" link sat 16pt inside the right edge every card below
          // it was flush with. Borderless buttons align to the margin (as iOS's
          // own section headers do); `hitSlop` and the 48pt height keep the
          // touch target legal without the padding.
          paddingHorizontal: variant === 'ghost' ? 0 : spacing.lg,
          borderRadius: radius.pill,
          backgroundColor: pressed ? tone.pressedFill : tone.fill,
          borderWidth: variant === 'ghost' ? 0 : 1,
          borderColor:
            variant === 'secondary' ? tone.border : pressed ? tone.pressedFill : tone.fill,
          opacity: isDisabled ? 0.5 : pressed && !hasPressedFill ? 0.85 : 1,
          // Filled pills also give a little under the finger; a bare link only dims.
          transform: [{ scale: pressed && variant !== 'ghost' ? 0.98 : 1 }],
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
        },
        // The one action a screen asks for is the tallest thing on it (spec §8.5).
        variant === 'primary' ? { minHeight: 56 } : null,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={tone.label} />
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          {icon ? <Icon name={icon} size={18} color={tone.label} /> : null}
          <AppText variant="button" style={{ color: tone.label }}>
            {title}
          </AppText>
          {arrow ? <DirectionalIcon name="arrowForward" size={18} color={tone.label} /> : null}
        </View>
      )}
    </Pressable>
  );
}
```

- [ ] **Step 5: Migrate cook mode to the theme**

Every call site of the removed variants follows the table in spec §8.5. The `surfaceInverse`
backgrounds and `textInverse*` text become `bg`, `text` and `textMuted`. The step badge becomes
`neutral`. `StepTimerControl` no longer needs `colors`.

```diff
--- a/apps/mobile/src/app/recipe/[id]/cook.tsx
+++ b/apps/mobile/src/app/recipe/[id]/cook.tsx
@@ -47,7 +47,7 @@ export default function CookMode() {

   if (recipe.isLoading || !recipe.data) {
     return (
-      <SafeAreaView style={{ flex: 1, backgroundColor: colors.surfaceInverse }}>
+      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
         <LoadingState />
       </SafeAreaView>
     );
@@ -69,12 +69,12 @@ export default function CookMode() {
   const projected = existing ? projectTimer(existing, now) : null;

   return (
-    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surfaceInverse }}>
+    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
       <View style={{ flex: 1, padding: spacing.xl, gap: spacing.lg }}>
         <View
           style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
         >
-          <AppText variant="label" style={{ color: colors.textInverseMuted }}>
+          <AppText variant="label" muted>
             {t('mobile.recipe.stepProgress', {
               current: formatMinutes(locale, step + 1, prefs),
               total: formatMinutes(locale, steps.length, prefs),
@@ -82,7 +82,7 @@ export default function CookMode() {
           </AppText>
           <Button
             title={t('mobile.recipe.exitCookMode')}
-            variant="ghostInverse"
+            variant="ghost"
             fullWidth={false}
             onPress={() => router.back()}
           />
@@ -92,7 +92,7 @@ export default function CookMode() {
           <Button
             title={t('mobile.assistant.cookAsk')}
             icon="sparkles"
-            variant="secondaryInverse"
+            variant="secondary"
             fullWidth={false}
             onPress={() => setAssistantOpen(true)}
           />
@@ -101,7 +101,7 @@ export default function CookMode() {
         <View style={{ flex: 1, justifyContent: 'center', gap: spacing.lg }}>
           {current.durationMinutes ? (
             <Badge
-              tone="inverse"
+              tone="neutral"
               label={t('recipe.cookTime', {
                 minutes: formatMinutes(locale, current.durationMinutes, prefs),
               })}
@@ -117,19 +117,17 @@ export default function CookMode() {
               if (plan.ok) createTimer.mutate(plan.body);
             }}
           />
-          <AppText variant="display" style={{ color: colors.textInverse }}>
-            {current.text}
-          </AppText>
+          <AppText variant="display">{current.text}</AppText>
         </View>

-        <AppText variant="caption" style={{ color: colors.textInverseMuted }} center>
+        <AppText variant="caption" muted center>
           {t('mobile.recipe.cookModeHint')}
         </AppText>

         <View style={{ flexDirection: 'row', gap: spacing.md }}>
           <Button
             title={t('mobile.recipe.prev')}
-            variant="secondaryInverse"
+            variant="secondary"
             disabled={step === 0}
             onPress={() => setStep((s) => Math.max(0, s - 1))}
             style={{ flex: 1 }}
@@ -138,14 +136,14 @@ export default function CookMode() {
             <Button
               title={t('mobile.recipe.finish')}
               icon="check"
-              variant="primaryInverse"
+              variant="primary"
               onPress={() => router.back()}
               style={{ flex: 1 }}
             />
           ) : (
             <Button
               title={t('mobile.recipe.next')}
-              variant="primaryInverse"
+              variant="primary"
               onPress={() => setStep((s) => Math.min(steps.length - 1, s + 1))}
               style={{ flex: 1 }}
             />
@@ -190,17 +188,13 @@ function StepTimerControl({
   onStart: () => void;
 }) {
   const { t, locale, prefs } = useFormat();
-  const { colors } = useTheme();

   if (!plan.ok) return null;

   if (projected) {
     const finished = projected.status === 'done';
     return (
-      <AppText
-        variant="label"
-        style={{ color: finished ? colors.textInverse : colors.textInverseMuted }}
-      >
+      <AppText variant="label" muted={!finished}>
         {finished
           ? t('mobile.recipe.stepTimerDone')
           : t('mobile.recipe.stepTimerRunning', {
@@ -216,7 +210,7 @@ function StepTimerControl({
         minutes: formatMinutes(locale, durationMinutes, prefs),
       })}
       icon="clock"
-      variant="secondaryInverse"
+      variant="secondary"
       fullWidth={false}
       disabled={pending}
       onPress={onStart}
```

- [ ] **Step 6: Put the home hero on `media`, and drop the `inverse` badge tone**

The hero sits on the ember gradient, which is a media surface. Plan 4 replaces the whole hero with
the Tonight tile, so this is an interim change (the spec's §8.5 table is amended to match).
`cook.tsx` was the only caller of the `inverse` badge tone.

```diff
--- a/apps/mobile/src/app/(tabs)/home.tsx
+++ b/apps/mobile/src/app/(tabs)/home.tsx
@@ -121,13 +121,13 @@ export default function Home() {
             >
               <Button
                 title={t('mobile.home.viewRecipe')}
-                variant="primaryInverse"
+                variant="media"
                 onPress={() => router.push(`/recipe/${tonight.recipe.id}`)}
                 fullWidth={false}
               />
               <Button
                 title={t('mobile.home.cook')}
-                variant="ghostInverse"
+                variant="media"
                 onPress={() => router.push(`/recipe/${tonight.recipe.id}/cook`)}
                 fullWidth={false}
               />
```

```diff
--- a/apps/mobile/src/components/Badge.tsx
+++ b/apps/mobile/src/components/Badge.tsx
@@ -3,7 +3,7 @@ import { AppText } from './AppText';
 import { radius, spacing, type PaletteColors } from '../theme';
 import { useTheme } from '../theme/useTheme';

-export type BadgeTone = 'neutral' | 'success' | 'warn' | 'danger' | 'info' | 'inverse';
+export type BadgeTone = 'neutral' | 'success' | 'warn' | 'danger' | 'info';

 export interface BadgeProps {
   label: string;
@@ -16,10 +16,6 @@ const toneFor = (colors: PaletteColors): Record<BadgeTone, { bg: string; fg: str
   warn: { bg: colors.warnSoft, fg: colors.warn },
   danger: { bg: colors.dangerSoft, fg: colors.danger },
   info: { bg: colors.primarySoft, fg: colors.primaryText },
-  // For the always-dark cook surface. Every other tone pairs a mode-following
-  // soft tint with its own strong colour, and in dark mode those tints sit on
-  // the same side of the lightness line as the cook ground.
-  inverse: { bg: colors.surfaceInverseAlt, fg: colors.textInverse },
 });

 export function Badge({ label, tone = 'neutral' }: BadgeProps) {
```

- [ ] **Step 7: Run the gates**

```bash
pnpm --filter @kitchen/mobile exec vitest run src/components/button-tones.spec.ts src/components/visual-rhythm.spec.ts src/lib/cook-screen.spec.ts
pnpm --filter @kitchen/mobile test
pnpm --filter @kitchen/mobile typecheck && pnpm --filter @kitchen/mobile lint
```

Expected: **30 passed (30)**; the suite **55 files, 648 tests**; typecheck and lint exit 0.

- [ ] **Step 8: Format and commit**

```bash
npx prettier --config packages/config/prettier.config.mjs --write \
  apps/mobile/src/components/button-tones.ts \
  apps/mobile/src/components/button-tones.spec.ts \
  apps/mobile/src/components/Button.tsx \
  apps/mobile/src/components/Badge.tsx \
  apps/mobile/src/components/visual-rhythm.spec.ts \
  apps/mobile/src/lib/cook-screen.spec.ts \
  'apps/mobile/src/app/recipe/[id]/cook.tsx' \
  'apps/mobile/src/app/(tabs)/home.tsx'
git add \
  apps/mobile/src/components/button-tones.ts \
  apps/mobile/src/components/button-tones.spec.ts \
  apps/mobile/src/components/Button.tsx \
  apps/mobile/src/components/Badge.tsx \
  apps/mobile/src/components/visual-rhythm.spec.ts \
  apps/mobile/src/lib/cook-screen.spec.ts \
  'apps/mobile/src/app/recipe/[id]/cook.tsx' \
  'apps/mobile/src/app/(tabs)/home.tsx'
git commit -m "feat(mobile): Apricot button variants; cook mode follows the theme" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 2: `RoundButton`, and the centred pushed-screen header

**Files:**

- Create: `apps/mobile/src/components/RoundButton.tsx`
- Replace: `apps/mobile/src/components/Header.tsx` (whole file)
- Modify: `apps/mobile/src/components/button-tones.ts:74-76`, `apps/mobile/src/components/button-tones.spec.ts:1-5, 45-48`
- Modify: `apps/mobile/src/components/visual-rhythm.spec.ts:32-37`
- Modify: `apps/mobile/src/theme/token-usage.spec.ts:42-47, 109-123`
- Modify: `apps/mobile/src/components/index.ts:22-27`

**Interfaces:**

- Consumes: `buttonTone` and the Task 1 press behaviour.
- Produces:
  - `ROUND_BUTTON_TONES`: `surface`, `sunk`, `primary`, `soft`, `media`.
  - `RoundButtonTone`, `RoundButtonColors { fill, glyph, border }`, and
    `roundButtonTone(colors, tone, isDark = false)`. `surface` takes a `border` edge in dark mode.
  - `RoundButton`, with these props:
    - `accessibilityLabel` (required)
    - `onPress`, `icon`, `directional`, `label` (a short glyph, such as an initial)
    - `tone = 'surface'`, `size: 36 | 40 | 44 = 40`
    - `disabled`, `style`, `testID`
  - `Header`: the same props (`title`, `onBack`, `trailing`, `subtitle`), now three slots.

- [ ] **Step 1: Write the failing tests**

```diff
--- a/apps/mobile/src/components/button-tones.spec.ts
+++ b/apps/mobile/src/components/button-tones.spec.ts
@@ -1,5 +1,5 @@
 import { describe, expect, it } from 'vitest';
-import { BUTTON_VARIANTS, buttonTone } from './button-tones';
+import { BUTTON_VARIANTS, ROUND_BUTTON_TONES, buttonTone, roundButtonTone } from './button-tones';
 import { palettes, type ThemeMode } from '../theme/palettes';
 import { contrast } from '../theme/contrast';

@@ -45,4 +45,10 @@ describe.each(['light', 'dark'] as ThemeMode[])('button tones, apricot %s', (mod
     expect(buttonTone(colors, 'primary').label).toBe(colors.onFill);
     expect(buttonTone(colors, 'danger').label).toBe(colors.onDanger);
   });
+
+  it.each(ROUND_BUTTON_TONES)('the %s round button carries a readable glyph', (name) => {
+    // Held to the text bar, not 3:1: the avatar's glyph is a letter.
+    const tone = roundButtonTone(colors, name);
+    expect(contrast(tone.glyph, tone.fill), name).toBeGreaterThanOrEqual(AA_TEXT);
+  });
 });
```

```diff
--- a/apps/mobile/src/components/visual-rhythm.spec.ts
+++ b/apps/mobile/src/components/visual-rhythm.spec.ts
@@ -32,6 +32,23 @@ describe('borderless buttons align to the content margin', () => {
   });
 });

+describe('pushed-screen header', () => {
+  const source = read('./Header.tsx');
+
+  it('centres a bodyStrong title between two equal sides', () => {
+    // Spec §8.6. Equal flex on both sides is what keeps the title optically
+    // centred when only one side (usually back) is occupied.
+    expect(source).toMatch(/variant="bodyStrong"/);
+    expect(source).not.toMatch(/variant="title"/);
+    expect(source.match(/flex:\s*1\b/g) ?? []).toHaveLength(2);
+  });
+
+  it('backs out through a 44pt round button that mirrors in RTL', () => {
+    // The old bare 26pt chevron relied on hitSlop for its touch target.
+    expect(source).toMatch(/<RoundButton[^>]*icon="back"[^>]*directional/);
+  });
+});
+
 describe('screen rhythm', () => {
   const source = read('./Screen.tsx');
```

Register the new control. The 44×44 Pressable is what gets measured, not the visual circle:

```diff
--- a/apps/mobile/src/theme/token-usage.spec.ts
+++ b/apps/mobile/src/theme/token-usage.spec.ts
@@ -42,6 +42,8 @@ describe('mobile source sweep', () => {
     'Field.tsx': /minHeight:\s*(\d+)/,
     'Header.tsx': /minHeight:\s*(\d+)/,
     'QuantityStepper.tsx': /height:\s*(\d+)/,
+    // The visual circle is 36-40pt; the Pressable around it is what is measured.
+    'RoundButton.tsx': /height:\s*(\d+)/,
     'StarRating.tsx': /minHeight:\s*(\d+)/,
   };

@@ -109,15 +111,18 @@ describe('mobile source sweep', () => {
       const imports = [...content.matchAll(/from\s+'(\.[^']*)'/g)].map((m) => m[1]!);
       const resolved = imports.flatMap((spec) => {
         const base = join(file, '..', spec);
-        return [`${base}.tsx`, `${base}.ts`, join(base, 'index.tsx'), join(base, 'index.ts')].filter(
-          (candidate) => {
-            try {
-              return statSync(candidate).isFile();
-            } catch {
-              return false;
-            }
-          },
-        );
+        return [
+          `${base}.tsx`,
+          `${base}.ts`,
+          join(base, 'index.tsx'),
+          join(base, 'index.ts'),
+        ].filter((candidate) => {
+          try {
+            return statSync(candidate).isFile();
+          } catch {
+            return false;
+          }
+        });
       });
       return content + resolved.map((next) => expand(next, seen)).join('');
     };
```

- [ ] **Step 2: Run them and watch them fail**

```bash
pnpm --filter @kitchen/mobile exec vitest run src/components/button-tones.spec.ts src/components/visual-rhythm.spec.ts src/theme/token-usage.spec.ts
```

Expected: **3 files failed; 3 failed | 8 passed (11)**. The failures are:

- `button-tones.spec.ts` fails to collect with
  `TypeError: Cannot read properties of undefined (reading 'every')`, because `ROUND_BUTTON_TONES`
  does not exist yet.
- "centres a bodyStrong title between two equal sides" fails with `… to match /variant="bodyStrong"/`.
- "backs out through a 44pt round button that mirrors in RTL" fails with
  `… to match /<RoundButton[^>]*icon="back"[^>]*dire…/`.
- "keeps every interactive control at or above the 44pt minimum" fails with
  `ENOENT: no such file or directory, open '…/components/RoundButton.tsx'`.

- [ ] **Step 3: Add the round-button tones**

```diff
--- a/apps/mobile/src/components/button-tones.ts
+++ b/apps/mobile/src/components/button-tones.ts
@@ -74,3 +74,48 @@ export function buttonTone(colors: PaletteColors, variant: ButtonVariant): Butto
       };
   }
 }
+
+/**
+ * The fills a `RoundButton` circle takes (spec §14, "Small controls"): back
+ * and close on the page, the same inside a card or sheet, the brand action,
+ * the avatar, and controls over the camera or a photo.
+ */
+export const ROUND_BUTTON_TONES = ['surface', 'sunk', 'primary', 'soft', 'media'] as const;
+
+export type RoundButtonTone = (typeof ROUND_BUTTON_TONES)[number];
+
+export interface RoundButtonColors {
+  fill: string;
+  glyph: string;
+  border: string;
+}
+
+export function roundButtonTone(
+  colors: PaletteColors,
+  tone: RoundButtonTone,
+  isDark = false,
+): RoundButtonColors {
+  switch (tone) {
+    case 'surface':
+      // White on the cream page separates by its shadow in light mode. Dark
+      // mode has no visible shadow, so the edge is drawn instead.
+      return {
+        fill: colors.surface,
+        glyph: colors.text,
+        border: isDark ? colors.border : colors.surface,
+      };
+    case 'sunk':
+      // Inside a card or a sheet, where a `surface` circle would vanish.
+      return { fill: colors.surfaceAlt, glyph: colors.text, border: colors.surfaceAlt };
+    case 'primary':
+      return { fill: colors.primary, glyph: colors.onFill, border: colors.primary };
+    case 'soft':
+      return { fill: colors.primarySoft, glyph: colors.primaryText, border: colors.primarySoft };
+    case 'media':
+      return {
+        fill: colors.surfaceInverseAlt,
+        glyph: colors.textInverse,
+        border: colors.borderInverse,
+      };
+  }
+}
```

- [ ] **Step 4: Write `RoundButton`**

The first `height:` literal is the Pressable's 44. A light `surface` circle lifts on `shadow.card`.
A `label` renders in place of the icon and is capped at `CHROME_MAX_FONT_SCALE`, so an initial never
overflows its circle.

```tsx
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import { AppText } from './AppText';
import { DirectionalIcon } from './DirectionalIcon';
import { Icon, type IconName } from './Icon';
import { roundButtonTone, type RoundButtonTone } from './button-tones';
import { CHROME_MAX_FONT_SCALE } from '../theme';
import { useTheme } from '../theme/useTheme';

export type { RoundButtonTone } from './button-tones';

export interface RoundButtonProps {
  accessibilityLabel: string;
  onPress?: () => void;
  icon?: IconName;
  /** Mirror the icon in RTL. Back and forward need it; close does not. */
  directional?: boolean;
  /** A short glyph drawn instead of an icon, such as the avatar's initial. */
  label?: string;
  tone?: RoundButtonTone;
  /** The visible circle. The touch target is 44×44 whatever this is (spec §12). */
  size?: 36 | 40 | 44;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * Every round control under 44pt: back, close, the recipe controls, search and
 * the avatar. The Pressable is fixed at 44×44 and centres the circle, so a 36pt
 * visual never shrinks the target (spec §14).
 */
export function RoundButton({
  accessibilityLabel,
  onPress,
  icon,
  directional = false,
  label,
  tone = 'surface',
  size = 40,
  disabled = false,
  style,
  testID,
}: RoundButtonProps) {
  const { colors, isDark, shadow } = useTheme();
  const { fill, glyph, border } = roundButtonTone(colors, tone, isDark);
  const Glyph = directional ? DirectionalIcon : Icon;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      style={[{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }, style]}
    >
      {({ pressed }) => (
        <View
          style={[
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              borderWidth: 1,
              borderColor: border,
              backgroundColor: fill,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
              transform: [{ scale: pressed ? 0.98 : 1 }],
            },
            tone === 'surface' && !isDark ? shadow.card : null,
          ]}
        >
          {label ? (
            <AppText
              variant="bodyStrong"
              style={{ color: glyph }}
              maxFontSizeMultiplier={CHROME_MAX_FONT_SCALE}
            >
              {label}
            </AppText>
          ) : icon ? (
            <Glyph name={icon} size={Math.round(size / 2)} color={glyph} />
          ) : null}
        </View>
      )}
    </Pressable>
  );
}
```

```diff
--- a/apps/mobile/src/components/index.ts
+++ b/apps/mobile/src/components/index.ts
@@ -22,6 +22,7 @@ export { SyncFailuresBanner } from './SyncFailuresBanner';
 export { YoutubePlayer } from './YoutubePlayer';
 export { QuantityStepper } from './QuantityStepper';
 export { RecipeThumb } from './RecipeThumb';
+export { RoundButton } from './RoundButton';
 export { Ring } from './Ring';
 export { Screen } from './Screen';
 export { SegmentedControl } from './SegmentedControl';
```

- [ ] **Step 5: Rebuild the pushed-screen header**

Equal `flex: 1` sides keep the title centred whether or not there is a trailing action. The centre
is `flex: 2`. The title is one line, with `accessibilityRole="header"`.

```tsx
import { View } from 'react-native';
import { AppText } from './AppText';
import { RoundButton } from './RoundButton';
import { spacing } from '../theme';
import { useLocale } from '../lib/locale';

export interface HeaderProps {
  title: string;
  onBack?: () => void;
  /** One trailing control, such as F4's ghost "Retake" or a status badge. */
  trailing?: React.ReactNode;
  subtitle?: string;
}

/**
 * The pushed-screen header (spec §8.6): back, a centred `bodyStrong` title and
 * an optional trailing control. Both sides take equal flex, so the title stays
 * centred when only one of them is filled. Tab screens use `TabHeader`.
 */
export function Header({ title, onBack, trailing, subtitle }: HeaderProps) {
  const { t } = useLocale();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 44 }}>
      <View style={{ flex: 1, alignItems: 'flex-start' }}>
        {onBack ? (
          <RoundButton
            icon="back"
            directional
            accessibilityLabel={t('common.back')}
            onPress={onBack}
          />
        ) : null}
      </View>
      <View style={{ flex: 2, alignItems: 'center', gap: 2 }}>
        <AppText variant="bodyStrong" center numberOfLines={1} accessibilityRole="header">
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="caption" muted center numberOfLines={1}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      <View style={{ flex: 1, alignItems: 'flex-end' }}>{trailing}</View>
    </View>
  );
}
```

- [ ] **Step 6: Run the gates**

```bash
pnpm --filter @kitchen/mobile exec vitest run src/components/button-tones.spec.ts src/components/visual-rhythm.spec.ts src/theme/token-usage.spec.ts
pnpm --filter @kitchen/mobile test
pnpm --filter @kitchen/mobile typecheck && pnpm --filter @kitchen/mobile lint
```

Expected: **39 passed (39)**; the suite **55 files, 660 tests**; typecheck and lint exit 0.

- [ ] **Step 7: Format and commit**

```bash
npx prettier --config packages/config/prettier.config.mjs --write \
  apps/mobile/src/components/RoundButton.tsx \
  apps/mobile/src/components/Header.tsx \
  apps/mobile/src/components/button-tones.ts \
  apps/mobile/src/components/button-tones.spec.ts \
  apps/mobile/src/components/visual-rhythm.spec.ts \
  apps/mobile/src/components/index.ts \
  apps/mobile/src/theme/token-usage.spec.ts
git add \
  apps/mobile/src/components/RoundButton.tsx \
  apps/mobile/src/components/Header.tsx \
  apps/mobile/src/components/button-tones.ts \
  apps/mobile/src/components/button-tones.spec.ts \
  apps/mobile/src/components/visual-rhythm.spec.ts \
  apps/mobile/src/components/index.ts \
  apps/mobile/src/theme/token-usage.spec.ts
git commit -m "feat(mobile): RoundButton and the centred pushed-screen header" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 3: Chips, badges, the stepper, the segmented control and fields

**Files:**

- Create: `apps/mobile/src/components/control-tones.ts`, `apps/mobile/src/components/controls.spec.ts`
- Replace: `apps/mobile/src/components/QuantityStepper.tsx`, `apps/mobile/src/components/SegmentedControl.tsx` (whole files)
- Modify: `apps/mobile/src/components/Chip.tsx:1-36`
- Modify: `apps/mobile/src/components/Badge.tsx:1-5, 37-39`
- Modify: `apps/mobile/src/components/Field.tsx:36-43`
- Modify: `apps/mobile/src/components/index.ts:1-7`
- Modify: `apps/mobile/src/theme/token-usage.spec.ts:44-49`
- Modify (stepper callers):
  - `apps/mobile/src/app/item/[id].tsx:170-184`
  - `apps/mobile/src/features/capture/ReviewList.tsx:80-94`
  - `apps/mobile/src/app/entry/[id].tsx:86-92, 104-109`
  - `apps/mobile/src/app/generate-plan.tsx:182-187`
  - `apps/mobile/src/app/profile.tsx:103-108, 162-170`
  - `apps/mobile/src/app/settings/reminders.tsx:145-150, 166-171, 179-184`

**Interfaces:**

- Consumes: `hitSlop`, `radius`, `spacing`, and `shadow.card` from the theme.
- Produces:
  - `CHIP_VARIANTS`, `ChipVariant` and `ControlTone { fill, label, border }`.
  - The tone functions:
    - `chipTone(colors, variant, selected)`
    - `countBadgeTone(colors)`
    - `stepperTone(colors, 'decrement' | 'increment')`
    - `segmentTrack(colors)`
    - `segmentTone(colors, selected, isDark)`
  - `ChipProps` gains `variant?: ChipVariant`. A chip with no `onPress` has the `text` role.
  - `CountBadge({ count, accessibilityLabel? })`.
  - `QuantityStepperProps` gains `unit?` and `accessibilityLabel?`, and `−` disables at `min`.

- [ ] **Step 1: Write the contrast and source guards**

Unselected chips keep a `border` edge in both modes, because most sit on white cards. The spec
names the fill only.

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { chipTone, countBadgeTone, segmentTone, segmentTrack, stepperTone } from './control-tones';
import { hitSlop } from '../theme';
import { palettes, type ThemeMode } from '../theme/palettes';
import { contrast } from '../theme/contrast';

const AA_TEXT = 4.5;
const AA_NON_TEXT = 3;
const read = (relative: string) => readFileSync(join(__dirname, relative), 'utf8');

describe.each(['light', 'dark'] as ThemeMode[])('control tones, apricot %s', (mode) => {
  const { colors } = palettes.apricot[mode];

  it('chip labels read selected or not, and on a tag', () => {
    for (const selected of [false, true]) {
      const tone = chipTone(colors, 'pill', selected);
      expect(contrast(tone.label, tone.fill), `selected ${selected}`).toBeGreaterThanOrEqual(
        AA_TEXT,
      );
    }
    const tag = chipTone(colors, 'tag', false);
    expect(contrast(tag.label, tag.fill), 'tag').toBeGreaterThanOrEqual(AA_TEXT);
  });

  it('a selected chip inverts to the text colour (spec §8.4)', () => {
    expect(chipTone(colors, 'pill', true)).toMatchObject({ fill: colors.text, label: colors.bg });
  });

  it('an unselected chip keeps an edge, because a white pill on a white card has no other', () => {
    const tone = chipTone(colors, 'pill', false);
    expect(tone.fill).toBe(colors.surface);
    expect(tone.border).not.toBe(tone.fill);
  });

  it('a count badge reads', () => {
    const tone = countBadgeTone(colors);
    expect(contrast(tone.label, tone.fill)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it('stepper glyphs separate from their circles, and + is the brand action', () => {
    for (const action of ['decrement', 'increment'] as const) {
      const tone = stepperTone(colors, action);
      expect(contrast(tone.glyph, tone.fill), action).toBeGreaterThanOrEqual(AA_NON_TEXT);
    }
    expect(stepperTone(colors, 'increment').fill).toBe(colors.primary);
    expect(stepperTone(colors, 'decrement').fill).toBe(colors.surfaceAlt);
  });

  it('segment labels read on the thumb and on the bare track', () => {
    const on = segmentTone(colors, true);
    expect(contrast(on.label, on.fill), 'selected').toBeGreaterThanOrEqual(AA_TEXT);
    // An unselected segment paints nothing, so its label sits on the track.
    const off = segmentTone(colors, false);
    expect(contrast(off.label, segmentTrack(colors)), 'unselected').toBeGreaterThanOrEqual(AA_TEXT);
  });
});

describe('control touch targets', () => {
  it('a chip reaches 44pt through the theme slop', () => {
    const source = read('./Chip.tsx');
    const match = /minHeight:\s*(\d+)/.exec(source);
    expect(match, 'Chip must declare its visual height').not.toBeNull();
    const height = Number(match![1]);
    expect(height).toBe(32);
    expect(source).toMatch(/hitSlop=\{hitSlop\}/);
    expect(height + 2 * hitSlop).toBeGreaterThanOrEqual(44);
  });

  it('the stepper is one adjustable element with increment and decrement actions', () => {
    const source = read('./QuantityStepper.tsx');
    expect(source).toMatch(/accessibilityRole="adjustable"/);
    expect(source).toMatch(/name: 'increment'/);
    expect(source).toMatch(/name: 'decrement'/);
  });

  it('segments extend their slop to the edge of the 44pt track', () => {
    // The track's inset and each segment's slop are the same token, so a tap
    // anywhere on the track lands on a segment.
    const source = read('./SegmentedControl.tsx');
    expect(source).toMatch(/padding:\s*spacing\.xs/);
    expect(source).toMatch(/hitSlop=\{spacing\.xs\}/);
  });
});
```

The segmented control's touch dimension moves from its segments to its track:

```diff
--- a/apps/mobile/src/theme/token-usage.spec.ts
+++ b/apps/mobile/src/theme/token-usage.spec.ts
@@ -44,6 +44,7 @@ describe('mobile source sweep', () => {
     'QuantityStepper.tsx': /height:\s*(\d+)/,
     // The visual circle is 36-40pt; the Pressable around it is what is measured.
     'RoundButton.tsx': /height:\s*(\d+)/,
+    'SegmentedControl.tsx': /minHeight:\s*(\d+)/,
     'StarRating.tsx': /minHeight:\s*(\d+)/,
   };
```

- [ ] **Step 2: Run them and watch them fail**

```bash
pnpm --filter @kitchen/mobile exec vitest run src/components/controls.spec.ts src/theme/token-usage.spec.ts
```

Expected: **2 files failed; 1 failed | 3 passed (4)**. The failures are:

- `controls.spec.ts` fails to load with `Failed to load url ./control-tones`.
- "keeps every interactive control at or above the 44pt minimum" fails with
  `SegmentedControl.tsx no longer declares the touch dimension this guard tracks. …: expected null not to be null`.

- [ ] **Step 3: Write the control tones**

```ts
import type { PaletteColors } from '../theme/palettes';

/**
 * Fill and label pairs for the small Apricot controls (spec §8.4): chips, the
 * count badge, the stepper circles and the segmented control. Pure, like
 * `button-tones.ts`, so `controls.spec.ts` can hold each pair to AA in both
 * modes without a renderer.
 */
export const CHIP_VARIANTS = ['pill', 'tag'] as const;

export type ChipVariant = (typeof CHIP_VARIANTS)[number];

export interface ControlTone {
  fill: string;
  label: string;
  border: string;
}

export function chipTone(
  colors: PaletteColors,
  variant: ChipVariant,
  selected: boolean,
): ControlTone {
  if (variant === 'tag') {
    // The location tag inside a tile, which is never selectable.
    return { fill: colors.surface, label: colors.textMuted, border: colors.surface };
  }
  if (selected) return { fill: colors.text, label: colors.bg, border: colors.text };
  // The edge is kept in both modes: most chips sit on a white card.
  return { fill: colors.surface, label: colors.text, border: colors.border };
}

export function countBadgeTone(colors: PaletteColors): { fill: string; label: string } {
  return { fill: colors.text, label: colors.bg };
}

export function stepperTone(
  colors: PaletteColors,
  action: 'decrement' | 'increment',
): { fill: string; glyph: string } {
  return action === 'increment'
    ? { fill: colors.primary, glyph: colors.onFill }
    : { fill: colors.surfaceAlt, glyph: colors.text };
}

export function segmentTrack(colors: PaletteColors): string {
  return colors.surfaceAlt;
}

export function segmentTone(colors: PaletteColors, selected: boolean, isDark = false): ControlTone {
  if (!selected) return { fill: 'transparent', label: colors.textMuted, border: 'transparent' };
  // The thumb lifts off the track by its shadow in light mode and its edge in dark.
  return {
    fill: colors.surface,
    label: colors.text,
    border: isDark ? colors.border : colors.surface,
  };
}
```

- [ ] **Step 4: Restyle `Chip`, and add `CountBadge`**

`minHeight: 32` comes first, and the tag variant overrides it to 24. The chip's `hitSlop` makes up
the 44pt target.

```diff
--- a/apps/mobile/src/components/Chip.tsx
+++ b/apps/mobile/src/components/Chip.tsx
@@ -1,36 +1,56 @@
 import { Pressable } from 'react-native';
 import { AppText } from './AppText';
+import { chipTone, type ChipVariant } from './control-tones';
 import { hitSlop, radius, spacing } from '../theme';
 import { useTheme } from '../theme/useTheme';

+export type { ChipVariant } from './control-tones';
+
 export interface ChipProps {
   label: string;
   selected?: boolean;
   onPress?: () => void;
   accessibilityLabel?: string;
+  /** `tag` is the small location label inside a tile (spec §8.4). */
+  variant?: ChipVariant;
 }

-/** Selectable pill used for filters, plan slots and preference toggles. */
-export function Chip({ label, selected, onPress, accessibilityLabel }: ChipProps) {
+/** A 32pt pill for filters, plan slots and preferences, 56pt to the touch. */
+export function Chip({
+  label,
+  selected = false,
+  onPress,
+  accessibilityLabel,
+  variant = 'pill',
+}: ChipProps) {
   const { colors } = useTheme();
+  const tone = chipTone(colors, variant, selected);
+  const tag = variant === 'tag';

   return (
     <Pressable
-      accessibilityRole="button"
-      accessibilityState={{ selected: !!selected }}
+      accessibilityRole={onPress ? 'button' : 'text'}
+      accessibilityState={onPress ? { selected } : undefined}
       accessibilityLabel={accessibilityLabel ?? label}
+      disabled={!onPress}
       hitSlop={hitSlop}
       onPress={onPress}
-      style={{
-        paddingHorizontal: spacing.md,
-        paddingVertical: spacing.sm,
-        borderRadius: radius.pill,
-        borderWidth: 1,
-        borderColor: selected ? colors.primary : colors.border,
-        backgroundColor: selected ? colors.primarySoft : colors.surface,
-      }}
+      style={({ pressed }) => [
+        {
+          minHeight: 32,
+          justifyContent: 'center',
+          paddingHorizontal: spacing.md,
+          borderRadius: radius.pill,
+          borderWidth: 1,
+          borderColor: tone.border,
+          backgroundColor: tone.fill,
+          opacity: pressed ? 0.85 : 1,
+          transform: [{ scale: pressed ? 0.98 : 1 }],
+        },
+        tag ? { minHeight: 24, paddingHorizontal: spacing.sm, borderRadius: radius.xs } : null,
+      ]}
     >
-      <AppText variant="label" style={{ color: selected ? colors.primaryText : colors.textMuted }}>
+      <AppText variant={tag ? 'caption' : 'label'} style={{ color: tone.label }}>
         {label}
       </AppText>
     </Pressable>
```

`CountBadge` uses tabular numerals and **no** raw `lineHeight`: the theme guard rejects one outside
`theme/`.

```diff
--- a/apps/mobile/src/components/Badge.tsx
+++ b/apps/mobile/src/components/Badge.tsx
@@ -1,5 +1,6 @@
 import { View } from 'react-native';
 import { AppText } from './AppText';
+import { countBadgeTone } from './control-tones';
 import { radius, spacing, type PaletteColors } from '../theme';
 import { useTheme } from '../theme/useTheme';

@@ -37,3 +38,34 @@ export function Badge({ label, tone = 'neutral' }: BadgeProps) {
     </View>
   );
 }
+
+export interface CountBadgeProps {
+  count: number;
+  /** Spoken instead of the bare number, e.g. "3 photos". */
+  accessibilityLabel?: string;
+}
+
+/** A 20pt count circle in `text` with a `bg` numeral (spec §8.4). */
+export function CountBadge({ count, accessibilityLabel }: CountBadgeProps) {
+  const { colors } = useTheme();
+  const tone = countBadgeTone(colors);
+  return (
+    <View
+      accessible
+      accessibilityLabel={accessibilityLabel ?? String(count)}
+      style={{
+        minWidth: 20,
+        minHeight: 20,
+        borderRadius: radius.pill,
+        paddingHorizontal: spacing.xs,
+        alignItems: 'center',
+        justifyContent: 'center',
+        backgroundColor: tone.fill,
+      }}
+    >
+      <AppText variant="caption" style={{ color: tone.label, fontVariant: ['tabular-nums'] }}>
+        {count}
+      </AppText>
+    </View>
+  );
+}
```

```diff
--- a/apps/mobile/src/components/index.ts
+++ b/apps/mobile/src/components/index.ts
@@ -1,7 +1,7 @@
 export { AppText } from './AppText';
 export { AuthLayout } from './AuthLayout';
 export { AuthSwitchLink } from './AuthSwitchLink';
-export { Badge } from './Badge';
+export { Badge, CountBadge } from './Badge';
 export { Button } from './Button';
 export { Card } from './Card';
 export { Chip } from './Chip';
```

- [ ] **Step 5: Rebuild `QuantityStepper`**

The first `height:` literal is the 44pt Pressable around each 32pt circle. The whole control is one
`accessible` element with `accessibilityRole="adjustable"`, an `accessibilityValue`, and increment
and decrement actions, so VoiceOver users swipe up and down instead of hunting for two buttons.

```tsx
import { Pressable, View } from 'react-native';
import { AppText } from './AppText';
import { Icon } from './Icon';
import { stepperTone } from './control-tones';
import { spacing } from '../theme';
import { useTheme } from '../theme/useTheme';

export interface QuantityStepperProps {
  value: number;
  onChange: (value: number) => void;
  step?: number;
  min?: number;
  /** Replaces the bare number, e.g. "8 cups". */
  label?: string;
  /** Shown as a caption under the value, e.g. "kg". */
  unit?: string;
  /** What is being adjusted, spoken before the value. */
  accessibilityLabel?: string;
  decrementLabel: string;
  incrementLabel: string;
}

/**
 * `−` and `+` circles of 32pt, each centred in a 44pt Pressable, around a
 * `bodyStrong` value (spec §8.4). To a screen reader it is one adjustable
 * element: swipe up or down to change it. Row direction mirrors under RTL.
 */
export function QuantityStepper({
  value,
  onChange,
  step = 1,
  min = 0,
  label,
  unit,
  accessibilityLabel,
  decrementLabel,
  incrementLabel,
}: QuantityStepperProps) {
  const { colors } = useTheme();
  const decrement = () => onChange(Math.max(min, value - step));
  const increment = () => onChange(value + step);
  const atMin = value <= min;
  const display = label ?? String(value);

  const circle = (action: 'decrement' | 'increment', onPress: () => void, disabled: boolean) => {
    const tone = stepperTone(colors, action);
    return (
      <Pressable
        onPress={onPress}
        disabled={disabled}
        style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
      >
        {({ pressed }) => (
          <View
            style={{
              width: 32,
              height: 32,
              borderRadius: 16,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: tone.fill,
              opacity: disabled ? 0.4 : pressed ? 0.85 : 1,
              transform: [{ scale: pressed ? 0.98 : 1 }],
            }}
          >
            <Icon name={action === 'increment' ? 'plus' : 'minus'} size={18} color={tone.glyph} />
          </View>
        )}
      </Pressable>
    );
  };

  return (
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ text: unit ? `${display} ${unit}` : display }}
      accessibilityActions={[
        { name: 'increment', label: incrementLabel },
        { name: 'decrement', label: decrementLabel },
      ]}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === 'increment') increment();
        else if (event.nativeEvent.actionName === 'decrement' && !atMin) decrement();
      }}
      style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}
    >
      {circle('decrement', decrement, atMin)}
      <View style={{ minWidth: 40, alignItems: 'center' }}>
        <AppText variant="bodyStrong" center style={{ fontVariant: ['tabular-nums'] }}>
          {display}
        </AppText>
        {unit ? (
          <AppText variant="caption" muted center>
            {unit}
          </AppText>
        ) : null}
      </View>
      {circle('increment', increment, false)}
    </View>
  );
}
```

- [ ] **Step 6: Rebuild `SegmentedControl`**

The track is `minHeight: 44`. Segments are buttons with a `selected` state, not tabs, because
selecting one filters the screen rather than switching it. Labels wrap to two lines instead of
truncating in Arabic.

```tsx
import { Pressable, View } from 'react-native';
import { AppText } from './AppText';
import { segmentTone, segmentTrack } from './control-tones';
import { radius, spacing } from '../theme';
import { useTheme } from '../theme/useTheme';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

export interface SegmentedControlProps<T extends string> {
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
}

/**
 * Equal segments on a sunk track, with the choice on a raised white thumb
 * (spec §6.7: track `surfaceAlt`, thumb radius `sm`). Labels wrap rather than
 * truncate, so a long Arabic label grows the track instead of losing words.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: SegmentedControlProps<T>) {
  const { colors, isDark, shadow } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        minHeight: 44,
        padding: spacing.xs,
        borderRadius: radius.sm + spacing.xs,
        backgroundColor: segmentTrack(colors),
      }}
    >
      {options.map((option) => {
        const selected = option.value === value;
        const tone = segmentTone(colors, selected, isDark);
        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            hitSlop={spacing.xs}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => [
              {
                flex: 1,
                alignItems: 'center',
                justifyContent: 'center',
                paddingHorizontal: spacing.sm,
                paddingVertical: spacing.xs,
                borderRadius: radius.sm,
                borderWidth: 1,
                borderColor: tone.border,
                backgroundColor: tone.fill,
                opacity: pressed && !selected ? 0.85 : 1,
              },
              selected && !isDark ? shadow.card : null,
            ]}
          >
            <AppText variant="label" center numberOfLines={2} style={{ color: tone.label }}>
              {option.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}
```

- [ ] **Step 7: Round `Field` to `md`**

```diff
--- a/apps/mobile/src/components/Field.tsx
+++ b/apps/mobile/src/components/Field.tsx
@@ -36,8 +36,8 @@ export const Field = forwardRef<TextInput, FieldProps>(function Field(
             minHeight: 48,
             borderWidth: 1,
             borderColor: error ? colors.danger : colors.border,
-            borderRadius: radius.xs,
-            paddingHorizontal: spacing.md,
+            borderRadius: radius.md,
+            paddingHorizontal: spacing.lg,
             backgroundColor: colors.surface,
             color: colors.text,
             fontSize: 16,
```

- [ ] **Step 8: Migrate the stepper's callers**

`item/[id]` and `ReviewList` pass their unit through the new `unit` prop instead of drawing it
beside the stepper. Every caller now names what it adjusts, because "Increase" alone tells a screen
reader nothing.

```diff
--- a/apps/mobile/src/app/item/[id].tsx
+++ b/apps/mobile/src/app/item/[id].tsx
@@ -170,15 +170,14 @@ export default function ItemDetail() {
         <AppText variant="label" muted>
           {t('inventory.quantity')}
         </AppText>
-        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
-          <QuantityStepper
-            value={item.quantity}
-            onChange={onAdjust}
-            decrementLabel={t('mobile.common.decrease')}
-            incrementLabel={t('mobile.common.increase')}
-          />
-          <AppText muted>{unitLabel(t, item.unit)}</AppText>
-        </View>
+        <QuantityStepper
+          value={item.quantity}
+          onChange={onAdjust}
+          unit={unitLabel(t, item.unit)}
+          accessibilityLabel={t('inventory.quantity')}
+          decrementLabel={t('mobile.common.decrease')}
+          incrementLabel={t('mobile.common.increase')}
+        />
       </Card>

       <Card style={{ gap: spacing.md }}>
```

```diff
--- a/apps/mobile/src/features/capture/ReviewList.tsx
+++ b/apps/mobile/src/features/capture/ReviewList.tsx
@@ -80,15 +80,14 @@ export function ReviewList({ session, source, locations, submitting, onConfirm }

           {row.include ? (
             <>
-              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
-                <QuantityStepper
-                  value={row.quantity}
-                  onChange={(quantity) => update(row.tempId, { quantity })}
-                  decrementLabel={t('common.delete')}
-                  incrementLabel={t('common.add')}
-                />
-                <AppText muted>{unitLabel(t, row.unit)}</AppText>
-              </View>
+              <QuantityStepper
+                value={row.quantity}
+                onChange={(quantity) => update(row.tempId, { quantity })}
+                unit={unitLabel(t, row.unit)}
+                accessibilityLabel={localizedName(locale, row.nameEn, row.nameAr)}
+                decrementLabel={t('common.delete')}
+                incrementLabel={t('common.add')}
+              />

               <View style={{ gap: spacing.xs }}>
                 <AppText variant="label" muted>
```

```diff
--- a/apps/mobile/src/app/entry/[id].tsx
+++ b/apps/mobile/src/app/entry/[id].tsx
@@ -86,7 +86,10 @@ export default function EntryDetail() {
         />
         <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
           <Badge label={t(SLOT_KEY[entry.slot])} />
-          <Badge tone={STATE_TONE[entry.state] ?? 'neutral'} label={t(`plans.${entry.state}` as MessageKey)} />
+          <Badge
+            tone={STATE_TONE[entry.state] ?? 'neutral'}
+            label={t(`plans.${entry.state}` as MessageKey)}
+          />
           {entry.fullyCovered ? <Badge tone="success" label={t('plans.fullyCovered')} /> : null}
         </View>
         <AppText variant="caption" muted>
@@ -104,6 +107,7 @@ export default function EntryDetail() {
           value={entry.servings}
           min={1}
           onChange={(servings) => update.mutate({ entryId: entry.id, body: { servings } })}
+          accessibilityLabel={t('mobile.plans.servings')}
           decrementLabel={t('mobile.common.decrease')}
           incrementLabel={t('mobile.common.increase')}
         />
```

```diff
--- a/apps/mobile/src/app/generate-plan.tsx
+++ b/apps/mobile/src/app/generate-plan.tsx
@@ -182,6 +182,7 @@ export default function GeneratePlan() {
           value={servings}
           onChange={setServings}
           min={1}
+          accessibilityLabel={t('mobile.plans.servings')}
           decrementLabel={t('mobile.common.decrease')}
           incrementLabel={t('mobile.common.increase')}
         />
```

```diff
--- a/apps/mobile/src/app/profile.tsx
+++ b/apps/mobile/src/app/profile.tsx
@@ -103,6 +103,7 @@ export default function Profile() {
             value={data.householdSize}
             min={1}
             onChange={(householdSize) => update.mutate({ householdSize })}
+            accessibilityLabel={t('profile.householdSize')}
             decrementLabel={t('mobile.common.decrease')}
             incrementLabel={t('mobile.common.increase')}
           />
@@ -162,9 +163,7 @@ export default function Profile() {
               key={item}
               label={item}
               selected
-              onPress={() =>
-                update.mutate({ allergies: data.allergies.filter((a) => a !== item) })
-              }
+              onPress={() => update.mutate({ allergies: data.allergies.filter((a) => a !== item) })}
             />
           ))}
         </View>
```

```diff
--- a/apps/mobile/src/app/settings/reminders.tsx
+++ b/apps/mobile/src/app/settings/reminders.tsx
@@ -145,6 +145,7 @@ export default function Reminders() {
           onChange={(v) => update.mutate({ hydrationGoalCups: clampHydrationGoal(v) })}
           min={1}
           label={t('mobile.reminders.hydrationGoalValue', { count: s.hydrationGoalCups })}
+          accessibilityLabel={t('mobile.reminders.hydrationGoalTitle')}
           decrementLabel={t('mobile.reminders.decrease')}
           incrementLabel={t('mobile.reminders.increase')}
         />
@@ -166,6 +167,7 @@ export default function Reminders() {
             onChange={(v) => update.mutate({ quietHoursStart: clampQuietHour(v) })}
             min={0}
             label={t('mobile.reminders.hourValue', { hour: s.quietHoursStart })}
+            accessibilityLabel={t('mobile.reminders.quietFrom')}
             decrementLabel={t('mobile.reminders.decrease')}
             incrementLabel={t('mobile.reminders.increase')}
           />
@@ -179,6 +181,7 @@ export default function Reminders() {
             onChange={(v) => update.mutate({ quietHoursEnd: clampQuietHour(v) })}
             min={0}
             label={t('mobile.reminders.hourValue', { hour: s.quietHoursEnd })}
+            accessibilityLabel={t('mobile.reminders.quietTo')}
             decrementLabel={t('mobile.reminders.decrease')}
             incrementLabel={t('mobile.reminders.increase')}
           />
```

- [ ] **Step 9: Run the gates**

```bash
pnpm --filter @kitchen/mobile exec vitest run src/components/controls.spec.ts src/theme/token-usage.spec.ts
pnpm --filter @kitchen/mobile test
pnpm --filter @kitchen/mobile typecheck && pnpm --filter @kitchen/mobile lint
```

Expected: **19 passed (19)**; the suite **56 files, 675 tests**; typecheck and lint exit 0.

- [ ] **Step 10: Format and commit**

```bash
npx prettier --config packages/config/prettier.config.mjs --write \
  apps/mobile/src/components/control-tones.ts \
  apps/mobile/src/components/controls.spec.ts \
  apps/mobile/src/components/Chip.tsx \
  apps/mobile/src/components/Badge.tsx \
  apps/mobile/src/components/QuantityStepper.tsx \
  apps/mobile/src/components/SegmentedControl.tsx \
  apps/mobile/src/components/Field.tsx \
  apps/mobile/src/components/index.ts \
  apps/mobile/src/theme/token-usage.spec.ts \
  'apps/mobile/src/app/item/[id].tsx' \
  apps/mobile/src/features/capture/ReviewList.tsx \
  'apps/mobile/src/app/entry/[id].tsx' \
  apps/mobile/src/app/generate-plan.tsx \
  apps/mobile/src/app/profile.tsx \
  apps/mobile/src/app/settings/reminders.tsx
git add \
  apps/mobile/src/components/control-tones.ts \
  apps/mobile/src/components/controls.spec.ts \
  apps/mobile/src/components/Chip.tsx \
  apps/mobile/src/components/Badge.tsx \
  apps/mobile/src/components/QuantityStepper.tsx \
  apps/mobile/src/components/SegmentedControl.tsx \
  apps/mobile/src/components/Field.tsx \
  apps/mobile/src/components/index.ts \
  apps/mobile/src/theme/token-usage.spec.ts \
  'apps/mobile/src/app/item/[id].tsx' \
  apps/mobile/src/features/capture/ReviewList.tsx \
  'apps/mobile/src/app/entry/[id].tsx' \
  apps/mobile/src/app/generate-plan.tsx \
  apps/mobile/src/app/profile.tsx \
  apps/mobile/src/app/settings/reminders.tsx
git commit -m "feat(mobile): restyle chips, badges, stepper, segmented control and fields" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 4: `Tile` and `Bento`; cards and sheets lift the Apricot way

**Files:**

- Create: `apps/mobile/src/components/tile-layout.ts`, `apps/mobile/src/components/tile-layout.spec.ts`
- Create: `apps/mobile/src/theme/scrim.ts`, `apps/mobile/src/theme/scrim.spec.ts`
- Create: `apps/mobile/src/components/Tile.tsx`
- Modify: `apps/mobile/src/components/Card.tsx:10-26, 32-46, 68-74`
- Modify: `apps/mobile/src/components/Sheet.tsx:2-9, 24-30, 46-51, 56-77`
- Modify: `apps/mobile/src/components/visual-rhythm.spec.ts:49-54`
- Modify: `apps/mobile/src/theme/token-usage.spec.ts:46-51`
- Modify: `apps/mobile/src/components/index.ts:29-32`

**Interfaces:**

- Consumes: `useTheme()` for `tintNamed`, `scrim`, `shadow` and `isDark`; `RoundButton` from Task 2.
- Produces:
  - `BENTO_GUTTER = 12`, `TileSpan = 1 | 2`, `BentoRow { indices, filler }`, and
    `bentoRows(spans)`. Halves pair up, a full tile takes its own row, and a lone half gets a
    filler.
  - `scrimGradient(scrim)`, which returns `{ colors, locations }` typed as `LinearGradient`
    tuples.
  - `Tile`, with these props:
    - `accessibilityLabel` (required)
    - `span`, `tint` (a `TintName` or `'photo'`), `image`, `onPress`
    - `icon`, `corner`, `count`, `caption`, `children`
    - `height`, `style`, `testID`
  - `Bento({ children })` and `BentoColumn({ children, span? })`.
  - `Card` and `Sheet`: the same props as today.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest';
import { BENTO_GUTTER, bentoRows } from './tile-layout';

describe('bento grid (spec §6.7)', () => {
  it('uses a 12pt gutter', () => {
    expect(BENTO_GUTTER).toBe(12);
  });

  it('pairs half tiles and gives a full tile its own row', () => {
    expect(bentoRows([2, 1, 1, 2])).toEqual([
      { indices: [0], filler: false },
      { indices: [1, 2], filler: false },
      { indices: [3], filler: false },
    ]);
  });

  it('keeps a lone half tile at half width instead of stretching it', () => {
    expect(bentoRows([1, 1, 1])).toEqual([
      { indices: [0, 1], filler: false },
      { indices: [2], filler: true },
    ]);
  });

  it('closes a half row before a full tile, preserving order', () => {
    expect(bentoRows([1, 2, 1])).toEqual([
      { indices: [0], filler: true },
      { indices: [1], filler: false },
      { indices: [2], filler: true },
    ]);
  });

  it('lays out nothing for no tiles', () => {
    expect(bentoRows([])).toEqual([]);
  });
});
```

```ts
import { describe, expect, it } from 'vitest';
import { scrimGradient } from './scrim';
import { palettes, type ThemeMode } from './palettes';

describe.each(['light', 'dark'] as ThemeMode[])('photo scrim gradient, apricot %s', (mode) => {
  const { scrim } = palettes.apricot[mode];
  const gradient = scrimGradient(scrim);

  it('keeps every stop the palette guard measured, in order', () => {
    // palette.spec proves text is legible over these exact stops; the
    // gradient has to render the same ramp, not an approximation of it.
    expect(gradient.locations).toEqual(scrim.stops.map(([position]) => position));
  });

  it('paints each stop in the scrim colour at its alpha', () => {
    const channels = [1, 3, 5].map((i) => parseInt(scrim.rgb.slice(i, i + 2), 16)).join(',');
    expect(gradient.colors).toEqual(scrim.stops.map(([, alpha]) => `rgba(${channels},${alpha})`));
  });
});
```

```diff
--- a/apps/mobile/src/components/visual-rhythm.spec.ts
+++ b/apps/mobile/src/components/visual-rhythm.spec.ts
@@ -49,6 +49,35 @@ describe('pushed-screen header', () => {
   });
 });

+describe('surfaces', () => {
+  it.each(['./Card.tsx', './Tile.tsx'])(
+    '%s lifts by shadow in light mode and by its edge in dark mode',
+    (file) => {
+      // Spec §6.7: a dark page makes any shadow invisible, so depth moves to
+      // the border there; in light mode the border matches the fill.
+      const source = read(file);
+      expect(source).toMatch(/isDark \? colors\.border/);
+      expect(source).toMatch(/shadow\.card/);
+    },
+  );
+
+  it.each(['./Card.tsx', './Tile.tsx'])(
+    '%s dims to 0.92 and scales to 0.98 when pressed',
+    (file) => {
+      const source = read(file);
+      expect(source).toMatch(/pressed \? 0\.92/);
+      expect(source).toMatch(/scale: pressed \? 0\.98/);
+    },
+  );
+
+  it('a sheet floats on the raised shadow and closes through a sunk round button', () => {
+    const source = read('./Sheet.tsx');
+    expect(source).toMatch(/shadow\.raised/);
+    expect(source).toMatch(/<RoundButton[^>]*tone="sunk"/);
+    expect(source).toMatch(/variant="title"/);
+  });
+});
+
 describe('screen rhythm', () => {
   const source = read('./Screen.tsx');
```

```diff
--- a/apps/mobile/src/theme/token-usage.spec.ts
+++ b/apps/mobile/src/theme/token-usage.spec.ts
@@ -46,6 +46,7 @@ describe('mobile source sweep', () => {
     'RoundButton.tsx': /height:\s*(\d+)/,
     'SegmentedControl.tsx': /minHeight:\s*(\d+)/,
     'StarRating.tsx': /minHeight:\s*(\d+)/,
+    'Tile.tsx': /minHeight:\s*(\d+)/,
   };

   it('keeps every interactive control at or above the 44pt minimum', () => {
```

- [ ] **Step 2: Run them and watch them fail**

```bash
pnpm --filter @kitchen/mobile exec vitest run src/components/tile-layout.spec.ts src/theme/scrim.spec.ts src/components/visual-rhythm.spec.ts src/theme/token-usage.spec.ts
```

Expected: **4 files failed; 6 failed | 10 passed (16)**. The failures are:

- `tile-layout.spec.ts` and `scrim.spec.ts` fail to load (`Failed to load url ./tile-layout` and
  `./scrim`).
- The `Card.tsx` edge test fails with `… to match /isDark \? colors\.border/`.
- The `Card.tsx` press test fails with `… to match /pressed \? 0\.92/`.
- Both `Tile.tsx` surface tests, and the 44pt sweep, fail with
  `ENOENT: … open '…/components/Tile.tsx'`.
- "a sheet floats on the raised shadow and closes through a sunk round button" fails with
  `… to match /shadow\.raised/`.

- [ ] **Step 3: Write the layout and scrim helpers**

```ts
/**
 * The bento grid (spec §6.7): two columns with a 12pt gutter. Kept free of
 * React Native so the row packing is testable on its own.
 */
export const BENTO_GUTTER = 12;

export type TileSpan = 1 | 2;

export interface BentoRow {
  /** Indices into the children, in reading order. */
  indices: number[];
  /** True when a half tile stands alone and an empty half keeps its width. */
  filler: boolean;
}

/**
 * Packs spans into rows: a full tile takes a row alone and half tiles pair up.
 * A half tile with no partner keeps its half rather than stretching, so the
 * grid never shows a lone tile twice the width of the one above it.
 */
export function bentoRows(spans: readonly TileSpan[]): BentoRow[] {
  const rows: BentoRow[] = [];
  let pending: number | null = null;
  spans.forEach((span, index) => {
    if (span === 2) {
      if (pending !== null) rows.push({ indices: [pending], filler: true });
      pending = null;
      rows.push({ indices: [index], filler: false });
    } else if (pending === null) {
      pending = index;
    } else {
      rows.push({ indices: [pending, index], filler: false });
      pending = null;
    }
  });
  if (pending !== null) rows.push({ indices: [pending], filler: true });
  return rows;
}
```

```ts
import type { Scrim } from './palettes';

export interface ScrimGradient {
  colors: readonly [string, string, ...string[]];
  locations: readonly [number, number, ...number[]];
}

/**
 * Turns the palette's scrim into `LinearGradient` props, stop for stop, so the
 * ramp on screen is exactly the one `palette.spec.ts` measured text against.
 */
export function scrimGradient(scrim: Scrim): ScrimGradient {
  const channels = [1, 3, 5].map((i) => parseInt(scrim.rgb.slice(i, i + 2), 16)).join(',');
  const colors = scrim.stops.map(([, alpha]) => `rgba(${channels},${alpha})`);
  const locations = scrim.stops.map(([position]) => position);
  return {
    colors: colors as unknown as ScrimGradient['colors'],
    locations: locations as unknown as ScrimGradient['locations'],
  };
}
```

- [ ] **Step 4: Write `Tile`, `Bento` and `BentoColumn`**

Tile styling:

- `minHeight: 120` is the first `minHeight` literal. Screens pass their exact height (150, 220 or
  168 in the mocks) through `height`.
- A photo tile has no shadow, because iOS drops a shadow on a view that clips with
  `overflow: 'hidden'`. Its text is `textInverse` over the scrim.
- Inside a `Bento`, a context makes each tile `flex: 1`, so a pair shares its row evenly.

```tsx
import {
  Children,
  createContext,
  isValidElement,
  useContext,
  type ReactElement,
  type ReactNode,
} from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  View,
  type ImageSourcePropType,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';
import { BENTO_GUTTER, bentoRows, type TileSpan } from './tile-layout';
import { radius, spacing, type TintName } from '../theme';
import { scrimGradient } from '../theme/scrim';
import { useTheme } from '../theme/useTheme';

export type { TileSpan } from './tile-layout';
export type TileTint = TintName | 'photo';

export interface TileProps {
  /** Read by `Bento`: a whole row, or half of one. */
  span?: TileSpan;
  tint?: TileTint;
  /** The photo under the scrim. Only drawn when `tint` is `'photo'`. */
  image?: ImageSourcePropType;
  onPress?: () => void;
  /** The whole sentence a screen reader hears, e.g. "32 items at home". */
  accessibilityLabel: string;
  /** Drawn in a 36pt circle at the top. */
  icon?: IconName;
  /** The trailing chip or arrow at the top. */
  corner?: ReactNode;
  count?: string | number;
  caption?: string;
  /** Extra content in the bottom block, above the count. */
  children?: ReactNode;
  /** Taller kinds (§6.7): 150 for a count tile, 220 for the hero, 168 for review. */
  height?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** True inside `Bento`, where a tile shares its row or column by flex. */
const InBento = createContext(false);

/**
 * The bento tile (spec §8.2): radius `xl`, a tint or a photo, and an optional
 * icon, count and caption. It is one accessibility element. Text on a photo
 * sits in the bottom block, which is where the scrim is dark enough for it.
 */
export function Tile({
  tint = 'plain',
  image,
  onPress,
  accessibilityLabel,
  icon,
  corner,
  count,
  caption,
  children,
  height,
  style,
  testID,
}: TileProps) {
  const { colors, isDark, shadow, scrim, tintNamed } = useTheme();
  const inBento = useContext(InBento);
  const photo = tint === 'photo';
  const fill = photo ? colors.surfaceInverse : tintNamed(tint).bg;
  const ink = photo ? { color: colors.textInverse } : undefined;

  const container: ViewStyle = {
    minHeight: 120,
    padding: spacing.lg,
    gap: spacing.sm,
    borderRadius: radius.xl,
    borderWidth: photo ? 0 : 1,
    borderColor: isDark ? colors.border : fill,
    backgroundColor: fill,
    // iOS clips a shadow with the content, so a photo tile goes without one.
    ...(photo ? { overflow: 'hidden' } : isDark ? null : shadow.card),
    ...(height ? { minHeight: height } : null),
    ...(inBento ? { flex: 1 } : null),
  };

  const body = (
    <>
      {photo && image ? (
        <>
          <Image
            source={image}
            resizeMode="cover"
            style={StyleSheet.absoluteFill}
            accessibilityIgnoresInvertColors
          />
          <LinearGradient {...scrimGradient(scrim)} style={StyleSheet.absoluteFill} />
        </>
      ) : null}
      {icon || corner ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
          }}
        >
          {icon ? (
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: tint === 'plain' ? colors.surfaceAlt : colors.surface,
              }}
            >
              <Icon name={icon} size={18} color={colors.text} />
            </View>
          ) : (
            <View />
          )}
          {corner}
        </View>
      ) : null}
      <View style={{ flex: 1 }} />
      {children}
      {count !== undefined ? (
        <AppText variant="numeral" style={ink}>
          {count}
        </AppText>
      ) : null}
      {caption ? (
        <AppText variant="caption" muted={!photo} style={ink}>
          {caption}
        </AppText>
      ) : null}
    </>
  );

  if (!onPress) {
    return (
      <View
        accessible
        accessibilityLabel={accessibilityLabel}
        testID={testID}
        style={[container, style]}
      >
        {body}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        container,
        { opacity: pressed ? 0.92 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] },
        style,
      ]}
    >
      {body}
    </Pressable>
  );
}

export interface BentoProps {
  children: ReactNode;
}

/**
 * Lays tiles and columns out on the two-column grid (spec §6.7). Each child's
 * `span` decides whether it takes a row or half of one.
 */
export function Bento({ children }: BentoProps) {
  const items = Children.toArray(children).filter(isValidElement) as ReactElement<{
    span?: TileSpan;
  }>[];
  const rows = bentoRows(items.map((item) => item.props.span ?? 1));
  return (
    <InBento.Provider value>
      <View style={{ gap: BENTO_GUTTER }}>
        {rows.map((row) => (
          <View key={row.indices.join('-')} style={{ flexDirection: 'row', gap: BENTO_GUTTER }}>
            {row.indices.map((index) => items[index])}
            {row.filler ? <View style={{ flex: 1 }} /> : null}
          </View>
        ))}
      </View>
    </InBento.Provider>
  );
}

export interface BentoColumnProps {
  children: ReactNode;
  /** Read by `Bento`. A column is half a row unless told otherwise. */
  span?: TileSpan;
}

/** Stacks tiles in one half of a row; they split its height evenly. */
export function BentoColumn({ children }: BentoColumnProps) {
  return <View style={{ flex: 1, gap: BENTO_GUTTER }}>{children}</View>;
}
```

```diff
--- a/apps/mobile/src/components/index.ts
+++ b/apps/mobile/src/components/index.ts
@@ -29,4 +29,5 @@ export { SegmentedControl } from './SegmentedControl';
 export { Sheet } from './Sheet';
 export { StarRating } from './StarRating';
 export { EmptyState, ErrorState, LoadingState } from './States';
+export { Bento, BentoColumn, Tile } from './Tile';
 export { ToggleRow } from './ToggleRow';
```

- [ ] **Step 5: Lift `Card` and `Sheet`**

The `Sheet` has no grabber, because it cannot be dragged. Its close button is a `sunk` `RoundButton`,
which stays visible on the white panel.

```diff
--- a/apps/mobile/src/components/Card.tsx
+++ b/apps/mobile/src/components/Card.tsx
@@ -10,17 +10,17 @@ export interface CardProps {
   accessibilityLabel?: string;
   tone?: 'surface' | 'alt' | 'primary';
   /** Fills the card with one of the rotating pastel tints from the theme. Takes
-   *  precedence over `tone`, and drops the border so the fill reads as the edge. */
+   *  precedence over `tone`. */
   tint?: Tint;
   /** The hero treatment: the ember gradient carrying inverse text. */
   gradient?: boolean;
   style?: ViewStyle;
 }

-const toneFor = (colors: PaletteColors): Record<NonNullable<CardProps['tone']>, ViewStyle> => ({
-  surface: { backgroundColor: colors.surface, borderColor: colors.border },
-  alt: { backgroundColor: colors.surfaceAlt, borderColor: colors.border },
-  primary: { backgroundColor: colors.primarySoft, borderColor: colors.primarySoft },
+const fillFor = (colors: PaletteColors): Record<NonNullable<CardProps['tone']>, string> => ({
+  surface: colors.surface,
+  alt: colors.surfaceAlt,
+  primary: colors.primarySoft,
 });

 export function Card({
@@ -32,15 +32,19 @@ export function Card({
   gradient,
   style,
 }: CardProps) {
-  const { colors, gradientHero } = useTheme();
+  const { colors, gradientHero, isDark, shadow } = useTheme();
+  const fill = tint ? tint.bg : fillFor(colors)[tone];
+  // Spec §6.7: a light card separates from the cream page by its fill and a
+  // faint shadow, so its border matches the fill. A dark page hides any
+  // shadow, so there the depth moves onto the edge.
   const base: ViewStyle = {
     borderWidth: 1,
     borderRadius: radius.lg,
     padding: spacing.lg,
     gap: spacing.sm,
-    ...toneFor(colors)[tone],
-    ...(tint ? { backgroundColor: tint.bg, borderColor: tint.bg } : null),
-    ...(gradient ? { backgroundColor: 'transparent', borderColor: 'transparent' } : null),
+    backgroundColor: fill,
+    borderColor: isDark ? colors.border : fill,
+    ...(isDark ? null : shadow.card),
   };

   /** Ember runs from roasted cocoa up to a burnt coral, so inverse text reads
@@ -68,7 +72,10 @@ export function Card({
       accessibilityRole="button"
       accessibilityLabel={accessibilityLabel}
       onPress={onPress}
-      style={({ pressed }) => [wrapper, { opacity: pressed ? 0.9 : 1 }]}
+      style={({ pressed }) => [
+        wrapper,
+        { opacity: pressed ? 0.92 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] },
+      ]}
     >
       {body}
     </Pressable>
```

```diff
--- a/apps/mobile/src/components/Sheet.tsx
+++ b/apps/mobile/src/components/Sheet.tsx
@@ -2,8 +2,8 @@ import type { ReactNode } from 'react';
 import { KeyboardAvoidingView, Modal, Platform, Pressable, View } from 'react-native';
 import { SafeAreaView } from 'react-native-safe-area-context';
 import { AppText } from './AppText';
-import { Icon } from './Icon';
-import { hitSlop, radius, spacing } from '../theme';
+import { RoundButton } from './RoundButton';
+import { radius, spacing } from '../theme';
 import { useTheme } from '../theme/useTheme';
 import { useLocale } from '../lib/locale';

@@ -24,7 +24,7 @@ export interface SheetProps {
  */
 export function Sheet({ visible, onClose, title, children }: SheetProps) {
   const { t, dir } = useLocale();
-  const { colors } = useTheme();
+  const { colors, shadow } = useTheme();
   return (
     <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
       <Pressable
@@ -46,6 +46,7 @@ export function Sheet({ visible, onClose, title, children }: SheetProps) {
             backgroundColor: colors.surface,
             borderTopStartRadius: radius.lg,
             borderTopEndRadius: radius.lg,
+            ...shadow.raised,
           }}
         >
           <KeyboardAvoidingView
@@ -56,22 +57,16 @@ export function Sheet({ visible, onClose, title, children }: SheetProps) {
           >
             <SafeAreaView edges={['bottom']}>
               <View style={{ padding: spacing.lg, gap: spacing.md }}>
-                <View
-                  style={{
-                    flexDirection: 'row',
-                    alignItems: 'center',
-                    justifyContent: 'space-between',
-                  }}
-                >
-                  <AppText variant="heading">{title ?? ''}</AppText>
-                  <Pressable
-                    accessibilityRole="button"
+                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
+                  <AppText variant="title" accessibilityRole="header" style={{ flex: 1 }}>
+                    {title ?? ''}
+                  </AppText>
+                  <RoundButton
+                    icon="close"
+                    tone="sunk"
                     accessibilityLabel={t('common.close')}
-                    hitSlop={hitSlop}
                     onPress={onClose}
-                  >
-                    <Icon name="close" size={20} color={colors.textMuted} />
-                  </Pressable>
+                  />
                 </View>
                 {children}
               </View>
```

- [ ] **Step 6: Run the gates**

```bash
pnpm --filter @kitchen/mobile exec vitest run src/components/tile-layout.spec.ts src/theme/scrim.spec.ts src/components/visual-rhythm.spec.ts src/theme/token-usage.spec.ts
pnpm --filter @kitchen/mobile test
pnpm --filter @kitchen/mobile typecheck && pnpm --filter @kitchen/mobile lint
```

Expected: **25 passed (25)**; the suite **58 files, 689 tests**; typecheck and lint exit 0.

- [ ] **Step 7: Format and commit**

```bash
npx prettier --config packages/config/prettier.config.mjs --write \
  apps/mobile/src/components/tile-layout.ts \
  apps/mobile/src/components/tile-layout.spec.ts \
  apps/mobile/src/theme/scrim.ts \
  apps/mobile/src/theme/scrim.spec.ts \
  apps/mobile/src/components/Tile.tsx \
  apps/mobile/src/components/Card.tsx \
  apps/mobile/src/components/Sheet.tsx \
  apps/mobile/src/components/visual-rhythm.spec.ts \
  apps/mobile/src/theme/token-usage.spec.ts \
  apps/mobile/src/components/index.ts
git add \
  apps/mobile/src/components/tile-layout.ts \
  apps/mobile/src/components/tile-layout.spec.ts \
  apps/mobile/src/theme/scrim.ts \
  apps/mobile/src/theme/scrim.spec.ts \
  apps/mobile/src/components/Tile.tsx \
  apps/mobile/src/components/Card.tsx \
  apps/mobile/src/components/Sheet.tsx \
  apps/mobile/src/components/visual-rhythm.spec.ts \
  apps/mobile/src/theme/token-usage.spec.ts \
  apps/mobile/src/components/index.ts
git commit -m "feat(mobile): Tile and Bento; cards and sheets lift the Apricot way" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 5: `OrbMascot`, Mama's animated orb

**Files:**

- Create: `apps/mobile/src/lib/orb.ts`, `apps/mobile/src/lib/orb.spec.ts`
- Create: `apps/mobile/src/hooks/motion.ts`
- Create: `apps/mobile/src/components/OrbMascot.tsx`
- Modify: `apps/mobile/src/components/index.ts:18-23`
- Reads: `apps/mobile/assets/mama/orb.png`, `@2x` and `@3x`, which are already on the branch

**Interfaces:**

- Consumes: the orb PNGs, `useIsFocused` from `expo-router`, and `colors.textInverse` for the eyes.
- Produces:
  - `OrbState`: `'idle' | 'looking' | 'listening' | 'speaking'`.
  - `ORB_IMAGE_SCALE = 2.4`. The artwork includes its glow, so the image is 2.4 times the orb.
  - `ORB_MOTION`: the blink, glance, breathe and pulse timings.
  - `orbGeometry(size, state)` and `nextBlinkDelay(random?)`, which returns 4000–5999ms.
  - `useReduceMotion()` and `useAppActive()`. They live in `hooks/motion.ts` and are **not** added
    to the `hooks` barrel.
  - `OrbMascot({ size = 38, state = 'idle', style? })`. It is decorative, and never focusable.

- [ ] **Step 1: Write the geometry, motion, artwork and source guards**

The artwork cases read the PNG headers directly: dimensions 288, 576 and 864, and colour type 6
(RGBA). A re-export that loses the alpha channel fails them.

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ORB_IMAGE_SCALE, ORB_MOTION, nextBlinkDelay, orbGeometry } from './orb';

const ASSETS = join(__dirname, '..', '..', 'assets', 'mama');

describe('orb geometry (spec §8.3)', () => {
  it('sizes the eyes from the orb', () => {
    const { eye, eyes } = orbGeometry(100, 'idle');
    expect(eye.width).toBeCloseTo(11);
    expect(eye.height).toBeCloseTo(22);
    expect(eyes.gap).toBeCloseTo(14);
  });

  it('grows the eyes to 0.26 while listening', () => {
    expect(orbGeometry(100, 'listening').eye.height).toBeCloseTo(26);
  });

  it('centres the eyes slightly above the middle', () => {
    for (const state of ['idle', 'listening'] as const) {
      const { eye, eyes } = orbGeometry(100, state);
      const centre = eyes.top + eye.height / 2;
      expect(centre, state).toBeLessThan(50);
      expect(centre, state).toBeGreaterThan(40);
    }
  });

  it('draws the body image centred, 2.4 times the orb, so the glow fits', () => {
    expect(ORB_IMAGE_SCALE).toBe(2.4);
    const { image } = orbGeometry(50, 'idle');
    expect(image.size).toBeCloseTo(120);
    expect(image.offset * 2 + image.size).toBeCloseTo(50);
  });
});

describe('orb motion (spec §8.3, §13)', () => {
  it('blinks every four to six seconds', () => {
    expect(nextBlinkDelay(() => 0)).toBe(4000);
    expect(nextBlinkDelay(() => 0.5)).toBe(5000);
    expect(nextBlinkDelay(() => 0.999999)).toBeLessThan(6000);
  });

  it('breathes between 1 and 1.04 over 1.6s while listening', () => {
    expect(ORB_MOTION.breathe).toEqual({ peak: 1.04, period: 1600 });
  });
});

describe('orb artwork', () => {
  it.each([
    ['orb.png', 288],
    ['orb@2x.png', 576],
    ['orb@3x.png', 864],
  ])('%s is a %ipx square RGBA PNG', (file, pixels) => {
    // 2.4 × 120pt at each scale: the largest orb stays sharp on a 3x screen.
    const header = readFileSync(join(ASSETS, file)).subarray(0, 26);
    expect(header.subarray(1, 4).toString('ascii')).toBe('PNG');
    expect(header.readUInt32BE(16)).toBe(pixels);
    expect(header.readUInt32BE(20)).toBe(pixels);
    expect(header[25], 'colour type 6 is RGBA, so the glow is transparent').toBe(6);
  });
});

describe('OrbMascot', () => {
  const source = readFileSync(join(__dirname, '..', 'components', 'OrbMascot.tsx'), 'utf8');

  it('is decorative to assistive technology', () => {
    expect(source).toMatch(/accessibilityElementsHidden/);
    expect(source).toMatch(/importantForAccessibility="no-hide-descendants"/);
  });

  it('stops under Reduce Motion, off screen and in the background', () => {
    expect(source).toMatch(/useReduceMotion\(\)/);
    expect(source).toMatch(/useIsFocused\(\)/);
    expect(source).toMatch(/useAppActive\(\)/);
  });

  it('animates with React Native Animated, not reanimated', () => {
    // Spec §13: reanimated 4 needs react-native-worklets, which is not a
    // declared dependency and so is not autolinked under pnpm.
    expect(source).not.toMatch(/react-native-reanimated/);
    expect(source).toMatch(/useNativeDriver: true/);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
pnpm --filter @kitchen/mobile exec vitest run src/lib/orb.spec.ts
```

Expected: **1 file failed, no tests**, with `Failed to load url ./orb`.

- [ ] **Step 3: Write the geometry**

```ts
/**
 * Geometry and timing for Mama's orb (spec §8.3). Pure, so the proportions
 * are specified by `orb.spec.ts` rather than by eye.
 */
export type OrbState = 'idle' | 'looking' | 'listening' | 'speaking';

/** The body PNG is this many times the orb, so its glow fits inside it. */
export const ORB_IMAGE_SCALE = 2.4;

export const ORB_MOTION = {
  blink: { close: 80, open: 120, squash: 0.1 },
  /** How far the eyes travel each way while `looking`, as a share of the orb. */
  glance: { travel: 0.06, move: 420, hold: 280 },
  breathe: { peak: 1.04, period: 1600 },
  pulse: { peak: 1.06, period: 520 },
} as const;

export interface OrbGeometry {
  /** The body image: its side, and its offset from the orb's top and start. */
  image: { size: number; offset: number };
  eye: { width: number; height: number };
  /** `gap` is between the eyes' inner edges; `top` is from the orb's top. */
  eyes: { gap: number; top: number };
}

/** Where the eyes' centre sits, as a share of the orb from its top. */
const EYE_CENTRE = 0.44;

export function orbGeometry(size: number, state: OrbState): OrbGeometry {
  const imageSize = size * ORB_IMAGE_SCALE;
  const height = size * (state === 'listening' ? 0.26 : 0.22);
  return {
    image: { size: imageSize, offset: (size - imageSize) / 2 },
    eye: { width: size * 0.11, height },
    eyes: { gap: size * 0.14, top: size * EYE_CENTRE - height / 2 },
  };
}

/** Milliseconds until the next idle blink: somewhere in 4–6s, so it never ticks. */
export function nextBlinkDelay(random: () => number = Math.random): number {
  return 4000 + Math.floor(random() * 2000);
}
```

- [ ] **Step 4: Add the two motion hooks**

```ts
import { useEffect, useState } from 'react';
import { AccessibilityInfo, AppState } from 'react-native';

/**
 * The system Reduce Motion setting, kept live. Spec §12–13: every decorative
 * animation stops while it is on.
 */
export function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (mounted) setReduce(value);
    });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);
  return reduce;
}

/** False while the app is in the background, so loops stop spending frames. */
export function useAppActive(): boolean {
  const [active, setActive] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) =>
      setActive(state === 'active'),
    );
    return () => subscription.remove();
  }, []);
  return active;
}
```

- [ ] **Step 5: Write `OrbMascot`**

Animation runs only when `!reduceMotion && focused && active`:

- The idle blink runs on a timer.
- `looking` is a glance loop.
- `listening` and `speaking` loop the body's scale.

Every animation is `Animated` with `useNativeDriver: true` (see Global Constraints).

```tsx
import { useEffect, useRef } from 'react';
import { Animated, Easing, Image, View, type StyleProp, type ViewStyle } from 'react-native';
import { useIsFocused } from 'expo-router';
import orb from '../../assets/mama/orb.png';
import { useAppActive, useReduceMotion } from '../hooks/motion';
import { ORB_MOTION, nextBlinkDelay, orbGeometry, type OrbState } from '../lib/orb';
import { useTheme } from '../theme/useTheme';

export type { OrbState } from '../lib/orb';

export interface OrbMascotProps {
  /** The orb's diameter, 28 to 120. */
  size?: number;
  state?: OrbState;
  style?: StyleProp<ViewStyle>;
}

const ease = Easing.inOut(Easing.sin);

/**
 * Mama (spec §8.3): the orb artwork with two capsule eyes drawn over it. It is
 * decorative; a caller that makes it tappable wraps it in a labelled button.
 * It is the app's only looping animation, and it only loops while it can be
 * seen: never under Reduce Motion, off screen, or with the app in the
 * background.
 */
export function OrbMascot({ size = 38, state = 'idle', style }: OrbMascotProps) {
  const { colors } = useTheme();
  const reduceMotion = useReduceMotion();
  const focused = useIsFocused();
  const active = useAppActive();
  const animate = !reduceMotion && focused && active;
  const { image, eye, eyes } = orbGeometry(size, state);

  const body = useRef(new Animated.Value(1)).current;
  const blink = useRef(new Animated.Value(1)).current;
  const glance = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    body.setValue(1);
    blink.setValue(1);
    glance.setValue(0);
    if (!animate) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let loop: Animated.CompositeAnimation | undefined;
    const timing = (value: Animated.Value, toValue: number, duration: number) =>
      Animated.timing(value, { toValue, duration, easing: ease, useNativeDriver: true });

    if (state === 'idle') {
      const { close, open, squash } = ORB_MOTION.blink;
      const schedule = () => {
        timer = setTimeout(() => {
          Animated.sequence([timing(blink, squash, close), timing(blink, 1, open)]).start(() => {
            if (!cancelled) schedule();
          });
        }, nextBlinkDelay());
      };
      schedule();
    } else if (state === 'looking') {
      const { travel, move, hold } = ORB_MOTION.glance;
      const distance = size * travel;
      loop = Animated.loop(
        Animated.sequence([
          timing(glance, distance, move),
          Animated.delay(hold),
          timing(glance, -distance, move * 2),
          Animated.delay(hold),
          timing(glance, 0, move),
        ]),
      );
    } else {
      const { peak, period } = state === 'listening' ? ORB_MOTION.breathe : ORB_MOTION.pulse;
      loop = Animated.loop(
        Animated.sequence([timing(body, peak, period / 2), timing(body, 1, period / 2)]),
      );
    }
    loop?.start();

    return () => {
      cancelled = true;
      clearTimeout(timer);
      loop?.stop();
      body.stopAnimation();
      blink.stopAnimation();
      glance.stopAnimation();
    };
  }, [animate, state, size, body, blink, glance]);

  const eyeStyle: ViewStyle = {
    width: eye.width,
    height: eye.height,
    borderRadius: eye.width / 2,
    backgroundColor: colors.textInverse,
  };

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={[{ width: size, height: size }, style]}
    >
      <Animated.View style={{ width: size, height: size, transform: [{ scale: body }] }}>
        <Image
          source={orb}
          style={{
            position: 'absolute',
            top: image.offset,
            start: image.offset,
            width: image.size,
            height: image.size,
          }}
        />
        <Animated.View
          style={{
            position: 'absolute',
            top: eyes.top,
            start: 0,
            width: size,
            flexDirection: 'row',
            justifyContent: 'center',
            gap: eyes.gap,
            transform: [{ translateX: glance }, { scaleY: blink }],
          }}
        >
          <View style={eyeStyle} />
          <View style={eyeStyle} />
        </Animated.View>
      </Animated.View>
    </View>
  );
}
```

```diff
--- a/apps/mobile/src/components/index.ts
+++ b/apps/mobile/src/components/index.ts
@@ -18,6 +18,7 @@ export type { IconName } from './Icon';
 export { ListRow } from './ListRow';
 export { OAuthButtons } from './OAuthButtons';
 export { OfflineBanner } from './OfflineBanner';
+export { OrbMascot } from './OrbMascot';
 export { SyncFailuresBanner } from './SyncFailuresBanner';
 export { YoutubePlayer } from './YoutubePlayer';
 export { QuantityStepper } from './QuantityStepper';
```

- [ ] **Step 6: Run the gates**

```bash
pnpm --filter @kitchen/mobile exec vitest run src/lib/orb.spec.ts
pnpm --filter @kitchen/mobile test
pnpm --filter @kitchen/mobile typecheck && pnpm --filter @kitchen/mobile lint
```

Expected: **12 passed (12)**; the suite **59 files, 701 tests**; typecheck and lint exit 0.

- [ ] **Step 7: Format and commit**

```bash
npx prettier --config packages/config/prettier.config.mjs --write \
  apps/mobile/src/lib/orb.ts \
  apps/mobile/src/lib/orb.spec.ts \
  apps/mobile/src/hooks/motion.ts \
  apps/mobile/src/components/OrbMascot.tsx \
  apps/mobile/src/components/index.ts
git add \
  apps/mobile/src/lib/orb.ts \
  apps/mobile/src/lib/orb.spec.ts \
  apps/mobile/src/hooks/motion.ts \
  apps/mobile/src/components/OrbMascot.tsx \
  apps/mobile/src/components/index.ts
git commit -m "feat(mobile): OrbMascot, Mama's animated orb" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 6: The floating capsule tab bar

**Files:**

- Create: `apps/mobile/src/lib/tab-bar.ts`, `apps/mobile/src/lib/tab-bar.spec.ts`
- Replace: `apps/mobile/src/components/TabBar.tsx` (whole file)
- Modify: `apps/mobile/src/components/Fab.tsx:29-42`
- Modify: `apps/mobile/src/components/Screen.tsx:9-14, 23-28, 35-41, 44-55`
- Modify: `apps/mobile/src/theme/token-usage.spec.ts:46-51`
- Modify (the tab screens clear the bar):
  - `apps/mobile/src/app/(tabs)/home.tsx:93-99`
  - `apps/mobile/src/app/(tabs)/plans.tsx:29-35`
  - `apps/mobile/src/app/(tabs)/more.tsx:26-32` (Task 7 deletes it)
  - `apps/mobile/src/app/(tabs)/kitchen.tsx:16-21, 35-40, 126-131`

**Interfaces:**

- Consumes: `contentMaxWidth` and `shadow.raised`.
- Produces:
  - `TAB_BAR_HEIGHT = 68`, `TAB_BAR_SIDE_INSET = 16` and `TAB_BAR_LIFT = 8`.
  - `tabBarBottom(inset)`, which is `inset + 8`.
  - `tabBarClearance(inset)`, which is `inset + 8 + 68 + 16`.
  - `splitTabs(routes)`, which returns `{ leading, trailing }` either side of the camera.
  - `useTabBarClearance()`, exported from `components/TabBar.tsx`.
  - `ScreenProps` gains `tabBar?: boolean`. When set, `edges` defaults to top/left/right, and the
    content pads its bottom by the clearance.
  - `Fab` grows to 60×60.

- [ ] **Step 1: Write the geometry and source guards**

The last case walks `app/(tabs)/*.tsx` (except `_layout`) and requires each screen to clear the bar,
through either `<Screen … tabBar` or `useTabBarClearance()`. Task 7's new Shop tab is held to it too.

```ts
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  TAB_BAR_HEIGHT,
  TAB_BAR_LIFT,
  TAB_BAR_SIDE_INSET,
  splitTabs,
  tabBarBottom,
  tabBarClearance,
} from './tab-bar';

const SRC = join(__dirname, '..');
const read = (relative: string) => readFileSync(join(SRC, relative), 'utf8');

describe('floating tab bar geometry (spec §8.1)', () => {
  it('is a 68pt capsule inset 16 from the sides', () => {
    expect(TAB_BAR_HEIGHT).toBe(68);
    expect(TAB_BAR_SIDE_INSET).toBe(16);
  });

  it('floats 8pt above the home indicator', () => {
    expect(TAB_BAR_LIFT).toBe(8);
    expect(tabBarBottom(34)).toBe(42);
    expect(tabBarBottom(0)).toBe(8);
  });

  it('asks scroll content to clear the bar by 16 more', () => {
    expect(tabBarClearance(34)).toBe(34 + 8 + 68 + 16);
    expect(tabBarClearance(0)).toBe(8 + 68 + 16);
  });

  it('puts the capture column in the middle of the tabs', () => {
    expect(splitTabs(['home', 'kitchen', 'plans', 'shopping'])).toEqual({
      leading: ['home', 'kitchen'],
      trailing: ['plans', 'shopping'],
    });
  });
});

describe('floating tab bar', () => {
  const source = read('components/TabBar.tsx');

  it('floats over the screens as a pill on the raised shadow', () => {
    expect(source).toMatch(/position: 'absolute'/);
    expect(source).toMatch(/borderRadius: radius\.pill/);
    expect(source).toMatch(/shadow\.raised/);
    expect(source).toMatch(/isDark \? colors\.border/);
  });

  it('draws no pill behind the active tab', () => {
    expect(source).not.toMatch(/focused \? colors\.primarySoft/);
  });

  it('holds a 60pt camera', () => {
    expect(read('components/Fab.tsx')).toMatch(/width: 60,\s*height: 60/);
  });

  /**
   * The bar covers the bottom of every tab screen, so each one must pad its
   * content past it: through `Screen`'s `tabBar` prop, or by reading the
   * clearance itself for a FlatList.
   */
  it.each(
    readdirSync(join(SRC, 'app', '(tabs)')).filter(
      (file) => file.endsWith('.tsx') && file !== '_layout.tsx',
    ),
  )('(tabs)/%s clears the bar', (file) => {
    const screen = read(join('app', '(tabs)', file));
    expect(screen).toMatch(/<Screen[^>]*\btabBar\b|useTabBarClearance\(\)/);
  });
});
```

Register the tab bar. Its tabs already declare `minHeight: 44`, so this line passes as soon as it is
added; it locks the size in for the rebuild:

```diff
--- a/apps/mobile/src/theme/token-usage.spec.ts
+++ b/apps/mobile/src/theme/token-usage.spec.ts
@@ -46,6 +46,7 @@ describe('mobile source sweep', () => {
     'RoundButton.tsx': /height:\s*(\d+)/,
     'SegmentedControl.tsx': /minHeight:\s*(\d+)/,
     'StarRating.tsx': /minHeight:\s*(\d+)/,
+    'TabBar.tsx': /minHeight:\s*(\d+)/,
     'Tile.tsx': /minHeight:\s*(\d+)/,
   };
```

- [ ] **Step 2: Run them and watch the new spec fail**

```bash
pnpm --filter @kitchen/mobile exec vitest run src/lib/tab-bar.spec.ts src/theme/token-usage.spec.ts
```

Expected: **1 file failed | 1 passed; 4 passed (4)**. `tab-bar.spec.ts` fails to load with
`Failed to load url ./tab-bar`.

- [ ] **Step 3: Write the geometry**

```ts
/**
 * The floating tab bar's geometry (spec §8.1): a 68pt capsule, 16pt in from
 * each side, 8pt above the home indicator. Pure, so the numbers every tab
 * screen pads by are the numbers the bar is drawn with.
 */
export const TAB_BAR_HEIGHT = 68;
export const TAB_BAR_SIDE_INSET = 16;
export const TAB_BAR_LIFT = 8;
/** Breathing room between the last row of content and the top of the bar. */
const CONTENT_GAP = 16;

/** Distance from the screen's bottom edge to the bottom of the bar. */
export function tabBarBottom(insetBottom: number): number {
  return insetBottom + TAB_BAR_LIFT;
}

/** How far a tab screen pads its scroll content so nothing ends under the bar. */
export function tabBarClearance(insetBottom: number): number {
  return tabBarBottom(insetBottom) + TAB_BAR_HEIGHT + CONTENT_GAP;
}

/** The tabs either side of the centre camera column. */
export function splitTabs<T>(routes: readonly T[]): { leading: T[]; trailing: T[] } {
  const middle = Math.floor(routes.length / 2);
  return { leading: routes.slice(0, middle), trailing: routes.slice(middle) };
}
```

- [ ] **Step 4: Rebuild `TabBar` as a floating capsule**

The capsule:

- sits `absolute` on a `box-none` wrapper, so the content under its sides stays tappable
- is capped at `contentMaxWidth`, so it doesn't stretch across a tablet
- hides while the Android keyboard is up, where it would otherwise ride above the keyboard

The active tab is `primaryText` with no pill behind it (§8.1).

```tsx
import { useEffect, useState } from 'react';
import { Keyboard, Platform, Pressable, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from './AppText';
import { Fab } from './Fab';
import {
  TAB_BAR_HEIGHT,
  TAB_BAR_SIDE_INSET,
  splitTabs,
  tabBarBottom,
  tabBarClearance,
} from '../lib/tab-bar';
import { radius, spacing } from '../theme';
import { contentMaxWidth } from '../theme/layout';
import { useTheme } from '../theme/useTheme';

/**
 * The slice of React Navigation's tab bar props this bar actually uses.
 *
 * `@react-navigation/bottom-tabs` reaches us transitively through expo-router
 * and is not a declared dependency, so importing `BottomTabBarProps` from it
 * would bind us to a package we do not control the version of. Describing the
 * shape structurally keeps the contract explicit and the import graph honest.
 */
interface TabRoute {
  key: string;
  name: string;
}

interface TabDescriptor {
  options: {
    title?: string;
    tabBarIcon?: (props: { color: string; size: number; focused: boolean }) => React.ReactNode;
  };
}

export interface TabBarProps {
  state: { index: number; routes: TabRoute[] };
  descriptors: Record<string, TabDescriptor>;
  navigation: {
    navigate: (name: string) => void;
    emit: (event: { type: 'tabPress'; target: string; canPreventDefault: true }) => {
      defaultPrevented: boolean;
    };
  };
  /** Fired by the centre action; routed by the caller, not by the tab state. */
  onCapture: () => void;
  captureLabel: string;
}

/** The bottom padding a tab screen's scroll content needs to clear the bar. */
export function useTabBarClearance(): number {
  return tabBarClearance(useSafeAreaInsets().bottom);
}

/**
 * Android resizes the window for the keyboard, which would lift a floating bar
 * onto the keyboard's top edge. iOS does not, so the keyboard simply covers it.
 */
function useAndroidKeyboardVisible(): boolean {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const show = Keyboard.addListener('keyboardDidShow', () => setVisible(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return visible;
}

/**
 * The floating capsule (spec §8.1) with a centre capture action.
 *
 * It is absolutely positioned, so React Navigation gives the screens the full
 * height and each tab screen pads its own content past the bar
 * (`useTabBarClearance`, or `Screen`'s `tabBar` prop).
 *
 * The capture button gets a real column of its own. Previously it was an
 * absolutely positioned FAB laid over a four-tab bar, which put it exactly on
 * the seam between the two middle tabs and covered about a third of each of
 * their touch targets, so taps near the circle landed unpredictably.
 *
 * Direction is never hard-coded: the row mirrors itself under RTL, so the
 * capture action stays centred and the tabs reverse with the writing system.
 */
export function TabBar({ state, descriptors, navigation, onCapture, captureLabel }: TabBarProps) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { colors, isDark, shadow } = useTheme();
  const keyboardVisible = useAndroidKeyboardVisible();

  const renderTab = (route: TabRoute, index: number) => {
    const { options } = descriptors[route.key]!;
    const focused = state.index === index;
    const color = focused ? colors.primaryText : colors.textMuted;

    const onPress = () => {
      const event = navigation.emit({
        type: 'tabPress',
        target: route.key,
        canPreventDefault: true,
      });
      if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
    };

    return (
      <Pressable
        key={route.key}
        accessibilityRole="tab"
        accessibilityState={{ selected: focused }}
        accessibilityLabel={options.title}
        onPress={onPress}
        style={{
          flex: 1,
          minHeight: 44,
          alignItems: 'center',
          justifyContent: 'center',
          gap: spacing.xs,
        }}
      >
        {options.tabBarIcon?.({ color, size: 22, focused })}
        <AppText variant="caption" style={{ color }}>
          {options.title}
        </AppText>
      </Pressable>
    );
  };

  if (keyboardVisible) return null;
  const { leading, trailing } = splitTabs(state.routes.map(renderTab));

  return (
    // Centred by a wrapper, as `Screen` does, so a tablet caps the capsule at
    // the content width in both directions.
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        bottom: tabBarBottom(insets.bottom),
        start: TAB_BAR_SIDE_INSET,
        end: TAB_BAR_SIDE_INSET,
        alignItems: 'center',
      }}
    >
      <View
        style={{
          width: '100%',
          maxWidth: contentMaxWidth(width),
          height: TAB_BAR_HEIGHT,
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: spacing.xs,
          borderRadius: radius.pill,
          borderWidth: 1,
          borderColor: isDark ? colors.border : colors.surface,
          backgroundColor: colors.surface,
          ...shadow.raised,
        }}
      >
        {leading}

        <View style={{ flex: 1, alignItems: 'center' }}>
          <Fab icon="camera" accessibilityLabel={captureLabel} onPress={onCapture} />
        </View>

        {trailing}
      </View>
    </View>
  );
}
```

```diff
--- a/apps/mobile/src/components/Fab.tsx
+++ b/apps/mobile/src/components/Fab.tsx
@@ -29,14 +29,14 @@ export function Fab({ icon = 'camera', onPress, accessibilityLabel }: FabProps)
       accessibilityLabel={accessibilityLabel}
       onPress={onPress}
       style={({ pressed }) => ({
-        width: 56,
-        height: 56,
+        width: 60,
+        height: 60,
         borderRadius: radius.pill,
         backgroundColor: pressed ? colors.primaryPressed : colors.primary,
         alignItems: 'center',
         justifyContent: 'center',
         ...shadow.raised,
-        // Scale, not opacity: a 10% fade is imperceptible on a filled 56pt
+        // Scale, not opacity: a 10% fade is imperceptible on a filled 60pt
         // circle, and press feedback only counts if it can be seen.
         transform: [{ scale: pressed ? 0.94 : 1 }],
       })}
```

- [ ] **Step 5: Let `Screen` clear the bar**

```diff
--- a/apps/mobile/src/components/Screen.tsx
+++ b/apps/mobile/src/components/Screen.tsx
@@ -9,6 +9,7 @@ import {
   RefreshControl,
 } from 'react-native';
 import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
+import { useTabBarClearance } from './TabBar';
 import { spacing } from '../theme';
 import { contentMaxWidth } from '../theme/layout';
 import { useTheme } from '../theme/useTheme';
@@ -23,6 +24,11 @@ export interface ScreenProps {
   refreshing?: boolean;
   onRefresh?: () => void;
   footer?: ReactNode;
+  /**
+   * A tab screen. The floating bar covers the bottom, so the safe area stops
+   * at the sides and the content pads past the bar instead (spec §8.1).
+   */
+  tabBar?: boolean;
 }

 /**
@@ -35,7 +41,8 @@ export function Screen({
   children,
   scroll,
   padded = true,
-  edges = ['top', 'bottom', 'left', 'right'],
+  tabBar = false,
+  edges = tabBar ? ['top', 'left', 'right'] : ['top', 'bottom', 'left', 'right'],
   style,
   contentStyle,
   refreshing,
@@ -44,12 +51,16 @@ export function Screen({
 }: ScreenProps) {
   const { colors } = useTheme();
   const { width } = useWindowDimensions();
+  const clearance = useTabBarClearance();
   const maxWidth = contentMaxWidth(width);
   // `lg` between top-level blocks against the `sm` most screens use inside a
   // section gives a real 2:1 rhythm tier. At the previous `md` the gap between
   // two sections was 12 and the gap inside one was 8, so nothing grouped and
   // every screen read as one undifferentiated stack.
-  const pad: ViewStyle = padded ? { padding: spacing.lg, gap: spacing.lg } : {};
+  const pad: ViewStyle = {
+    ...(padded ? { padding: spacing.lg, gap: spacing.lg } : null),
+    ...(tabBar ? { paddingBottom: clearance } : null),
+  };
   // `undefined` below the breakpoint leaves the phone layout untouched. Above
   // it the content is capped and centred — but the centring is applied to a
   // *wrapper* (`alignItems: 'center'`) around a max-width child, not to the
```

- [ ] **Step 6: Clear the bar on every tab screen**

Home, Plans and More take the `tabBar` prop. Kitchen scrolls a `FlatList` rather than the
`Screen`, so it pads the list's content with `useTabBarClearance()` instead.

```diff
--- a/apps/mobile/src/app/(tabs)/home.tsx
+++ b/apps/mobile/src/app/(tabs)/home.tsx
@@ -93,7 +93,12 @@ export default function Home() {
   if (plansQuery.isLoading) return <LoadingState />;

   return (
-    <Screen scroll refreshing={plansQuery.isRefetching} onRefresh={() => void plansQuery.refetch()}>
+    <Screen
+      scroll
+      tabBar
+      refreshing={plansQuery.isRefetching}
+      onRefresh={() => void plansQuery.refetch()}
+    >
       <AppText variant="title">{t('mobile.home.greeting')}</AppText>

       <Card gradient>
```

```diff
--- a/apps/mobile/src/app/(tabs)/plans.tsx
+++ b/apps/mobile/src/app/(tabs)/plans.tsx
@@ -29,7 +29,7 @@ export default function Plans() {
   const showHeaderAction = !plans.isLoading && !plans.isError && !isEmpty;

   return (
-    <Screen scroll refreshing={plans.isRefetching} onRefresh={() => void plans.refetch()}>
+    <Screen scroll tabBar refreshing={plans.isRefetching} onRefresh={() => void plans.refetch()}>
       <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
         <AppText variant="title">{t('plans.title')}</AppText>
         {showHeaderAction ? (
```

```diff
--- a/apps/mobile/src/app/(tabs)/more.tsx
+++ b/apps/mobile/src/app/(tabs)/more.tsx
@@ -26,7 +26,7 @@ export default function More() {
   );

   return (
-    <Screen scroll>
+    <Screen scroll tabBar>
       <AppText variant="title">{t('mobile.more.title')}</AppText>

       {user ? (
```

```diff
--- a/apps/mobile/src/app/(tabs)/kitchen.tsx
+++ b/apps/mobile/src/app/(tabs)/kitchen.tsx
@@ -16,6 +16,7 @@ import {
   LoadingState,
 } from '../../components';
 import type { BadgeTone } from '../../components/Badge';
+import { useTabBarClearance } from '../../components/TabBar';
 import { useFormat } from '../../hooks/useFormat';
 import { useInventory, useLocations } from '../../hooks/inventory';
 import { itemName, formatMeasure, formatExpiryLabel, locationLabel } from '../../lib/format';
@@ -35,6 +36,7 @@ const EXPIRY_TONE: Record<ExpiryStatus, BadgeTone> = {
 export default function Kitchen() {
   const { t, locale, prefs } = useFormat();
   const router = useRouter();
+  const clearance = useTabBarClearance();
   // Arriving from the home dashboard's location chart opens this list already
   // filtered; the chips stay live afterwards, so the param is only a seed.
   const params = useLocalSearchParams<{ locationId?: string }>();
@@ -126,6 +128,7 @@ export default function Kitchen() {
           contentContainerStyle={{
             padding: spacing.lg,
             paddingTop: 0,
+            paddingBottom: clearance,
             gap: spacing.sm,
           }}
           refreshing={inventory.isRefetching}
```

- [ ] **Step 7: Run the gates**

```bash
pnpm --filter @kitchen/mobile exec vitest run src/lib/tab-bar.spec.ts src/theme/token-usage.spec.ts
pnpm --filter @kitchen/mobile test
pnpm --filter @kitchen/mobile typecheck && pnpm --filter @kitchen/mobile lint
```

Expected: **15 passed (15)**; the suite **60 files, 712 tests**; typecheck and lint exit 0.

- [ ] **Step 8: Format and commit**

```bash
npx prettier --config packages/config/prettier.config.mjs --write \
  apps/mobile/src/lib/tab-bar.ts \
  apps/mobile/src/lib/tab-bar.spec.ts \
  apps/mobile/src/components/TabBar.tsx \
  apps/mobile/src/components/Fab.tsx \
  apps/mobile/src/components/Screen.tsx \
  apps/mobile/src/theme/token-usage.spec.ts \
  'apps/mobile/src/app/(tabs)/home.tsx' \
  'apps/mobile/src/app/(tabs)/plans.tsx' \
  'apps/mobile/src/app/(tabs)/more.tsx' \
  'apps/mobile/src/app/(tabs)/kitchen.tsx'
git add \
  apps/mobile/src/lib/tab-bar.ts \
  apps/mobile/src/lib/tab-bar.spec.ts \
  apps/mobile/src/components/TabBar.tsx \
  apps/mobile/src/components/Fab.tsx \
  apps/mobile/src/components/Screen.tsx \
  apps/mobile/src/theme/token-usage.spec.ts \
  'apps/mobile/src/app/(tabs)/home.tsx' \
  'apps/mobile/src/app/(tabs)/plans.tsx' \
  'apps/mobile/src/app/(tabs)/more.tsx' \
  'apps/mobile/src/app/(tabs)/kitchen.tsx'
git commit -m "feat(mobile): floating capsule tab bar" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 7: Plan and Shop tabs; More becomes Account behind the avatar

**Files:**

- Create: `apps/mobile/src/lib/initial.ts`, `apps/mobile/src/lib/initial.spec.ts`
- Create: `apps/mobile/src/lib/information-architecture.spec.ts`
- Create: `apps/mobile/src/components/AccountButton.tsx`, `Avatar.tsx`, `TabHeader.tsx`,
  `ListGroup.tsx`
- Create: `apps/mobile/src/app/account.tsx`
- Move: `apps/mobile/src/app/shopping.tsx` → `apps/mobile/src/app/(tabs)/shopping.tsx`
- Delete: `apps/mobile/src/app/(tabs)/more.tsx`
- Modify: `apps/mobile/src/app/(tabs)/_layout.tsx:3-11, 43-57`
- Modify: `apps/mobile/src/app/(tabs)/home.tsx:3-8, 99-105`, `kitchen.tsx:4-10, 77-83`, `plans.tsx:3-10, 30-46`
- Modify: `apps/mobile/src/components/ListRow.tsx:2-7, 9-18, 21-36, 44-57, 63-68, 72-77`, `apps/mobile/src/components/index.ts:1-6, 14-20`
- Modify: `packages/i18n/src/mobile.en.ts:26-31, 201-206`, `packages/i18n/src/mobile.ar.ts:18-23, 222-227`

**Interfaces:**

- Consumes: `RoundButton` (Task 2); `roundButtonTone(colors, 'soft')`; `Card` (Task 4);
  `Screen tabBar` (Task 6); `useAuthStore`, `useCredits`, `totalCredits` and `formatQty`, all
  existing.
- Produces:
  - `initialOf(name)`, which returns the first code point, upper-cased, or `null`.
  - `AccountButton()`: a 36pt `soft` `RoundButton` showing the initial (or the `user` icon), labelled
    `mobile.account.title`, which pushes `/account`.
  - `Avatar({ name, size = 44 })`: the same circle as a picture, hidden from accessibility.
  - `TabHeader({ title, caption?, action? })`.
  - `ListRowProps` gains four props:
    - `icon?: IconName`: a 36pt `surfaceAlt` circle
    - `value?: string`: muted, and exposed as `accessibilityValue`
    - `accessibilityHint?`
    - `grouped?: boolean`: 56pt, with no fill, edge or corners of its own
  - `ListGroup({ children })`: a `Card` with no padding, with hairlines between rows.
  - Routes:
    - `/account` is new.
    - `/shopping` is now a tab, at the same URL.
    - `/more` is gone. Nothing linked to it: notifications carry a `kind` and never route.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest';
import { initialOf } from './initial';

describe('initialOf', () => {
  it.each([
    ['Layla', 'L'],
    ['  layla ahmed ', 'L'],
    ['ليلى', 'ل'],
    // A surrogate pair must come out whole, not as half a character.
    ['😀 Sam', '😀'],
  ])('takes the first character of %j', (name, expected) => {
    expect(initialOf(name)).toBe(expected);
  });

  it.each([[''], ['   '], [null], [undefined]])('has no initial for %j', (name) => {
    expect(initialOf(name)).toBeNull();
  });
});
```

The IA guard pins the route files, the tab order and labels, and every destination and key More
had. `mobile.more.profile` ("Preferences") moves onto the header row as its accessibility hint,
because the row opens `/profile`.

```ts
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isMessageKey, translate } from '@kitchen/i18n';

const SRC = join(__dirname, '..');
const APP = join(SRC, 'app');
const read = (...parts: string[]) => readFileSync(join(SRC, ...parts), 'utf8');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) && !/\.spec\.tsx?$/.test(name) ? [path] : [];
  });
}

/** Every row "More" held (spec §4.2). None of them may be dropped by the move. */
const ACCOUNT_DESTINATIONS = [
  '/profile',
  '/settings/household',
  '/ai-usage',
  '/screen',
  '/timers',
  '/wellness',
  '/settings/notifications',
  '/settings',
];

const ACCOUNT_KEYS = [
  'mobile.account.title',
  'mobile.more.profile',
  'mobile.more.household',
  'mobile.more.credits',
  'mobile.more.notifications',
  'mobile.more.settings',
  'mobile.more.signOut',
  'mobile.more.appVersion',
  'mobile.more.iconCredit',
  'mobile.screen.entry',
  'mobile.timers.entry',
  'mobile.wellness.entry',
];

describe('information architecture (spec §4)', () => {
  it('moves Shop into the tab group without changing its URL', () => {
    expect(existsSync(join(APP, '(tabs)', 'shopping.tsx'))).toBe(true);
    expect(existsSync(join(APP, 'shopping.tsx'))).toBe(false);
  });

  it('retires More', () => {
    expect(existsSync(join(APP, '(tabs)', 'more.tsx'))).toBe(false);
    for (const file of sourceFiles(SRC)) {
      expect(readFileSync(file, 'utf8'), `${file} still routes to /more`).not.toMatch(
        /['"`]\/(\(tabs\)\/)?more['"`]/,
      );
    }
  });

  it('orders the tabs Home · Kitchen · Plan · Shop', () => {
    const layout = read('app', '(tabs)', '_layout.tsx');
    const names = [...layout.matchAll(/<Tabs\.Screen\s+name="([\w-]+)"/g)].map((m) => m[1]);
    expect(names).toEqual(['home', 'kitchen', 'plans', 'shopping']);
    expect(layout).toContain("t('mobile.tabs.plan')");
    expect(layout).toContain("t('mobile.tabs.shop')");
    expect(layout).not.toContain("t('mobile.tabs.plans')");
    expect(layout).not.toContain("t('mobile.tabs.more')");
  });

  it('adds the new labels in both languages', () => {
    for (const key of ['mobile.tabs.plan', 'mobile.tabs.shop', 'mobile.account.title']) {
      expect(isMessageKey(key), `${key} is missing from the catalog`).toBe(true);
      // Arabic is typed against English, so a missing key fails the build; a
      // copied English string would not.
      expect(translate('ar', key as never)).not.toBe(translate('en', key as never));
    }
  });

  it('gives Account every destination and label More had', () => {
    const account = read('app', 'account.tsx');
    for (const href of ACCOUNT_DESTINATIONS) {
      expect(account, `Account lost the ${href} row`).toContain(`'${href}'`);
    }
    for (const key of ACCOUNT_KEYS) {
      expect(account, `Account no longer renders ${key}`).toContain(`'${key}'`);
    }
    // Shop is a tab now; a row for it would be a second way to the same place.
    expect(account).not.toContain('mobile.more.shopping');
  });

  it('puts the avatar on every tab screen', () => {
    for (const tab of ['home', 'kitchen', 'plans', 'shopping']) {
      expect(read('app', '(tabs)', `${tab}.tsx`), `${tab} has no TabHeader`).toContain(
        '<TabHeader',
      );
    }
    expect(read('components', 'TabHeader.tsx')).toContain('<AccountButton');
  });

  it('draws the avatar as a 36pt soft RoundButton that opens Account', () => {
    const button = read('components', 'AccountButton.tsx');
    expect(button).toContain('<RoundButton');
    expect(button).toContain('size={36}');
    expect(button).toContain('tone="soft"');
    expect(button).toContain("router.push('/account')");
    expect(button).toContain("t('mobile.account.title')");
  });

  it('lays grouped rows out at 56pt (spec §9.7)', () => {
    const row = read('components', 'ListRow.tsx');
    expect(row).toMatch(/grouped\s*\?\s*\{[^}]*minHeight:\s*56/);
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

```bash
pnpm --filter @kitchen/mobile exec vitest run src/lib/initial.spec.ts src/lib/information-architecture.spec.ts
```

Expected: **2 files failed; 8 failed (8)**. `initial.spec.ts` fails to load with
`Failed to load url ./initial`. Each IA case fails on the state it guards:

- "moves Shop into the tab group without changing its URL" fails with
  `expected false to be true`.
- "retires More" fails with `expected true to be false`.
- "orders the tabs Home · Kitchen · Plan · Shop" fails with
  `expected [ 'home', 'kitchen', 'plans', 'more' ] to deeply equal …`.
- "adds the new labels in both languages" fails with `mobile.tabs.plan is missing from the catalog`.
- "gives Account every destination and label More had" fails with `ENOENT … app/account.tsx`.
- "puts the avatar on every tab screen" fails with `home has no TabHeader`.
- "draws the avatar as a 36pt soft RoundButton that opens Account" fails with
  `ENOENT … components/AccountButton.tsx`.
- "lays grouped rows out at 56pt (spec §9.7)" fails with
  `… to match /grouped\s*\?\s*\{[^}]*minHeight:\s*56/`.

- [ ] **Step 3: Add the three keys, and rebuild the catalog**

The Arabic is written natively: الخطة for Plan, and التسوق for Shop, spelled as in the existing
`قائمة التسوق`. Mobile reads `@kitchen/i18n` from its `dist`, so rebuild it before running the
specs.

```diff
--- a/packages/i18n/src/mobile.en.ts
+++ b/packages/i18n/src/mobile.en.ts
@@ -26,6 +26,8 @@ export const mobileEn = {
       capture: 'Capture',
       plans: 'Plans',
       more: 'More',
+      plan: 'Plan',
+      shop: 'Shop',
     },
     home: {
       greeting: 'What should I cook tonight?',
@@ -201,6 +203,9 @@ export const mobileEn = {
       openInYoutube: 'Open in YouTube',
       imageLabel: 'Recipe image for {title}',
     },
+    account: {
+      title: 'Account',
+    },
     more: {
       title: 'More',
       shopping: 'Shopping list',
```

```diff
--- a/packages/i18n/src/mobile.ar.ts
+++ b/packages/i18n/src/mobile.ar.ts
@@ -18,6 +18,8 @@ export const mobileAr: MobileMessages = {
       capture: 'تصوير',
       plans: 'الخطط',
       more: 'المزيد',
+      plan: 'الخطة',
+      shop: 'التسوق',
     },
     home: {
       greeting: 'ماذا أطبخ الليلة؟',
@@ -222,6 +224,9 @@ export const mobileAr: MobileMessages = {
       openInYoutube: 'افتح في يوتيوب',
       imageLabel: 'صورة لوصفة {title}',
     },
+    account: {
+      title: 'الحساب',
+    },
     more: {
       title: 'المزيد',
       shopping: 'قائمة التسوق',
```

```bash
pnpm --filter @kitchen/i18n build
```

- [ ] **Step 4: Write `initialOf`**

```ts
/**
 * The avatar's glyph: the first character of a display name, or null when there
 * is none to show. `Array.from` walks code points, so an emoji comes out whole
 * rather than as half a surrogate pair. Arabic has no case, so upper-casing is
 * a no-op there.
 */
export function initialOf(name: string | null | undefined): string | null {
  const first = Array.from(name?.trim() ?? '')[0];
  return first ? first.toUpperCase() : null;
}
```

- [ ] **Step 5: Write the avatar, the tab header and the group card**

```tsx
import { useRouter } from 'expo-router';
import { RoundButton } from './RoundButton';
import { useFormat } from '../hooks/useFormat';
import { initialOf } from '../lib/initial';
import { useAuthStore } from '../stores/auth';

/**
 * The avatar at the trailing end of every tab header (spec §4.2): a 36pt
 * `soft` circle with the user's initial inside a 44pt target. It is the only
 * way to Account, which holds everything the retired More tab held.
 */
export function AccountButton() {
  const { t } = useFormat();
  const router = useRouter();
  const initial = initialOf(useAuthStore((state) => state.user?.displayName));
  return (
    <RoundButton
      size={36}
      tone="soft"
      label={initial ?? undefined}
      icon={initial ? undefined : 'user'}
      accessibilityLabel={t('mobile.account.title')}
      onPress={() => router.push('/account')}
    />
  );
}
```

```tsx
import { View } from 'react-native';
import { AppText } from './AppText';
import { Icon } from './Icon';
import { roundButtonTone } from './button-tones';
import { initialOf } from '../lib/initial';
import { CHROME_MAX_FONT_SCALE } from '../theme';
import { useTheme } from '../theme/useTheme';

export interface AvatarProps {
  name: string | null | undefined;
  size?: number;
}

/**
 * The user's initial on `primarySoft`, for places where the avatar is a picture
 * rather than a control, such as the Account header row. The tappable one in
 * tab headers is `AccountButton`; both take their colours from the `soft`
 * round-button tone so they cannot drift apart.
 */
export function Avatar({ name, size = 44 }: AvatarProps) {
  const { colors } = useTheme();
  const { fill, glyph } = roundButtonTone(colors, 'soft');
  const initial = initialOf(name);
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: fill,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {initial ? (
        <AppText
          variant="heading"
          style={{ color: glyph }}
          maxFontSizeMultiplier={CHROME_MAX_FONT_SCALE}
        >
          {initial}
        </AppText>
      ) : (
        <Icon name="user" size={Math.round(size / 2)} color={glyph} />
      )}
    </View>
  );
}
```

```tsx
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { AccountButton } from './AccountButton';
import { AppText } from './AppText';
import { spacing } from '../theme';

export interface TabHeaderProps {
  title: string;
  /** A small line above the title, as in Home's "Thursday evening". */
  caption?: string;
  /** One action before the avatar, such as Plan's `+`. */
  action?: ReactNode;
}

/**
 * The header of a tab screen (spec §8.6): a `display` title, then one optional
 * action and the avatar at the trailing end. Pushed screens use `Header`.
 */
export function TabHeader({ title, caption, action }: TabHeaderProps) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
      <View style={{ flex: 1, gap: 2 }}>
        {caption ? (
          <AppText variant="caption" muted>
            {caption}
          </AppText>
        ) : null}
        <AppText variant="display" accessibilityRole="header">
          {title}
        </AppText>
      </View>
      {action}
      <AccountButton />
    </View>
  );
}
```

```tsx
import { Children, Fragment, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Card } from './Card';
import { spacing } from '../theme';
import { useTheme } from '../theme/useTheme';

export interface ListGroupProps {
  /** `ListRow grouped` children, separated by hairlines. */
  children: ReactNode;
}

/**
 * A white group card of rows (spec §9.7), as on Account and Settings. The card
 * carries the fill, edge and shadow once, so the rows inside stay flat.
 */
export function ListGroup({ children }: ListGroupProps) {
  const { colors } = useTheme();
  const rows = Children.toArray(children);
  return (
    <Card style={{ padding: 0, gap: 0 }}>
      {rows.map((row, index) => (
        <Fragment key={index}>
          {index > 0 ? (
            <View
              style={{
                height: StyleSheet.hairlineWidth,
                marginHorizontal: spacing.lg,
                backgroundColor: colors.border,
              }}
            />
          ) : null}
          {row}
        </Fragment>
      ))}
    </Card>
  );
}
```

```diff
--- a/apps/mobile/src/components/ListRow.tsx
+++ b/apps/mobile/src/components/ListRow.tsx
@@ -2,6 +2,7 @@ import type { ReactNode } from 'react';
 import { Pressable, View, type ViewStyle } from 'react-native';
 import { AppText } from './AppText';
 import { DirectionalIcon } from './DirectionalIcon';
+import { Icon, type IconName } from './Icon';
 import { radius, spacing, type ColorToken } from '../theme';
 import { useTheme } from '../theme/useTheme';

@@ -9,10 +10,20 @@ export interface ListRowProps {
   title: string;
   subtitle?: string;
   leading?: ReactNode;
+  /** Drawn in a 36pt `surfaceAlt` circle in the leading slot (spec §9.7). */
+  icon?: IconName;
   trailing?: ReactNode;
+  /** A short current value, such as a balance, shown muted before the chevron. */
+  value?: string;
   onPress?: () => void;
   showChevron?: boolean;
   accessibilityLabel?: string;
+  accessibilityHint?: string;
+  /**
+   * A row inside a `ListGroup`: the group card owns the fill, edge and corners,
+   * so the row drops its own and grows to 56pt.
+   */
+  grouped?: boolean;
   /** Tints the title; used for destructive rows. Defaults to the text colour. */
   titleColor?: ColorToken;
   style?: ViewStyle;
@@ -21,16 +32,21 @@ export interface ListRowProps {
 /**
  * Standard tappable row. `flexDirection: 'row'` mirrors automatically under RTL,
  * and the trailing chevron flips via <DirectionalIcon>, so a single component
- * works for both directions.
+ * works for both directions. Standalone rows carry their own card; `grouped`
+ * rows sit inside a `ListGroup`.
  */
 export function ListRow({
   title,
   subtitle,
   leading,
+  icon,
   trailing,
+  value,
   onPress,
   showChevron,
   accessibilityLabel,
+  accessibilityHint,
+  grouped,
   titleColor,
   style,
 }: ListRowProps) {
@@ -44,14 +60,32 @@ export function ListRow({
           gap: spacing.md,
           paddingVertical: spacing.md,
           paddingHorizontal: spacing.lg,
-          backgroundColor: colors.surface,
-          borderRadius: radius.md,
-          borderWidth: 1,
-          borderColor: colors.border,
         },
+        grouped
+          ? { minHeight: 56, paddingVertical: spacing.sm }
+          : {
+              backgroundColor: colors.surface,
+              borderRadius: radius.md,
+              borderWidth: 1,
+              borderColor: colors.border,
+            },
         style,
       ]}
     >
+      {icon ? (
+        <View
+          style={{
+            width: 36,
+            height: 36,
+            borderRadius: radius.pill,
+            backgroundColor: colors.surfaceAlt,
+            alignItems: 'center',
+            justifyContent: 'center',
+          }}
+        >
+          <Icon name={icon} size={20} color={colors.text} />
+        </View>
+      ) : null}
       {leading}
       <View style={{ flex: 1, gap: 2 }}>
         <AppText variant="bodyStrong" color={titleColor}>
@@ -63,6 +97,11 @@ export function ListRow({
           </AppText>
         ) : null}
       </View>
+      {value ? (
+        <AppText variant="body" muted numberOfLines={1}>
+          {value}
+        </AppText>
+      ) : null}
       {trailing}
       {showChevron ? <DirectionalIcon name="chevron" size={20} color={colors.textMuted} /> : null}
     </View>
@@ -72,6 +111,8 @@ export function ListRow({
     <Pressable
       accessibilityRole="button"
       accessibilityLabel={accessibilityLabel ?? title}
+      accessibilityHint={accessibilityHint}
+      accessibilityValue={value ? { text: value } : undefined}
       onPress={onPress}
       style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
     >
```

```diff
--- a/apps/mobile/src/components/index.ts
+++ b/apps/mobile/src/components/index.ts
@@ -1,6 +1,8 @@
+export { AccountButton } from './AccountButton';
 export { AppText } from './AppText';
 export { AuthLayout } from './AuthLayout';
 export { AuthSwitchLink } from './AuthSwitchLink';
+export { Avatar } from './Avatar';
 export { Badge, CountBadge } from './Badge';
 export { Button } from './Button';
 export { Card } from './Card';
@@ -14,7 +16,9 @@ export { FoodIcon } from './FoodIcon';
 export { Header } from './Header';
 export { Icon, IONICONS } from './Icon';
 export { TabBar } from './TabBar';
+export { TabHeader } from './TabHeader';
 export type { IconName } from './Icon';
+export { ListGroup } from './ListGroup';
 export { ListRow } from './ListRow';
 export { OAuthButtons } from './OAuthButtons';
 export { OfflineBanner } from './OfflineBanner';
```

- [ ] **Step 6: Write Account**

Every row More had is here except Shopping. The credits row shows the spendable balance as its
value once it loads. The footer keeps the icon credit, which the CC-BY licence of the bundled
artwork requires.

```tsx
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { AppText, Avatar, Button, Header, ListGroup, ListRow, Screen } from '../components';
import type { IconName } from '../components';
import { useCredits } from '../hooks/credits';
import { useFormat } from '../hooks/useFormat';
import { totalCredits } from '../lib/credits';
import { formatQty } from '../lib/format';
import { useAuthStore } from '../stores/auth';
import { spacing } from '../theme';

/**
 * Account (spec §4.2), behind the avatar on every tab header. It holds every
 * row the retired More tab held, in white group cards: who you are, then the
 * household, the kitchen tools and the preferences. Shop is a tab now, so it
 * has no row here.
 */
export default function Account() {
  const { t, locale, prefs } = useFormat();
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const signOut = useAuthStore((state) => state.signOut);
  const credits = useCredits();
  const version = Constants.expoConfig?.version ?? '1.0.0';
  const balance = credits.data ? formatQty(locale, totalCredits(credits.data), prefs) : undefined;

  const row = (title: string, icon: IconName, href: string, value?: string) => (
    <ListRow
      grouped
      title={title}
      icon={icon}
      value={value}
      showChevron
      onPress={() => router.push(href)}
    />
  );

  return (
    <Screen scroll>
      <Header title={t('mobile.account.title')} onBack={() => router.back()} />

      <ListGroup>
        <ListRow
          grouped
          title={user?.displayName ?? t('mobile.more.profile')}
          subtitle={user?.email}
          leading={<Avatar name={user?.displayName} />}
          accessibilityHint={user ? t('mobile.more.profile') : undefined}
          showChevron
          onPress={() => router.push('/profile')}
        />
      </ListGroup>

      <ListGroup>
        {row(t('mobile.more.household'), 'household', '/settings/household')}
        {row(t('mobile.more.credits'), 'wallet', '/ai-usage', balance)}
      </ListGroup>

      <ListGroup>
        {row(t('mobile.screen.entry'), 'screen', '/screen')}
        {row(t('mobile.timers.entry'), 'clock', '/timers')}
        {row(t('mobile.wellness.entry'), 'sunrise', '/wellness')}
      </ListGroup>

      <ListGroup>
        {row(t('mobile.more.notifications'), 'bell', '/settings/notifications')}
        {row(t('mobile.more.settings'), 'settings', '/settings')}
      </ListGroup>

      <View style={{ gap: spacing.xs }}>
        <Button
          title={t('mobile.more.signOut')}
          variant="ghost"
          onPress={() => {
            void signOut().then(() => router.replace('/sign-in'));
          }}
        />
        <AppText variant="caption" muted center>
          {t('mobile.more.appVersion', { version })}
        </AppText>
        {/* Required by the CC-BY licence the bundled item artwork ships under. */}
        <AppText variant="caption" muted center>
          {t('mobile.more.iconCredit')}
        </AppText>
      </View>
    </Screen>
  );
}
```

- [ ] **Step 7: Move Shop into the tabs, delete More, and relabel the bar**

```bash
git mv apps/mobile/src/app/shopping.tsx 'apps/mobile/src/app/(tabs)/shopping.tsx'
git rm -q 'apps/mobile/src/app/(tabs)/more.tsx'
```

Two things change in the moved file:

- The imports go one level deeper.
- The pushed `Header` becomes a `TabHeader`, and a tab has no back button.

It also clears the tab bar, which Task 6's guard requires:

```diff
rename from apps/mobile/src/app/shopping.tsx
rename to apps/mobile/src/app/(tabs)/shopping.tsx
--- a/apps/mobile/src/app/shopping.tsx
+++ b/apps/mobile/src/app/(tabs)/shopping.tsx
@@ -1,25 +1,23 @@
 import { Pressable, View } from 'react-native';
-import { useRouter } from 'expo-router';
 import {
   Screen,
-  Header,
+  TabHeader,
   Button,
   Icon,
   ListRow,
   LoadingState,
   ErrorState,
   EmptyState,
-} from '../components';
-import { useFormat } from '../hooks/useFormat';
-import { useShoppingList, useToggleShoppingItem, useCheckoutShopping } from '../hooks/shopping';
-import { useLocations } from '../hooks/inventory';
-import { localizedName, formatMeasure } from '../lib/format';
-import { radius, spacing } from '../theme';
-import { useTheme } from '../theme/useTheme';
+} from '../../components';
+import { useFormat } from '../../hooks/useFormat';
+import { useShoppingList, useToggleShoppingItem, useCheckoutShopping } from '../../hooks/shopping';
+import { useLocations } from '../../hooks/inventory';
+import { localizedName, formatMeasure } from '../../lib/format';
+import { radius, spacing } from '../../theme';
+import { useTheme } from '../../theme/useTheme';

 export default function Shopping() {
   const { t, locale, prefs } = useFormat();
-  const router = useRouter();
   const { colors } = useTheme();
   const list = useShoppingList();
   const toggle = useToggleShoppingItem();
@@ -36,8 +34,8 @@ export default function Shopping() {
   };

   return (
-    <Screen scroll refreshing={list.isRefetching} onRefresh={() => void list.refetch()}>
-      <Header title={t('shopping.title')} onBack={() => router.back()} />
+    <Screen scroll tabBar refreshing={list.isRefetching} onRefresh={() => void list.refetch()}>
+      <TabHeader title={t('shopping.title')} />

       {list.isLoading ? (
         <LoadingState />
```

```diff
--- a/apps/mobile/src/app/(tabs)/_layout.tsx
+++ b/apps/mobile/src/app/(tabs)/_layout.tsx
@@ -3,9 +3,9 @@ import { Icon, TabBar } from '../../components';
 import { useFormat } from '../../hooks/useFormat';

 /**
- * Dashboard-first bottom navigation (spec §6.1): Home · Kitchen · Plans · More,
- * with a capture action in the centre that opens the photo flow. Shopping,
- * household and settings live under More.
+ * Bottom navigation (spec §4.1): Home · Kitchen · [camera] · Plan · Shop. The
+ * camera in the centre opens the photo flow. Household, credits, the kitchen
+ * tools and settings live on Account, behind the avatar in every tab header.
  *
  * The bar is rendered by `TabBar` rather than React Navigation's default so the
  * capture action can hold a column of its own. As an overlay it sat on the seam
@@ -43,15 +43,15 @@ export default function TabsLayout() {
       <Tabs.Screen
         name="plans"
         options={{
-          title: t('mobile.tabs.plans'),
+          title: t('mobile.tabs.plan'),
           tabBarIcon: ({ color }) => <Icon name="plans" color={color} size={22} />,
         }}
       />
       <Tabs.Screen
-        name="more"
+        name="shopping"
         options={{
-          title: t('mobile.tabs.more'),
-          tabBarIcon: ({ color }) => <Icon name="more" color={color} size={22} />,
+          title: t('mobile.tabs.shop'),
+          tabBarIcon: ({ color }) => <Icon name="basket" color={color} size={22} />,
         }}
       />
     </Tabs>
```

- [ ] **Step 8: Put `TabHeader` on Home, Kitchen and Plan**

Plan's generate action becomes a `primary` `+` `RoundButton` (§9.7). It is labelled
`plans.generate`, and it still hides while the empty state shows its own call to action. Home keeps
its current greeting until Plan 4 replaces it.

```diff
--- a/apps/mobile/src/app/(tabs)/home.tsx
+++ b/apps/mobile/src/app/(tabs)/home.tsx
@@ -3,6 +3,7 @@ import { ScrollView, View } from 'react-native';
 import { useRouter } from 'expo-router';
 import {
   Screen,
+  TabHeader,
   AppText,
   Card,
   Button,
@@ -99,7 +100,7 @@ export default function Home() {
       refreshing={plansQuery.isRefetching}
       onRefresh={() => void plansQuery.refetch()}
     >
-      <AppText variant="title">{t('mobile.home.greeting')}</AppText>
+      <TabHeader title={t('mobile.home.greeting')} />

       <Card gradient>
         <AppText variant="label" color="primaryInverse">
```

```diff
--- a/apps/mobile/src/app/(tabs)/kitchen.tsx
+++ b/apps/mobile/src/app/(tabs)/kitchen.tsx
@@ -4,7 +4,7 @@ import { useLocalSearchParams, useRouter } from 'expo-router';
 import type { InventoryItem, StorageLocation } from '@kitchen/contracts';
 import {
   Screen,
-  AppText,
+  TabHeader,
   Field,
   Chip,
   ListRow,
@@ -77,7 +77,7 @@ export default function Kitchen() {
   return (
     <Screen padded={false} edges={['top']}>
       <View style={{ padding: spacing.lg, gap: spacing.md }}>
-        <AppText variant="title">{t('inventory.title')}</AppText>
+        <TabHeader title={t('inventory.title')} />
         <Field
           value={search}
           onChangeText={setSearch}
```

```diff
--- a/apps/mobile/src/app/(tabs)/plans.tsx
+++ b/apps/mobile/src/app/(tabs)/plans.tsx
@@ -3,8 +3,8 @@ import { View } from 'react-native';
 import { useRouter } from 'expo-router';
 import {
   Screen,
-  AppText,
-  Button,
+  RoundButton,
+  TabHeader,
   SegmentedControl,
   LoadingState,
   ErrorState,
@@ -30,17 +30,19 @@ export default function Plans() {

   return (
     <Screen scroll tabBar refreshing={plans.isRefetching} onRefresh={() => void plans.refetch()}>
-      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
-        <AppText variant="title">{t('plans.title')}</AppText>
-        {showHeaderAction ? (
-          <Button
-            title={t('plans.generate')}
-            icon="plus"
-            fullWidth={false}
-            onPress={() => router.push('/generate-plan')}
-          />
-        ) : null}
-      </View>
+      <TabHeader
+        title={t('plans.title')}
+        action={
+          showHeaderAction ? (
+            <RoundButton
+              icon="plus"
+              tone="primary"
+              accessibilityLabel={t('plans.generate')}
+              onPress={() => router.push('/generate-plan')}
+            />
+          ) : undefined
+        }
+      />

       <SegmentedControl<PlanView>
         value={view}
```

- [ ] **Step 9: Run the gates**

```bash
pnpm --filter @kitchen/mobile exec vitest run src/lib/initial.spec.ts src/lib/information-architecture.spec.ts
pnpm --filter @kitchen/mobile test
pnpm --filter @kitchen/mobile typecheck && pnpm --filter @kitchen/mobile lint
pnpm --filter @kitchen/i18n test && pnpm --filter @kitchen/i18n typecheck && pnpm --filter @kitchen/i18n lint
```

Expected:

- **16 passed (16)**
- the suite **62 files, 728 tests**
- typecheck and lint exit 0
- i18n **104 passed (104)**

- [ ] **Step 10: Format and commit**

```bash
npx prettier --config packages/config/prettier.config.mjs --write \
  apps/mobile/src/lib/initial.ts \
  apps/mobile/src/lib/initial.spec.ts \
  apps/mobile/src/lib/information-architecture.spec.ts \
  apps/mobile/src/components/AccountButton.tsx \
  apps/mobile/src/components/Avatar.tsx \
  apps/mobile/src/components/TabHeader.tsx \
  apps/mobile/src/components/ListGroup.tsx \
  apps/mobile/src/components/ListRow.tsx \
  apps/mobile/src/components/index.ts \
  apps/mobile/src/app/account.tsx \
  'apps/mobile/src/app/(tabs)/_layout.tsx' \
  'apps/mobile/src/app/(tabs)/home.tsx' \
  'apps/mobile/src/app/(tabs)/kitchen.tsx' \
  'apps/mobile/src/app/(tabs)/plans.tsx' \
  'apps/mobile/src/app/(tabs)/shopping.tsx' \
  packages/i18n/src/mobile.en.ts \
  packages/i18n/src/mobile.ar.ts
git add \
  apps/mobile/src/lib/initial.ts \
  apps/mobile/src/lib/initial.spec.ts \
  apps/mobile/src/lib/information-architecture.spec.ts \
  apps/mobile/src/components/AccountButton.tsx \
  apps/mobile/src/components/Avatar.tsx \
  apps/mobile/src/components/TabHeader.tsx \
  apps/mobile/src/components/ListGroup.tsx \
  apps/mobile/src/components/ListRow.tsx \
  apps/mobile/src/components/index.ts \
  apps/mobile/src/app/account.tsx \
  'apps/mobile/src/app/(tabs)/_layout.tsx' \
  'apps/mobile/src/app/(tabs)/home.tsx' \
  'apps/mobile/src/app/(tabs)/kitchen.tsx' \
  'apps/mobile/src/app/(tabs)/plans.tsx' \
  'apps/mobile/src/app/(tabs)/shopping.tsx' \
  packages/i18n/src/mobile.en.ts \
  packages/i18n/src/mobile.ar.ts
git commit -m "feat(mobile): Plan and Shop tabs; More becomes Account behind the avatar" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Done when

- [ ] `pnpm --filter @kitchen/mobile test` reports **62 files, 728 tests**, and `typecheck` and
      `lint` exit 0.
- [ ] `pnpm --filter @kitchen/i18n test` reports **104 passed**, and
      `pnpm --filter @kitchen/web typecheck` stays green (web reads the same catalog).
- [ ] `git grep -nE 'variant="(primary|secondary|ghost)Inverse"' -- apps/mobile/src` prints nothing.
- [ ] `git grep -nE "t\('mobile\.(tabs\.(more|plans)|more\.(shopping|title))'" -- apps/mobile/src ':!*.spec.ts'`
      prints nothing. The keys themselves stay in the catalogs (§4.3).
- [ ] **Hand-off notes for Plan 4:**
  - Home's hero still exists, on the interim `media` buttons. Plan 4 deletes it for the Tonight
    tile. Its `TabHeader` shows the old one-line greeting; F2's caption-over-`display` greeting uses
    `TabHeader`'s `caption` prop.
  - Kitchen's `TabHeader` has no action yet. F6 adds search and `+`, both `RoundButton`s, through
    `action`.
  - `LiveAssistantScreen`'s composer is still a bare `TextInput` with no `fontFamily`. It is
    rebuilt on `Field`'s font resolution in Plan 4.
  - Tiles take their mock heights through `height`. `Tile` does not hard-code 150, 220 or 168.
