# Mobile Redesign · Plan 2: Foundation (palette, type, Outfit) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put the mobile app on its final design tokens: the single Apricot palette in light and
dark, the Apricot radius, shadow and type scale, and Outfit as the Latin face. Every guard test is
migrated and green, so Plans 3–5 build components and screens on tokens that no longer move.

**Architecture:**

- **Tokens stay in their two files:** `theme/palettes.ts` for colour, and `theme/index.ts` for
  radius, shadow and type. Both reach components through `useTheme()`.
- **The three colour families are retired end to end:** settings store, picker and hook.
- **`tintFor` becomes `tintIn`,** alongside a new `tintNamed` for tiles whose colour has a fixed
  role.
- **Latin text resolves to Outfit** through the same `resolveFontFamily` path Arabic already uses.
- **No screen is restyled here.** Screens pick the new tokens up automatically. Restyling is Plans
  3–5.

**Tech Stack:** Expo 57, React Native 0.86, zustand 5, expo-font, and Vitest (node environment,
mobile). WCAG contrast comes from `apps/mobile/src/theme/contrast.ts`.

**Spec:** `docs/superpowers/specs/2026-09-27-mobile-apricot-bento-redesign-design.md`. The relevant
sections:

- §6: token values, the contrast table in §6.5, retired items in §6.6, and radius and elevation in
  §6.7
- §7: Outfit and the scale
- §14: every migration and guard change

**Independent of Plan 1:** this plan touches only `apps/mobile` and `.github`, so either plan may
land first.

## Global Constraints

- Run every command from the repo root. Node >= 20 (CI uses 22). pnpm 10.34.5.
- **Colour hex literals live only in `apps/mobile/src/theme/palettes.ts`.** `theme/token-usage.spec.ts`
  sweeps the rest of `src` for them.
- **Guard tests are never relaxed to make a change pass.** In `palette.spec.ts` the bar is 4.5 for
  text and 3.0 for non-text.
- **No physical-direction style keys on mobile** (`marginLeft`, `left`, `borderRightColor`…).
  ESLint's `styleKeys` rule rejects them, so use `marginStart` / `start` / `end`.
- **Arabic:**
  - `letterSpacing` is always 0.
  - Line-height factors are Latin 1.35 and Arabic 1.7.
  - The 600 tier promotes to Tajawal Bold, since Tajawal has no SemiBold.
  - Never hard-code `letterSpacing` in a component.
- **The i18n catalogs are append-only.** The now-unused `mobile.settings.themeViolet`,
  `themeTerracotta` and `themeGreen` keys **stay** (§4.3).
- **Existing installs:** a saved colour family is ignored, and the saved Light / Dark / System
  choice is kept (§6.6).
- **Imports:** mobile relative imports have no file extension.
- **Outfit** comes from `github.com/Outfitio/Outfit-Fonts`, pinned at commit
  `902773808eb372f70fb34e8946dd1ffe604efc79`. It is version 1.100, SIL OFL 1.1, "Copyright 2021 The
  Outfit Project Authors".
- **Out of scope (Plan 3):**
  - Button's `media` variant and the removal of the three `*Inverse` variants
  - `RoundButton`, `Tile`, `TabBar`
  - the visual-rhythm ghost-padding regex

  Plan 4 covers Home's restyle and deleting the components it absorbs.

- **Format only the files you touched:**
  `npx prettier --config packages/config/prettier.config.mjs --write <paths>`. Never run
  `pnpm format`.
- **Every commit message ends with the trailer**
  `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>`.

## Before you start

- [ ] **Install and build the shared packages, then record the baseline**

```bash
pnpm install --frozen-lockfile
pnpm exec turbo run build --filter='./packages/*'
pnpm --filter @kitchen/mobile test
```

Expected: **54 files, 773 tests passed.** The per-task counts below are relative to this.

## File map

| File                                                | Responsibility after this plan                                                 |
| --------------------------------------------------- | ------------------------------------------------------------------------------ |
| `apps/mobile/src/theme/palettes.ts`                 | The Apricot palette: colours, named tints, ember gradient, scrim, shadow       |
| `apps/mobile/src/theme/index.ts`                    | Radius, shadow, type scale, `tintIn`, `tintNamed`                              |
| `apps/mobile/src/theme/useTheme.ts`                 | `useTheme()`: palette for the resolved mode, plus `tintIn`/`tintNamed`/`scrim` |
| `apps/mobile/src/stores/settings.ts`                | Settings without `themeFamily`                                                 |
| `apps/mobile/src/features/settings/ThemePicker.tsx` | Appearance only: System / Light / Dark                                         |
| `apps/mobile/src/lib/fonts.ts`                      | `LATIN_FONTS`, `latinFontFamily`, and a Latin branch in `resolveFontFamily`    |
| `apps/mobile/src/lib/font-loader.ts`                | Registers the Outfit and Tajawal faces                                         |
| `apps/mobile/assets/fonts/`                         | Four Outfit TTFs, `OFL-Outfit.txt`, `README.md` provenance                     |
| `apps/mobile/app.json`                              | Embeds the Outfit faces natively (`expo-font` plugin)                          |
| `apps/mobile/src/components/AppText.tsx`            | Passes `fontVariant` through (tabular numerals)                                |

---

### Task 1: Retire colour families from settings and the picker

**Files:**

- Modify: `apps/mobile/src/stores/settings.ts:1-7, 26-32, 41-47, 70-76, 125-135, 153-164, 178-184`
- Modify: `apps/mobile/src/stores/settings.spec.ts:155-210` (the "theme preference" block)
- Modify: `apps/mobile/src/features/settings/ThemePicker.tsx:1-126, 162-229`
- Modify: `apps/mobile/src/theme/useTheme.ts:1-7, 21-33, 37-43`

**Interfaces:**

- Consumes: `DEFAULT_THEME_FAMILY` and `paletteFor(family, mode)` from `theme/palettes.ts`, still
  present. Task 2 removes them.
- Produces:
  - `PersistedSettings` loses `themeFamily`, and `SettingsState` loses `setThemeFamily`.
    `themePreference: ThemePreference` (`'system' | 'light' | 'dark'`) and `setThemePreference`
    are unchanged.
  - `ThemePicker`: same export name, now rendering only the mode segmented control.
  - `useTheme()`: the same return shape as today, now always on the default family. This is an
    interim state that Task 2 replaces.

- [ ] **Step 1: Rewrite the "theme preference" tests**

Replace the whole `describe('theme preference', …)` block at the end of
`apps/mobile/src/stores/settings.spec.ts`:

```diff
--- a/apps/mobile/src/stores/settings.spec.ts
+++ b/apps/mobile/src/stores/settings.spec.ts
@@ -155,56 +155,50 @@ describe('notification settings', () => {
 });

 describe('theme preference', () => {
-  it('defaults to violet following the system, so nothing changes on upgrade', () => {
-    useSettingsStore.setState({ themeFamily: 'violet', themePreference: 'system' });
-    expect(useSettingsStore.getState().themeFamily).toBe('violet');
-    expect(useSettingsStore.getState().themePreference).toBe('system');
+  it('defaults to following the system', () => {
+    expect(useSettingsStore.getInitialState().themePreference).toBe('system');
   });

-  it('persists both halves of the choice', async () => {
-    useSettingsStore.getState().setThemeFamily('terracotta');
+  it('persists the appearance choice, and nothing about colour families', async () => {
     useSettingsStore.getState().setThemePreference('dark');
     await Promise.resolve();

-    const written = fileSystem.writeAsStringAsync.mock.calls.at(-1)?.[1] as string;
-    expect(JSON.parse(written)).toMatchObject({
-      themeFamily: 'terracotta',
-      themePreference: 'dark',
-    });
+    const written = JSON.parse(fileSystem.writeAsStringAsync.mock.calls.at(-1)?.[1] as string);
+    expect(written).toMatchObject({ themePreference: 'dark' });
+    expect(written).not.toHaveProperty('themeFamily');
   });

-  it('restores a saved theme', async () => {
+  /**
+   * Installs from before the single Apricot palette saved a colour family next
+   * to the mode. The family is gone; the mode the user chose must survive.
+   */
+  it('restores the saved mode from a file that still names a family', async () => {
     fileSystem.readAsStringAsync.mockResolvedValue(
       JSON.stringify({ themeFamily: 'green', themePreference: 'light' }),
     );
     await useSettingsStore.getState().hydrate();

-    expect(useSettingsStore.getState().themeFamily).toBe('green');
     expect(useSettingsStore.getState().themePreference).toBe('light');
+    expect(useSettingsStore.getState()).not.toHaveProperty('themeFamily');
   });

   /**
-   * The failure this guards is a downgrade: a build that knows four families
-   * writes the fourth, the user reinstalls an older build, and `paletteFor`
-   * gets a key it has never heard of. Casting the saved string would put
-   * `undefined.colors` on screen; validating it falls back to the default.
+   * The failure this guards is a downgrade: a newer build writes a mode this
+   * one has never heard of. Casting the saved string would hand
+   * `resolveThemeMode` a value it cannot resolve; validating falls back.
    */
-  it('falls back when the saved theme is not one this build knows', async () => {
-    fileSystem.readAsStringAsync.mockResolvedValue(
-      JSON.stringify({ themeFamily: 'chartreuse', themePreference: 'sepia' }),
-    );
+  it('falls back when the saved mode is not one this build knows', async () => {
+    fileSystem.readAsStringAsync.mockResolvedValue(JSON.stringify({ themePreference: 'sepia' }));
     await useSettingsStore.getState().hydrate();

-    expect(useSettingsStore.getState().themeFamily).toBe('violet');
     expect(useSettingsStore.getState().themePreference).toBe('system');
   });

   it('reads an older settings file, written before themes existed, as the default', async () => {
-    useSettingsStore.setState({ themeFamily: 'green', themePreference: 'dark' });
+    useSettingsStore.setState({ themePreference: 'dark' });
     fileSystem.readAsStringAsync.mockResolvedValue(JSON.stringify({ easternNumerals: true }));
     await useSettingsStore.getState().hydrate();

-    expect(useSettingsStore.getState().themeFamily).toBe('violet');
     expect(useSettingsStore.getState().themePreference).toBe('system');
   });
 });
```

Two details matter:

- **The default is read from `useSettingsStore.getInitialState()`,** not `getState()`, so a
  preference set by an earlier test cannot leak into it.
- **The "restores" case feeds a file that still has `themeFamily: 'green'`.** Real installs have
  exactly that file on disk.

- [ ] **Step 2: Run it and watch it fail**

```bash
pnpm --filter @kitchen/mobile exec vitest run src/stores/settings.spec.ts
```

Expected: **2 failed | 13 passed (15)**, both with
`AssertionError: expected { easternNumerals: false, … } to not have property "themeFamily"`. The
failing cases are "persists the appearance choice, and nothing about colour families" and
"restores the saved mode from a file that still names a family".

- [ ] **Step 3: Drop the family from the store**

```diff
--- a/apps/mobile/src/stores/settings.ts
+++ b/apps/mobile/src/stores/settings.ts
@@ -1,7 +1,6 @@
 import { create } from 'zustand';
 import { readJson, writeJson } from '../lib/storage';
 import { DEFAULT_LEAD_DAYS, DEFAULT_REMINDER_HOUR } from '../lib/notifications';
-import { DEFAULT_THEME_FAMILY, THEME_FAMILIES, type ThemeFamily } from '../theme/palettes';

 /** 'system' follows the OS switch; the other two pin it regardless. */
 export type ThemePreference = 'system' | 'light' | 'dark';
@@ -26,7 +25,6 @@ interface PersistedSettings {
   notifyTimers: boolean;
   expiryLeadDays: number;
   reminderHour: number;
-  themeFamily: ThemeFamily;
   themePreference: ThemePreference;
 }

@@ -41,7 +39,6 @@ interface SettingsState extends PersistedSettings {
   setNotifyTimers: (value: boolean) => void;
   setExpiryLeadDays: (value: number) => void;
   setReminderHour: (value: number) => void;
-  setThemeFamily: (value: ThemeFamily) => void;
   setThemePreference: (value: ThemePreference) => void;
   hydrate: () => Promise<void>;
 }
@@ -70,7 +67,6 @@ export const useSettingsStore = create<SettingsState>((set, get) => ({
   notifyTimers: true,
   expiryLeadDays: DEFAULT_LEAD_DAYS,
   reminderHour: DEFAULT_REMINDER_HOUR,
-  themeFamily: DEFAULT_THEME_FAMILY,
   // Defaults to following the phone. Someone who has set their device to dark
   // has already told us what they want; asking again in-app is redundant.
   themePreference: 'system',
@@ -125,11 +121,6 @@ export const useSettingsStore = create<SettingsState>((set, get) => ({
     void writeJson(PERSIST_KEY, current(get()));
   },

-  setThemeFamily: (value) => {
-    set({ themeFamily: value });
-    void writeJson(PERSIST_KEY, current(get()));
-  },
-
   setThemePreference: (value) => {
     set({ themePreference: value });
     void writeJson(PERSIST_KEY, current(get()));
@@ -153,12 +144,10 @@ export const useSettingsStore = create<SettingsState>((set, get) => ({
       notifyTimers: saved.notifyTimers !== false,
       expiryLeadDays: saved.expiryLeadDays ?? DEFAULT_LEAD_DAYS,
       reminderHour: saved.reminderHour ?? DEFAULT_REMINDER_HOUR,
-      // Validated against the known sets rather than cast: a settings file
-      // written by a future build with a fourth family must not put an
-      // undefined palette on screen after a downgrade.
-      themeFamily: THEME_FAMILIES.includes(saved.themeFamily)
-        ? saved.themeFamily
-        : DEFAULT_THEME_FAMILY,
+      // Validated rather than cast, so a value from a newer build cannot put
+      // an unknown mode on screen after a downgrade. A file written while the
+      // app had colour families still carries `themeFamily`; it is not read,
+      // and the next write drops it, because `current()` no longer emits it.
       themePreference: THEME_PREFERENCES.includes(saved.themePreference)
         ? saved.themePreference
         : 'system',
@@ -178,7 +167,6 @@ function current(state: PersistedSettings): PersistedSettings {
     notifyTimers: state.notifyTimers,
     expiryLeadDays: state.expiryLeadDays,
     reminderHour: state.reminderHour,
-    themeFamily: state.themeFamily,
     themePreference: state.themePreference,
   };
 }
```

- [ ] **Step 4: Reduce the picker to appearance**

Delete `FAMILY_LABEL_KEYS` and the `Swatch` component, and render only the mode control. The export
name stays `ThemePicker`, so the settings screen needs no change:

```diff
--- a/apps/mobile/src/features/settings/ThemePicker.tsx
+++ b/apps/mobile/src/features/settings/ThemePicker.tsx
@@ -1,126 +1,17 @@
 import { Pressable, View } from 'react-native';
-import { AppText, Icon } from '../../components';
+import { AppText } from '../../components';
 import type { MessageKey } from '@kitchen/i18n';
 import { useLocale } from '../../lib/locale';
 import { useSettingsStore, type ThemePreference } from '../../stores/settings';
-import { radius, spacing, THEME_FAMILIES, paletteFor, type ThemeFamily } from '../../theme';
+import { radius, spacing } from '../../theme';
 import { useTheme } from '../../theme/useTheme';

-const FAMILY_LABEL_KEYS: Record<ThemeFamily, MessageKey> = {
-  violet: 'mobile.settings.themeViolet',
-  terracotta: 'mobile.settings.themeTerracotta',
-  green: 'mobile.settings.themeGreen',
-};
-
 const MODES: readonly { value: ThemePreference; key: MessageKey }[] = [
   { value: 'system', key: 'mobile.settings.modeSystem' },
   { value: 'light', key: 'mobile.settings.modeLight' },
   { value: 'dark', key: 'mobile.settings.modeDark' },
 ];

-/**
- * A swatch is a miniature of the screen it selects, not a coloured dot.
- *
- * A dot misrepresents the choice: the families differ in their page and card
- * colours as much as in their brand colour, so picking "green" from a green dot
- * and landing on a green *page* is a surprise. Drawing ground, card and brand
- * in their real relationship also makes the light/dark switch visible here,
- * which a single dot cannot show at all.
- *
- * It deliberately does not preview `accent`: violet and green both use blue as
- * their accent, so an accent stripe put a blue bar in the green swatch and made
- * two different families look like the same one.
- */
-function Swatch({
-  family,
-  selected,
-  onPress,
-}: {
-  family: ThemeFamily;
-  selected: boolean;
-  onPress: () => void;
-}) {
-  const { t } = useLocale();
-  const { mode, colors } = useTheme();
-  const preview = paletteFor(family, mode).colors;
-
-  return (
-    <Pressable
-      accessibilityRole="radio"
-      accessibilityState={{ selected }}
-      accessibilityLabel={t(FAMILY_LABEL_KEYS[family])}
-      onPress={onPress}
-      style={{ flex: 1, alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xs }}
-    >
-      <View
-        style={{
-          width: '100%',
-          minHeight: 56,
-          borderRadius: radius.lg,
-          overflow: 'hidden',
-          backgroundColor: preview.bg,
-          borderWidth: selected ? 2 : 1,
-          borderColor: selected ? colors.primary : colors.border,
-          padding: spacing.sm,
-          gap: spacing.xs,
-          justifyContent: 'center',
-        }}
-      >
-        <View
-          style={{
-            flexDirection: 'row',
-            alignItems: 'center',
-            gap: spacing.xs,
-            padding: spacing.xs,
-            borderRadius: radius.sm,
-            backgroundColor: preview.surface,
-            borderWidth: 1,
-            borderColor: preview.border,
-          }}
-        >
-          <View
-            style={{
-              height: 12,
-              width: 12,
-              borderRadius: radius.pill,
-              backgroundColor: preview.primary,
-            }}
-          />
-          <View
-            style={{
-              height: 6,
-              flex: 1,
-              borderRadius: radius.pill,
-              backgroundColor: preview.surfaceAlt,
-            }}
-          />
-        </View>
-        <View
-          style={{
-            height: 8,
-            width: '55%',
-            borderRadius: radius.pill,
-            backgroundColor: preview.primary,
-          }}
-        />
-      </View>
-
-      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
-        {/* Selection is never carried by colour alone: the whole control *is*
-            colour, so a coloured ring would be the one cue a colour-blind user
-            cannot read. The tick is the actual signal. */}
-        {selected ? <Icon name="check" size={14} color={colors.primaryText} /> : null}
-        <AppText
-          variant="caption"
-          style={{ color: selected ? colors.primaryText : colors.textMuted }}
-        >
-          {t(FAMILY_LABEL_KEYS[family])}
-        </AppText>
-      </View>
-    </Pressable>
-  );
-}
-
 function ModeButton({
   mode,
   selected,
@@ -162,68 +53,50 @@ function ModeButton({
   );
 }

+/**
+ * Appearance: System / Light / Dark. There is one palette, Apricot, so the
+ * colour-family swatches this used to show are gone; the mode is the only
+ * choice left (mobile redesign spec §6.6).
+ */
 export function ThemePicker() {
   const { t } = useLocale();
   const { colors, isDark } = useTheme();
-  const family = useSettingsStore((state) => state.themeFamily);
-  const setFamily = useSettingsStore((state) => state.setThemeFamily);
   const preference = useSettingsStore((state) => state.themePreference);
   const setPreference = useSettingsStore((state) => state.setThemePreference);

   return (
-    <View style={{ gap: spacing.lg }}>
-      <View style={{ gap: spacing.sm }} accessibilityRole="radiogroup">
-        <View style={{ gap: 2 }}>
-          <AppText variant="label">{t('mobile.settings.theme')}</AppText>
+    <View style={{ gap: spacing.sm }} accessibilityRole="radiogroup">
+      <View style={{ gap: 2 }}>
+        <AppText variant="label">{t('mobile.settings.mode')}</AppText>
+        {/* Only while 'Automatic' is selected. Left permanently on, it claims
+            the app follows the phone even when the user has just pinned Dark
+            — a hint that contradicts the control beneath it. */}
+        {preference === 'system' ? (
           <AppText variant="caption" muted>
-            {t('mobile.settings.themeHint')}
+            {t('mobile.settings.modeSystemHint')}
           </AppText>
-        </View>
-        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
-          {THEME_FAMILIES.map((candidate) => (
-            <Swatch
-              key={candidate}
-              family={candidate}
-              selected={candidate === family}
-              onPress={() => setFamily(candidate)}
-            />
-          ))}
-        </View>
+        ) : null}
       </View>
-
-      <View style={{ gap: spacing.sm }} accessibilityRole="radiogroup">
-        <View style={{ gap: 2 }}>
-          <AppText variant="label">{t('mobile.settings.mode')}</AppText>
-          {/* Only while 'Automatic' is selected. Left permanently on, it claims
-              the app follows the phone even when the user has just pinned Dark
-              — a hint that contradicts the control beneath it. */}
-          {preference === 'system' ? (
-            <AppText variant="caption" muted>
-              {t('mobile.settings.modeSystemHint')}
-            </AppText>
-          ) : null}
-        </View>
-        {/* A segmented control rather than three chips: the options are mutually
-            exclusive and cover the whole axis, so the enclosing track is the
-            affordance that says "pick one of these", which loose pills do not. */}
-        <View
-          style={{
-            flexDirection: 'row',
-            gap: spacing.xs,
-            padding: spacing.xs,
-            borderRadius: radius.lg,
-            backgroundColor: isDark ? colors.surface : colors.surfaceAlt,
-          }}
-        >
-          {MODES.map((entry) => (
-            <ModeButton
-              key={entry.value}
-              mode={entry.value}
-              selected={entry.value === preference}
-              onPress={() => setPreference(entry.value)}
-            />
-          ))}
-        </View>
+      {/* A segmented control rather than three chips: the options are mutually
+          exclusive and cover the whole axis, so the enclosing track is the
+          affordance that says "pick one of these", which loose pills do not. */}
+      <View
+        style={{
+          flexDirection: 'row',
+          gap: spacing.xs,
+          padding: spacing.xs,
+          borderRadius: radius.lg,
+          backgroundColor: isDark ? colors.surface : colors.surfaceAlt,
+        }}
+      >
+        {MODES.map((entry) => (
+          <ModeButton
+            key={entry.value}
+            mode={entry.value}
+            selected={entry.value === preference}
+            onPress={() => setPreference(entry.value)}
+          />
+        ))}
       </View>
     </View>
   );
```

- [ ] **Step 5: Stop reading the family in `useTheme`**

This is an interim step: Task 2 changes `paletteFor` to take only the mode.

```diff
--- a/apps/mobile/src/theme/useTheme.ts
+++ b/apps/mobile/src/theme/useTheme.ts
@@ -1,7 +1,13 @@
 import { useMemo } from 'react';
 import { useColorScheme, type StyleSheet } from 'react-native';
 import { resolveThemeMode, shadowFor, tintIn, type Shadow } from './index';
-import { paletteFor, type Palette, type Tint, type ThemeMode } from './palettes';
+import {
+  DEFAULT_THEME_FAMILY,
+  paletteFor,
+  type Palette,
+  type Tint,
+  type ThemeMode,
+} from './palettes';
 import { useSettingsStore } from '../stores/settings';

 export interface Theme {
@@ -21,13 +27,12 @@ export interface Theme {
  * for the same value and one more thing to forget to wrap a screen in.
  */
 export function useTheme(): Theme {
-  const family = useSettingsStore((state) => state.themeFamily);
   const preference = useSettingsStore((state) => state.themePreference);
   const system = useColorScheme();
   const mode: ThemeMode = resolveThemeMode(preference, system);

   return useMemo(() => {
-    const palette = paletteFor(family, mode);
+    const palette = paletteFor(DEFAULT_THEME_FAMILY, mode);
     return {
       colors: palette.colors,
       tints: palette.tints,
@@ -37,7 +42,7 @@ export function useTheme(): Theme {
       isDark: mode === 'dark',
       tintFor: (index: number) => tintIn(palette.tints, index),
     };
-  }, [family, mode]);
+  }, [mode]);
 }

 /**
```

- [ ] **Step 6: Run the gates**

```bash
pnpm --filter @kitchen/mobile exec vitest run src/stores/settings.spec.ts
pnpm --filter @kitchen/mobile test
pnpm --filter @kitchen/mobile typecheck && pnpm --filter @kitchen/mobile lint
```

Expected: **15 passed (15)**; the suite **54 files, 773 tests**; typecheck and lint exit 0.

- [ ] **Step 7: Format and commit**

```bash
npx prettier --config packages/config/prettier.config.mjs --write apps/mobile/src/stores/settings.ts apps/mobile/src/stores/settings.spec.ts apps/mobile/src/features/settings/ThemePicker.tsx apps/mobile/src/theme/useTheme.ts
git add apps/mobile/src/stores/settings.ts apps/mobile/src/stores/settings.spec.ts apps/mobile/src/features/settings/ThemePicker.tsx apps/mobile/src/theme/useTheme.ts
git commit -m "refactor(mobile): retire colour families from settings and the picker" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 2: The Apricot palette and the theme API

**Files:**

- Replace: `apps/mobile/src/theme/palettes.ts` (whole file)
- Modify: `apps/mobile/src/theme/index.ts:1-5, 8-15, 21-54, 169-171`
- Modify: `apps/mobile/src/theme/useTheme.ts:1-11, 14-23, 32-46`
- Modify: `apps/mobile/src/theme/palette.spec.ts:1-6, 23-34, 36-42, 61-69, 71-77, 112-118, 121-127, 132-148, 155-169, 178-183, 241-247, 281-288, 297-330`
- Modify: `apps/mobile/src/components/recipe-thumb.spec.ts:10-16`, `apps/mobile/src/components/visual-rhythm.spec.ts:12-18`
- Modify: `apps/mobile/src/components/Button.tsx:44-50`, `apps/mobile/src/components/Card.tsx:12-18, 43-49`
- Modify (rename `tintFor` → `tintIn`):
  - `apps/mobile/src/app/(tabs)/home.tsx`
  - `apps/mobile/src/app/(auth)/welcome.tsx`
  - `apps/mobile/src/features/home/WeekStrip.tsx`
  - `apps/mobile/src/features/home/KitchenGlance.tsx`
  - `apps/mobile/src/features/home/StatTiles.tsx`
- Modify: `.github/copilot-instructions.md:12-18, 158-164`

**Interfaces:**

- Consumes: `contrast(a, b)` from `theme/contrast.ts`, and `RECIPE_THUMB_TONE_TOKENS` /
  `RECIPE_THUMB_TONE_FOREGROUNDS` from `components/recipe-thumb-tones.ts`. Both are unchanged.
- Produces from `theme/palettes.ts`, all re-exported by `theme/index.ts`:
  - `palettes = { apricot: { light, dark } }`
  - `paletteFor(mode: ThemeMode): Palette`
  - `type TintName = 'plain' | 'butter' | 'sage' | 'apricot'`
  - `interface Tint { bg: string; fg: string; name: TintName }`
  - `PaletteColors` gains `onDanger`.
  - `Palette.scrim`, typed as:

    ```ts
    export interface Scrim {
      readonly rgb: string;
      readonly stops: readonly (readonly [number, number])[];
      readonly textMinAlpha: number;
    }
    ```
- Produces from `theme/index.ts`:
  - `tintNamed(tints: readonly Tint[], name: TintName): Tint`
  - `radius = { xs: 8, sm: 12, md: 18, lg: 24, xl: 28, pill: 999 }`
  - `shadowFor(p).card` = opacity `0.05 × shadowScale`, radius 12, y 4, elevation 2. `raised` is
    unchanged.
- Produces on `useTheme()` (`Theme`): `tintIn(index): Tint`, `tintNamed(name: TintName): Tint` and
  `scrim: Scrim`.
- Removes `ThemeFamily`, `THEME_FAMILIES`, `DEFAULT_THEME_FAMILY` and `Theme.tintFor`.

- [ ] **Step 1: Migrate the palette guard to one family in two modes**

Edit `apps/mobile/src/theme/palette.spec.ts`. The thresholds and the intent of every existing
assertion are kept (§14). The mechanical changes:

- The describe-each now runs over `apricot light` and `apricot dark`.
- "button fills" asserts `onDanger` on `danger`.
- The three "cook mode" tests are renamed "media surfaces", with identical assertions.
- The "families are distinguishable" block is removed along with the families.

Added:

- the inverted question tile
- the coral shutter on the viewfinder
- the photo scrim: white text at `textMinAlpha` over white, the bottom 40% coverage, and a clear
  top
- media tokens identical across modes
- every `TintName` resolving

```diff
--- a/apps/mobile/src/theme/palette.spec.ts
+++ b/apps/mobile/src/theme/palette.spec.ts
@@ -1,6 +1,6 @@
 import { describe, expect, it } from 'vitest';
-import { resolveThemeMode, tintIn } from './index';
-import { palettes, type Palette, type ThemeFamily, type ThemeMode } from './palettes';
+import { resolveThemeMode, tintIn, tintNamed } from './index';
+import { palettes, type Palette, type ThemeMode } from './palettes';
 import { contrast } from './contrast';
 import {
   RECIPE_THUMB_TONE_FOREGROUNDS,
@@ -23,12 +23,11 @@ const RECIPE_THUMB_PAIRS = RECIPE_THUMB_TONE_TOKENS.map(
 );

 /**
- * Every palette faces the identical bar. The picker lets a user land on any of
- * these six, so "the default one is accessible" is not a claim worth making —
- * asserting the set is the only version of this test that means anything.
+ * Both modes face the identical bar. Appearance follows the phone by default,
+ * so "light is accessible" is not a claim worth making on its own.
  */
 const ALL: readonly (readonly [string, Palette])[] = (
-  Object.keys(palettes) as ThemeFamily[]
+  Object.keys(palettes) as (keyof typeof palettes)[]
 ).flatMap((family) =>
   (['light', 'dark'] as ThemeMode[]).map(
     (mode) => [`${family} ${mode}`, palettes[family][mode]] as const,
@@ -36,7 +35,7 @@ const ALL: readonly (readonly [string, Palette])[] = (
 );

 describe.each(ALL)('%s palette', (_name, palette) => {
-  const { colors, tints, gradientHero } = palette;
+  const { colors, tints, gradientHero, scrim } = palette;

   it.each(['text', 'textMuted'] as const)('%s reads on every surface', (token) => {
     for (const surface of SURFACES) {
@@ -61,9 +60,9 @@ describe.each(ALL)('%s palette', (_name, palette) => {
   });

   /**
-   * `onFill` rather than `textInverse`, because the two part company in dark
-   * mode: a dark-mode fill is light and takes a dark label, while
-   * `textInverse` still belongs to the always-dark cook surface.
+   * The coral is bright, so its label is ink in both modes. The destructive
+   * fill has its own label, `onDanger`: the light-mode red takes white, which
+   * `onFill` (ink) would fail on.
    */
   it('button fills carry readable labels', () => {
     expect(contrast(colors.onFill, colors.primary), 'primary').toBeGreaterThanOrEqual(AA_TEXT);
@@ -71,7 +70,15 @@ describe.each(ALL)('%s palette', (_name, palette) => {
       contrast(colors.onFill, colors.primaryPressed),
       'primary pressed',
     ).toBeGreaterThanOrEqual(AA_TEXT);
-    expect(contrast(colors.onFill, colors.danger), 'danger').toBeGreaterThanOrEqual(AA_TEXT);
+    expect(contrast(colors.onDanger, colors.danger), 'danger').toBeGreaterThanOrEqual(AA_TEXT);
+  });
+
+  /**
+   * F4's question tile inverts with the mode: `text` becomes the fill and `bg`
+   * the label. Ink on cream in light, cream on cocoa in dark.
+   */
+  it('the inverted question tile reads', () => {
+    expect(contrast(colors.bg, colors.text)).toBeGreaterThanOrEqual(AA_TEXT);
   });

   /**
@@ -112,7 +119,7 @@ describe.each(ALL)('%s palette', (_name, palette) => {
    * DateField's "clear date" is brand-coloured label text on a card.
    *
    * Only `surface` is certified for it: measured against `surfaceAlt` the same
-   * violet is 4.28:1, under AA, so a brand label must never be moved onto the
+   * brand hue can fall under AA, so a brand label must never be moved onto the
    * alt surface — use `primarySoft` as its backing instead.
    */
   it('primaryText reads as text on a plain surface', () => {
@@ -121,7 +128,7 @@ describe.each(ALL)('%s palette', (_name, palette) => {
     );
   });

-  it('cook mode inverts legibly', () => {
+  it('media surfaces invert legibly', () => {
     expect(contrast(colors.textInverse, colors.surfaceInverse), 'primary').toBeGreaterThanOrEqual(
       AA_TEXT,
     );
@@ -132,17 +139,15 @@ describe.each(ALL)('%s palette', (_name, palette) => {
   });

   /**
-   * Cook mode is the one screen that inverts, and it hosts buttons. A
-   * light-mode `primary` is 1.20:1 on `surfaceInverse` — the CTA fill
-   * disappears and the ghost label is unreadable. These three pairs are what
-   * the `primaryInverse` / `ghostInverse` variants must satisfy. The label is
-   * `onPrimaryInverse` and not `text`, because cook mode stays dark even when
-   * the app is in dark mode, where `text` is light and would vanish.
+   * The camera, a photo and the video player are dark in every mode, and they
+   * host buttons (the `media` variant). The label on the lifted brand fill is
+   * `onPrimaryInverse` and not `text`, because the media surface stays dark
+   * even when the app is in dark mode, where `text` is light and would vanish.
    */
-  it('cook mode buttons separate from the inverted surface', () => {
+  it('media surfaces carry buttons that separate', () => {
     expect(
       contrast(colors.primaryInverse, colors.surfaceInverse),
-      'ghostInverse label',
+      'media ghost label',
     ).toBeGreaterThanOrEqual(AA_TEXT);
     expect(
       contrast(colors.primaryInverse, colors.surfaceInverse),
@@ -155,15 +160,13 @@ describe.each(ALL)('%s palette', (_name, palette) => {
   });

   /**
-   * Cook mode also hosts a step badge and a "previous" button, and those had
-   * been drawing their fills from the mode-following `warnSoft` / `surfaceAlt`
-   * tokens. That is invisible in dark mode, where a "soft" tint is a dark tint
-   * and the cook ground is already dark — the pair measured 1.08:1. The fills
-   * therefore come from the always-dark group instead. The lift is deliberately
-   * gentle, so the border carries the affordance and is held to the full
-   * non-text ratio.
+   * Badges and secondary controls on a media surface draw their fills from the
+   * always-dark group, never the mode-following `surfaceAlt`: in dark mode a
+   * "soft" tint is a dark tint and the pair measured 1.08:1. The lift is
+   * deliberately gentle, so the border carries the affordance and is held to
+   * the full non-text ratio.
    */
-  it('cook mode secondary surfaces stay visible against the inverted ground', () => {
+  it('media secondary surfaces stay visible against the dark ground', () => {
     expect(
       contrast(colors.surfaceInverseAlt, colors.surfaceInverse),
       'lifted inverse surface',
@@ -178,6 +181,59 @@ describe.each(ALL)('%s palette', (_name, palette) => {
     ).toBeGreaterThanOrEqual(AA_TEXT);
   });

+  /** The capture shutter is the coral on the viewfinder, in both modes. */
+  it('the coral shutter separates from the viewfinder', () => {
+    expect(contrast(colors.primary, colors.surfaceInverse)).toBeGreaterThanOrEqual(AA_NON_TEXT);
+  });
+
+  /**
+   * Text on a photo sits over the scrim. The worst photo is pure white, so the
+   * white label is measured against the scrim composited over white at the
+   * lowest alpha text is allowed on.
+   */
+  describe('photo scrim', () => {
+    function alphaAt(position: number): number {
+      const { stops } = scrim;
+      for (let i = 0; i < stops.length - 1; i += 1) {
+        const [[p0, a0], [p1, a1]] = [stops[i]!, stops[i + 1]!];
+        if (position >= p0 && position <= p1) {
+          return p1 === p0 ? a1 : a0 + ((a1 - a0) * (position - p0)) / (p1 - p0);
+        }
+      }
+      return stops.at(-1)![1];
+    }
+
+    function overWhite(hex: string, alpha: number): string {
+      const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
+      const mixed = channels.map((c) => Math.round(c * alpha + 255 * (1 - alpha)));
+      return `#${mixed.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
+    }
+
+    it('white text clears AA at the lowest alpha text may sit on', () => {
+      const worst = overWhite(scrim.rgb, scrim.textMinAlpha);
+      expect(contrast(colors.textInverse, worst), `on ${worst}`).toBeGreaterThanOrEqual(AA_TEXT);
+    });
+
+    /**
+     * The trap the knee in the ramp fixes: a single linear ramp to 0.82 only
+     * clears 0.70 in the bottom 9% of a tile, too thin for a title and a
+     * caption. Text needs the bottom 40%.
+     */
+    it('gives text the bottom 40% of a tile', () => {
+      for (let step = 0; step <= 40; step += 1) {
+        const position = 0.6 + (0.4 * step) / 40;
+        expect(alphaAt(position), `alpha at ${position}`).toBeGreaterThanOrEqual(
+          scrim.textMinAlpha - 1e-9,
+        );
+      }
+    });
+
+    it('leaves the top of the photo clear', () => {
+      expect(alphaAt(0)).toBe(0);
+      expect(alphaAt(0.35)).toBe(0);
+    });
+  });
+
   /**
    * The tinted cards are the reference's main device, and they are the easiest
    * place for contrast to rot: a designer nudges a fill lighter, the label
@@ -241,7 +297,7 @@ describe.each(ALL)('%s palette', (_name, palette) => {
    * lavender tint landed 5.0 away from it.
    *
    * Euclidean RGB distance is a coarse proxy for perceptibility, but it is the
-   * right shape of check here: mint, blush and sky separate from the ground by
+   * right shape of check here: butter, sage and apricot separate from the ground by
    * hue rather than lightness, so a luminance-only rule would wrongly demand
    * they get darker.
    */
@@ -281,8 +337,36 @@ describe.each(ALL)('%s palette', (_name, palette) => {
   });
 });

+/**
+ * Media surfaces are dark in every mode, so the `*Inverse` group must not drift
+ * between light and dark — a camera that changes colour with the phone's
+ * appearance is a camera that is not showing the photo.
+ */
+it('media tokens are identical in light and dark', () => {
+  const MEDIA = [
+    'surfaceInverse',
+    'surfaceInverseAlt',
+    'borderInverse',
+    'textInverse',
+    'textInverseMuted',
+    'primaryInverse',
+    'onPrimaryInverse',
+  ] as const;
+  for (const token of MEDIA) {
+    expect(palettes.apricot.dark.colors[token], token).toBe(palettes.apricot.light.colors[token]);
+  }
+});
+
+describe('named tints', () => {
+  const { tints } = palettes.apricot.light;
+
+  it.each(['plain', 'butter', 'sage', 'apricot'] as const)('%s exists', (name) => {
+    expect(tintNamed(tints, name).name).toBe(name);
+  });
+});
+
 describe('tint rotation', () => {
-  const { tints } = palettes.violet.light;
+  const { tints } = palettes.apricot.light;

   it('rotates without repeating a neighbour', () => {
     for (let i = 0; i < tints.length * 2; i += 1) {
@@ -297,34 +381,6 @@ describe('tint rotation', () => {
   });
 });

-/**
- * The families must stay recognisably different from one another, or the picker
- * is three ways to choose the same screen. Comparing `primary` is the honest
- * test: it is the colour a user actually points at in the swatch row.
- */
-describe('families are distinguishable from each other', () => {
-  const MIN_DISTANCE = 60;
-
-  function distance(a: string, b: string): number {
-    const toRgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
-    const [x, y] = [toRgb(a), toRgb(b)];
-    return Math.hypot(...x.map((c, i) => c - y[i]!));
-  }
-
-  it.each([
-    ['violet', 'terracotta'],
-    ['violet', 'green'],
-    ['terracotta', 'green'],
-  ] as const)('%s and %s do not collide', (a, b) => {
-    for (const mode of ['light', 'dark'] as const) {
-      expect(
-        distance(palettes[a][mode].colors.primary, palettes[b][mode].colors.primary),
-        `${a} vs ${b} in ${mode}`,
-      ).toBeGreaterThanOrEqual(MIN_DISTANCE);
-    }
-  });
-});
-
 describe('resolving the mode from the preference', () => {
   it('follows the phone when set to automatic', () => {
     expect(resolveThemeMode('system', 'dark')).toBe('dark');
```

Two component specs build fixtures from the violet palette. Point them at Apricot:

```diff
--- a/apps/mobile/src/components/recipe-thumb.spec.ts
+++ b/apps/mobile/src/components/recipe-thumb.spec.ts
@@ -10,7 +10,7 @@ import {
 } from './recipe-thumb-tones';

 const source = () => readFileSync(join(__dirname, 'RecipeThumb.tsx'), 'utf8');
-const colors = palettes.violet.light.colors;
+const colors = palettes.apricot.light.colors;

 describe('recipe thumb tone selection', () => {
   it('is deterministic for a given dish key', () => {
```

```diff
--- a/apps/mobile/src/components/visual-rhythm.spec.ts
+++ b/apps/mobile/src/components/visual-rhythm.spec.ts
@@ -12,7 +12,7 @@ import { palettes } from '../theme/palettes';
  */

 const read = (relative: string) => readFileSync(join(__dirname, relative), 'utf8');
-const colors = palettes.violet.light.colors;
+const colors = palettes.apricot.light.colors;

 describe('borderless buttons align to the content margin', () => {
   const source = read('./Button.tsx');
```

- [ ] **Step 2: Run them and watch them fail**

```bash
pnpm --filter @kitchen/mobile exec vitest run src/theme/palette.spec.ts src/components/recipe-thumb.spec.ts src/components/visual-rhythm.spec.ts
```

Expected: **3 failed (3) test files, no tests run.** Each fails with
`TypeError: Cannot read properties of undefined (reading 'light')`, because `palettes.apricot` does
not exist yet.

- [ ] **Step 3: Replace the palette file**

Replace the whole of `apps/mobile/src/theme/palettes.ts` with the following. Every value comes from
spec §6, and the contrast each pair measures is in the §6.5 table:

```ts
/**
 * Apricot: the app's one palette, in a light and a dark mode (mobile redesign
 * spec §6). Every value here is verified by `palette.spec.ts`.
 *
 * - `primary` is the coral *fill*; `primaryText` is the same hue darkened
 *   until it passes as *text*. The coral is bright, so the label on it is ink
 *   (`onFill`) in both modes — never white, which measures under 3:1.
 * - `onFill` labels `primary` and `primaryPressed` only. The destructive fill
 *   takes its own label, `onDanger`, because a light-mode red wants white and
 *   the dark-mode one wants ink.
 *
 * The `*Inverse` group is the *media* surface: the camera viewfinder, a photo,
 * the live assistant's camera and the video player. Those are dark whatever
 * the mode, so the group is one shared object, identical in light and dark.
 */

export type TintName = 'plain' | 'butter' | 'sage' | 'apricot';

export interface Tint {
  readonly bg: string;
  readonly fg: string;
  readonly name: TintName;
}

export interface PaletteColors {
  readonly bg: string;
  readonly surface: string;
  readonly surfaceAlt: string;
  readonly border: string;
  readonly text: string;
  readonly textMuted: string;
  readonly primary: string;
  readonly primaryText: string;
  readonly primaryPressed: string;
  readonly primarySoft: string;
  readonly onFill: string;
  readonly onDanger: string;
  readonly accent: string;
  readonly accentSoft: string;
  readonly warn: string;
  readonly warnSoft: string;
  readonly danger: string;
  readonly dangerSoft: string;
  readonly success: string;
  readonly successSoft: string;
  readonly surfaceInverse: string;
  /** Lifted fill on a media surface (badges, secondary controls). */
  readonly surfaceInverseAlt: string;
  /** Outline on a media surface. */
  readonly borderInverse: string;
  readonly textInverse: string;
  readonly textInverseMuted: string;
  readonly primaryInverse: string;
  readonly onPrimaryInverse: string;
  readonly overlay: string;
}

/**
 * The bottom gradient that lets text sit on a photo. `stops` are
 * `[position from the top, alpha]`, linear between them; text may only sit
 * where alpha is at least `textMinAlpha`.
 */
export interface Scrim {
  readonly rgb: string;
  readonly stops: readonly (readonly [number, number])[];
  readonly textMinAlpha: number;
}

export interface Palette {
  readonly colors: PaletteColors;
  readonly tints: readonly Tint[];
  readonly gradientHero: readonly string[];
  readonly scrim: Scrim;
  /** Dark pages get a black shadow that no one can see, so depth moves onto
   *  the border instead and the shadow is dialled back to a faint halo. */
  readonly shadowColor: string;
  readonly shadowScale: number;
}

export type ThemeMode = 'light' | 'dark';

/** Constant across light and dark: media surfaces are always dark. */
const MEDIA = {
  surfaceInverse: '#1A120E',
  surfaceInverseAlt: '#3A2B22',
  borderInverse: '#8A7263',
  textInverse: '#FFFFFF',
  textInverseMuted: '#D9C8BC',
  primaryInverse: '#FFB08F',
  onPrimaryInverse: '#2A1A12',
} as const;

/** The "ember" ramp behind a Tonight tile that has no photo. */
const EMBER = ['#2A1A12', '#4A2516', '#6A3019'] as const;

/**
 * A single linear ramp from 0 at 40% to 0.82 at the bottom would only clear
 * 0.70 in the bottom 9% of a tile — too thin for a title and a caption. The
 * knee at 60% gives text the bottom 40%.
 */
const SCRIM: Scrim = {
  rgb: '#1A120E',
  stops: [
    [0, 0],
    [0.35, 0],
    [0.6, 0.7],
    [1, 0.82],
  ],
  textMinAlpha: 0.7,
};

const apricotLight: Palette = {
  colors: {
    bg: '#F7F3EF',
    surface: '#FFFFFF',
    surfaceAlt: '#F1EAE4',
    border: '#E6DCD3',
    text: '#2A1A12',
    /** The mock's #8A7A70 is 4.12:1 on the page and fails AA; this is the step that passes. */
    textMuted: '#6F6056',
    /** The mock's #FF6B3D is 2.83:1 on white and fails even the 3:1 fill bar. */
    primary: '#F05A2B',
    primaryPressed: '#E95424',
    primaryText: '#B83D0C',
    primarySoft: '#FFE9E0',
    onFill: '#2A1A12',
    onDanger: '#FFFFFF',
    accent: '#3F6A36',
    accentSoft: '#E3EDDD',
    success: '#1E7A46',
    successSoft: '#E4F2E9',
    warn: '#9A5B00',
    warnSoft: '#F8ECDA',
    danger: '#C0341D',
    dangerSoft: '#FBE5E1',
    overlay: 'rgba(42,26,18,0.45)',
    ...MEDIA,
  },
  tints: [
    { bg: '#FFFFFF', fg: '#B83D0C', name: 'plain' },
    { bg: '#FFF1C9', fg: '#7A5200', name: 'butter' },
    { bg: '#E3EDDD', fg: '#3F6A36', name: 'sage' },
    { bg: '#FFE9E0', fg: '#B83D0C', name: 'apricot' },
  ],
  gradientHero: EMBER,
  scrim: SCRIM,
  shadowColor: '#2A1A12',
  shadowScale: 1,
};

/** Warm, never neutral grey: a roasted-cocoa page, with the mock's coral kept. */
const apricotDark: Palette = {
  colors: {
    bg: '#16100C',
    surface: '#221913',
    surfaceAlt: '#2D231C',
    border: '#3D3027',
    text: '#F7EEE8',
    textMuted: '#BFAFA4',
    primary: '#FF6B3D',
    primaryPressed: '#FF8660',
    primaryText: '#FF9A73',
    primarySoft: '#3B2218',
    onFill: '#2A1A12',
    onDanger: '#2A1A12',
    accent: '#A3CF95',
    accentSoft: '#1F2B1B',
    success: '#74D29B',
    successSoft: '#15291D',
    warn: '#F2B45E',
    warnSoft: '#35260F',
    danger: '#FF8A78',
    dangerSoft: '#3D1C16',
    overlay: 'rgba(0,0,0,0.6)',
    ...MEDIA,
  },
  tints: [
    { bg: '#221913', fg: '#FF9A73', name: 'plain' },
    { bg: '#342A12', fg: '#F2CD6E', name: 'butter' },
    { bg: '#1F2B1B', fg: '#A8D39A', name: 'sage' },
    { bg: '#3B2218', fg: '#FF9A73', name: 'apricot' },
  ],
  gradientHero: EMBER,
  scrim: SCRIM,
  shadowColor: '#000000',
  shadowScale: 1.8,
};

export const palettes = {
  apricot: { light: apricotLight, dark: apricotDark },
} satisfies Record<string, Record<ThemeMode, Palette>>;

export function paletteFor(mode: ThemeMode): Palette {
  return palettes.apricot[mode] ?? palettes.apricot.light;
}

export type ColorToken = keyof PaletteColors;
```

- [ ] **Step 4: Update `theme/index.ts`: exports, radius, card shadow, `tintNamed`**

```diff
--- a/apps/mobile/src/theme/index.ts
+++ b/apps/mobile/src/theme/index.ts
@@ -1,5 +1,5 @@
 import type { Locale } from '@kitchen/i18n';
-import type { Palette, ThemeMode, Tint } from './palettes';
+import type { Palette, ThemeMode, Tint, TintName } from './palettes';

 /**
  * Design tokens. Kept flat and dependency-free so any component can pull colours,
@@ -8,8 +8,16 @@ import type { Palette, ThemeMode, Tint } from './palettes';
  * logical style keys (start/end) at the call site.
  */

-export { paletteFor, palettes, THEME_FAMILIES, DEFAULT_THEME_FAMILY } from './palettes';
-export type { Palette, PaletteColors, Tint, ThemeFamily, ThemeMode, ColorToken } from './palettes';
+export { paletteFor, palettes } from './palettes';
+export type {
+  Palette,
+  PaletteColors,
+  Scrim,
+  Tint,
+  TintName,
+  ThemeMode,
+  ColorToken,
+} from './palettes';

 export const spacing = {
   xs: 4,
@@ -21,34 +29,33 @@ export const spacing = {
 } as const;

 /**
- * The reference rounds generously — cards read ~20px and controls are pills.
- * `xl` is the card radius; `pill` stays for chips and the FAB.
+ * Apricot rounds generously (spec §6.7): `xl` is the bento tile, `lg` the group
+ * card, chat bubble and sheet, `md` inputs and thumbnails. Buttons, chips, the
+ * composer and the tab bar are pills.
  */
 export const radius = {
-  xs: 6,
-  sm: 10,
-  md: 14,
-  lg: 18,
-  xl: 22,
+  xs: 8,
+  sm: 12,
+  md: 18,
+  lg: 24,
+  xl: 28,
   pill: 999,
 } as const;

 /**
- * Depth comes from soft diffused shadow rather than borders. Spread across two
- * layers on iOS; Android gets the matching `elevation`. Opacities were lifted
- * when the page went near-white: against the old lavender the card's white fill
- * carried most of the separation on its own and the shadow only had to hint.
- * White-on-near-white leaves the shadow doing that work alone.
+ * Tiles separate from the cream page by fill, so the card shadow only hints.
+ * `raised` is for what floats: the tab bar, the camera button, sheets and the
+ * orb's bubble on the camera. Android gets the matching `elevation`.
  */
 export function shadowFor(palette: Palette) {
   const { shadowColor, shadowScale } = palette;
   return {
     card: {
       shadowColor,
-      shadowOpacity: 0.08 * shadowScale,
-      shadowRadius: 16,
-      shadowOffset: { width: 0, height: 6 },
-      elevation: 3,
+      shadowOpacity: 0.05 * shadowScale,
+      shadowRadius: 12,
+      shadowOffset: { width: 0, height: 4 },
+      elevation: 2,
     },
     raised: {
       shadowColor,
@@ -169,3 +176,12 @@ export function tintIn(tints: readonly Tint[], index: number): Tint {
   const wrapped = ((Math.trunc(index) % count) + count) % count;
   return tints[wrapped] ?? tints[0]!;
 }
+
+/**
+ * The tint with a fixed role, such as the butter count tile or the sage plan
+ * tile (spec §5.3). Rotation (`tintIn`) is for lists; a tile whose colour means
+ * something asks for it by name.
+ */
+export function tintNamed(tints: readonly Tint[], name: TintName): Tint {
+  return tints.find((tint) => tint.name === name) ?? tints[0]!;
+}
```

- [ ] **Step 5: Give `useTheme` the new API**

```diff
--- a/apps/mobile/src/theme/useTheme.ts
+++ b/apps/mobile/src/theme/useTheme.ts
@@ -1,11 +1,12 @@
 import { useMemo } from 'react';
 import { useColorScheme, type StyleSheet } from 'react-native';
-import { resolveThemeMode, shadowFor, tintIn, type Shadow } from './index';
+import { resolveThemeMode, shadowFor, tintIn, tintNamed, type Shadow } from './index';
 import {
-  DEFAULT_THEME_FAMILY,
   paletteFor,
   type Palette,
+  type Scrim,
   type Tint,
+  type TintName,
   type ThemeMode,
 } from './palettes';
 import { useSettingsStore } from '../stores/settings';
@@ -14,10 +15,14 @@ export interface Theme {
   readonly colors: Palette['colors'];
   readonly tints: readonly Tint[];
   readonly gradientHero: readonly string[];
+  readonly scrim: Scrim;
   readonly shadow: Shadow;
   readonly mode: ThemeMode;
   readonly isDark: boolean;
-  readonly tintFor: (index: number) => Tint;
+  /** Rotating tints for a list, so neighbours never repeat. */
+  readonly tintIn: (index: number) => Tint;
+  /** The tint for a tile whose colour has a fixed role. */
+  readonly tintNamed: (name: TintName) => Tint;
 }

 /**
@@ -32,15 +37,17 @@ export function useTheme(): Theme {
   const mode: ThemeMode = resolveThemeMode(preference, system);

   return useMemo(() => {
-    const palette = paletteFor(DEFAULT_THEME_FAMILY, mode);
+    const palette = paletteFor(mode);
     return {
       colors: palette.colors,
       tints: palette.tints,
       gradientHero: palette.gradientHero,
+      scrim: palette.scrim,
       shadow: shadowFor(palette),
       mode,
       isDark: mode === 'dark',
-      tintFor: (index: number) => tintIn(palette.tints, index),
+      tintIn: (index: number) => tintIn(palette.tints, index),
+      tintNamed: (name: TintName) => tintNamed(palette.tints, name),
     };
   }, [mode]);
 }
```

- [ ] **Step 6: Rename `tintFor` to `tintIn` at its five call sites**

The behaviour is identical: `tintIn` rotates through the tints exactly as `tintFor` did.

```bash
perl -pi -e 's/\btintFor\b/tintIn/g' 'apps/mobile/src/app/(tabs)/home.tsx' 'apps/mobile/src/app/(auth)/welcome.tsx' apps/mobile/src/features/home/WeekStrip.tsx apps/mobile/src/features/home/KitchenGlance.tsx apps/mobile/src/features/home/StatTiles.tsx
git grep -n "tintFor" -- apps/mobile
```

Expected: the `git grep` prints nothing and exits 1.

- [ ] **Step 7: Give the destructive button its own label, and fix Card's comments**

The coral takes an ink label, but the light-mode red needs white. `onFill` would now be ink on red
and fail AA:

```diff
--- a/apps/mobile/src/components/Button.tsx
+++ b/apps/mobile/src/components/Button.tsx
@@ -44,7 +44,9 @@ const fgFor = (colors: PaletteColors): Record<ButtonVariant, string> => ({
   primary: colors.onFill,
   secondary: colors.text,
   ghost: colors.primaryText,
-  danger: colors.onFill,
+  // Not `onFill`: the coral takes an ink label, but the light-mode red takes
+  // white, so the destructive fill carries its own label token.
+  danger: colors.onDanger,
   // The lifted brand tone is light in both modes, so its label is always dark.
   primaryInverse: colors.onPrimaryInverse,
   ghostInverse: colors.primaryInverse,
```

```diff
--- a/apps/mobile/src/components/Card.tsx
+++ b/apps/mobile/src/components/Card.tsx
@@ -12,7 +12,7 @@ export interface CardProps {
   /** Fills the card with one of the rotating pastel tints from the theme. Takes
    *  precedence over `tone`, and drops the border so the fill reads as the edge. */
   tint?: Tint;
-  /** The hero treatment: a violet gradient carrying inverse text. */
+  /** The hero treatment: the ember gradient carrying inverse text. */
   gradient?: boolean;
   style?: ViewStyle;
 }
@@ -43,7 +43,8 @@ export function Card({
     ...(gradient ? { backgroundColor: 'transparent', borderColor: 'transparent' } : null),
   };

-  /** The kit's feature card runs deep violet up into the brand violet. */
+  /** Ember runs from roasted cocoa up to a burnt coral, so inverse text reads
+   *  across the whole ramp (`palette.spec.ts`, "hero gradient"). */
   const body = gradient ? (
     <LinearGradient
       colors={gradientHero as unknown as readonly [string, string, ...string[]]}
```

- [ ] **Step 8: Run the guards and watch them pass**

```bash
pnpm --filter @kitchen/mobile exec vitest run src/theme src/components src/stores
pnpm --filter @kitchen/mobile test
```

Expected:

- **9 files, 153 tests passed** for the three directories.
- The suite: **54 files, 625 tests.**

The suite drops by 148, and that is correct. The old palette spec ran its 40 per-palette cases
over six palettes plus 8 others (248). The new one runs 45 cases over two palettes plus 10 others
(100). Nothing outside `palette.spec.ts` changes count.

- [ ] **Step 9: Prove the new guards are not vacuous**

Temporarily reintroduce the two bugs they exist for:

- the single linear scrim ramp, which only reaches α 0.7 in the bottom 9% of a tile
- an ink label on the light-mode red

Then restore the file:

```bash
cp apps/mobile/src/theme/palettes.ts /tmp/palettes.ts.keep
perl -0pi -e "s/\[0\.35, 0\],\n    \[0\.6, 0\.7\],/[0.4, 0],/; s/onDanger: '#FFFFFF'/onDanger: '#2A1A12'/" apps/mobile/src/theme/palettes.ts
pnpm --filter @kitchen/mobile exec vitest run src/theme/palette.spec.ts
mv /tmp/palettes.ts.keep apps/mobile/src/theme/palettes.ts
pnpm --filter @kitchen/mobile exec vitest run src/theme/palette.spec.ts
```

Expected:

- **First run: 3 failed | 97 passed (100):**
  - `apricot light palette > button fills carry readable labels`
  - `photo scrim > gives text the bottom 40% of a tile`, in both modes
- **Second run, after the restore:** 100 passed.

- [ ] **Step 10: Typecheck and lint**

```bash
pnpm --filter @kitchen/mobile typecheck && pnpm --filter @kitchen/mobile lint
```

Expected: both exit 0.

- [ ] **Step 11: Update the Design-tokens note in the Copilot instructions**

§14's Docs list asks for this. The note names the mobile token files, and says there is one palette
and that `onFill` is ink on coral. The spec list at the top gains the redesign spec:

```diff
--- a/.github/copilot-instructions.md
+++ b/.github/copilot-instructions.md
@@ -12,7 +12,8 @@ file to the feature: `2026-07-26-kitchen-ai-design.md` (system baseline),
 `2026-08-10-publishing-compliance-design.md`, `2026-08-11-ai-credits-design.md`,
 `2026-08-11-recipe-media-resolution-design.md`, `2026-08-11-model-routing-design.md` (vision
 vendor + per-model cost), `2026-08-26-kitchen-companion-design.md` (smart screen, reminders,
-timers, live assistant). Adding a subsystem means adding a spec, not just code.
+timers, live assistant), `2026-09-27-mobile-apricot-bento-redesign-design.md` (mobile UI, which
+supersedes the Slack-inspired spec for `apps/mobile`). Adding a subsystem means adding a spec, not just code.

 ## Commands

@@ -158,7 +159,9 @@ Non-obvious system rules:
 ## Design tokens (self-enforcing)

 Colour, radius and tracking resolve from exactly two files: `apps/web/src/app/globals.css`
-(`@theme inline` Tailwind v4 tokens) and `apps/mobile/src/theme/index.ts`. Components reference
+(`@theme inline` Tailwind v4 tokens) and `apps/mobile/src/theme/` (`palettes.ts` for colour — one
+Apricot palette in light and dark, where `onFill` is ink on the coral, never white — and `index.ts`
+for radius, spacing and type). Components reference
 tokens by name. Three guard tests keep it honest and must not be relaxed to make a change pass:

 - `apps/web/src/app/palette.test.ts` + `apps/mobile/src/theme/palette.spec.ts` parse the token files
```

- [ ] **Step 12: Format and commit**

```bash
npx prettier --config packages/config/prettier.config.mjs --write apps/mobile/src/theme/palettes.ts apps/mobile/src/theme/index.ts apps/mobile/src/theme/useTheme.ts apps/mobile/src/theme/palette.spec.ts apps/mobile/src/components/recipe-thumb.spec.ts apps/mobile/src/components/visual-rhythm.spec.ts apps/mobile/src/components/Button.tsx apps/mobile/src/components/Card.tsx 'apps/mobile/src/app/(tabs)/home.tsx' 'apps/mobile/src/app/(auth)/welcome.tsx' apps/mobile/src/features/home/WeekStrip.tsx apps/mobile/src/features/home/KitchenGlance.tsx apps/mobile/src/features/home/StatTiles.tsx
git add apps/mobile/src/theme apps/mobile/src/components/recipe-thumb.spec.ts apps/mobile/src/components/visual-rhythm.spec.ts apps/mobile/src/components/Button.tsx apps/mobile/src/components/Card.tsx 'apps/mobile/src/app/(tabs)/home.tsx' 'apps/mobile/src/app/(auth)/welcome.tsx' apps/mobile/src/features/home .github/copilot-instructions.md
git commit -m "feat(mobile): Apricot palette, one family in light and dark" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

Do **not** run Prettier on `.github/copilot-instructions.md`. On main it already differs from
Prettier in one unrelated table cell (the `pnpm format` row), and formatting it would rewrite that
cell as well.

---

### Task 3: The Apricot type scale

**Files:**

- Modify: `apps/mobile/src/theme/index.ts:80-85, 91-107, 130-141` (`TextStyleToken`, `SCALE`, `typography()`)
- Modify: `apps/mobile/src/components/AppText.tsx:43-48`
- Modify: `apps/mobile/src/theme/typography.spec.ts:22-31, 49-55, 57-64`

**Interfaces:**

- Consumes: `typography(locale)` and `maxFontScaleFor(variant)`, unchanged in shape. The
  module-private `CHROME_VARIANTS` list (`button`, `label`, `caption`) is unchanged.
- Produces:
  - `TypographyVariant` gains `'hero'` and `'numeral'`. Both are content tier, so uncapped.
  - `TextStyleToken.fontVariant?: 'tabular-nums'[]`, set only on `numeral`.
  - `AppText` applies `fontVariant` when the token has one.

| Variant      | Size / weight | Latin tracking | Tier                     |
| ------------ | ------------- | -------------- | ------------------------ |
| `hero`       | 34 / 600      | −0.68          | content                  |
| `display`    | 28 / 600      | −0.56          | content                  |
| `title`      | 22 / 600      | −0.33          | content                  |
| `heading`    | 18 / 600      | −0.18          | content                  |
| `body`       | 16 / 400      | 0              | content                  |
| `bodyStrong` | 16 / 500      | 0              | content                  |
| `numeral`    | 40 / 700      | −0.8           | content, tabular figures |
| `button`     | 16 / 600      | +0.1           | chrome                   |
| `label`      | 14 / 500      | +0.1           | chrome                   |
| `caption`    | 13 / 400      | +0.1           | chrome                   |

- [ ] **Step 1: Update the typography spec**

These are design decisions, not relaxations (§7.2):

- the button tier becomes 600
- two new variants are classified
- numerals are tabular

```diff
--- a/apps/mobile/src/theme/typography.spec.ts
+++ b/apps/mobile/src/theme/typography.spec.ts
@@ -22,10 +22,20 @@ describe('typography', () => {
     expect(typography('ar').body.lineHeight).toBeGreaterThan(typography('en').body.lineHeight);
   });

-  it('carries a 700-weight button tier for pill labels', () => {
-    expect(typography('en').button.fontWeight).toBe('700');
+  it('carries a 600-weight button tier for pill labels', () => {
+    expect(typography('en').button.fontWeight).toBe('600');
     expect(typography('en').button.fontSize).toBe(16);
   });
+
+  /**
+   * Tile counts, the credit balance and the cook timer change digit by digit.
+   * Proportional figures make the number shuffle sideways as it ticks.
+   */
+  it('sets numerals in tabular figures, in both locales', () => {
+    expect(typography('en').numeral.fontVariant).toEqual(['tabular-nums']);
+    expect(typography('ar').numeral.fontVariant).toEqual(['tabular-nums']);
+    expect(typography('en').body.fontVariant).toBeUndefined();
+  });
 });

 describe('typography line height', () => {
@@ -49,7 +59,15 @@ describe('maxFontScaleFor', () => {
   it('leaves the content variants uncapped', () => {
     // undefined rather than Infinity: this value is handed to React Native's
     // maxFontSizeMultiplier prop, which accepts null, 0, or a number >= 1.
-    for (const variant of ['display', 'title', 'heading', 'body', 'bodyStrong'] as const) {
+    for (const variant of [
+      'hero',
+      'display',
+      'title',
+      'heading',
+      'body',
+      'bodyStrong',
+      'numeral',
+    ] as const) {
       expect(maxFontScaleFor(variant), variant).toBeUndefined();
     }
   });
@@ -57,8 +75,17 @@ describe('maxFontScaleFor', () => {
   it('classifies every variant in the scale', () => {
     // Adding a variant without deciding whether it is chrome or content would
     // silently default it to uncapped. Fail here instead.
-    expect(Object.keys(typography('en')).sort()).toEqual(
-      ['body', 'bodyStrong', 'button', 'caption', 'display', 'heading', 'label', 'title'],
-    );
+    expect(Object.keys(typography('en')).sort()).toEqual([
+      'body',
+      'bodyStrong',
+      'button',
+      'caption',
+      'display',
+      'heading',
+      'hero',
+      'label',
+      'numeral',
+      'title',
+    ]);
   });
 });
```

- [ ] **Step 2: Run it and watch it fail**

```bash
pnpm --filter @kitchen/mobile exec vitest run src/theme/typography.spec.ts
```

Expected: **3 failed | 6 passed (9)**:

- `expected '700' to be '600'`
- `TypeError: Cannot read properties of undefined (reading 'fontVariant')`
- `expected [ Array(8) ] to deeply equal [ Array(10) ]`

"leaves the content variants uncapped" passes even before the change, because an unknown variant
is not in `CHROME_VARIANTS`. That vacuous pass is exactly why "classifies every variant" exists.

- [ ] **Step 3: Replace the scale**

```diff
--- a/apps/mobile/src/theme/index.ts
+++ b/apps/mobile/src/theme/index.ts
@@ -80,6 +80,8 @@ export interface TextStyleToken {
   lineHeight: number;
   fontWeight: '400' | '500' | '600' | '700';
   letterSpacing: number;
+  /** Only on `numeral`: counts that tick must not jitter as digits change width. */
+  fontVariant?: 'tabular-nums'[];
 }

 const LATIN_LINE_HEIGHT = 1.35;
@@ -91,17 +93,29 @@ const ARABIC_LINE_HEIGHT = 1.7;
  * forces gaps into the joins.
  */
 const SCALE = {
-  display: { fontSize: 28, fontWeight: '700' as const, letterSpacing: -0.22 },
-  title: { fontSize: 22, fontWeight: '700' as const, letterSpacing: -0.09 },
-  heading: { fontSize: 18, fontWeight: '600' as const, letterSpacing: -0.02 },
+  hero: { fontSize: 34, fontWeight: '600' as const, letterSpacing: -0.68 },
+  display: { fontSize: 28, fontWeight: '600' as const, letterSpacing: -0.56 },
+  title: { fontSize: 22, fontWeight: '600' as const, letterSpacing: -0.33 },
+  heading: { fontSize: 18, fontWeight: '600' as const, letterSpacing: -0.18 },
   body: { fontSize: 16, fontWeight: '400' as const, letterSpacing: 0 },
-  bodyStrong: { fontSize: 16, fontWeight: '600' as const, letterSpacing: 0 },
-  button: { fontSize: 16, fontWeight: '700' as const, letterSpacing: 0.2 },
+  bodyStrong: { fontSize: 16, fontWeight: '500' as const, letterSpacing: 0 },
+  numeral: {
+    fontSize: 40,
+    fontWeight: '700' as const,
+    letterSpacing: -0.8,
+    fontVariant: ['tabular-nums' as const],
+  },
+  button: { fontSize: 16, fontWeight: '600' as const, letterSpacing: 0.1 },
   label: { fontSize: 14, fontWeight: '500' as const, letterSpacing: 0.1 },
-  caption: { fontSize: 12, fontWeight: '500' as const, letterSpacing: 0.1 },
+  caption: { fontSize: 13, fontWeight: '400' as const, letterSpacing: 0.1 },
 } satisfies Record<
   string,
-  { fontSize: number; fontWeight: TextStyleToken['fontWeight']; letterSpacing: number }
+  {
+    fontSize: number;
+    fontWeight: TextStyleToken['fontWeight'];
+    letterSpacing: number;
+    fontVariant?: TextStyleToken['fontVariant'];
+  }
 >;

 export type TypographyVariant = keyof typeof SCALE;
@@ -130,12 +144,13 @@ export function typography(locale: Locale): Record<TypographyVariant, TextStyleT
   const factor = isArabic ? ARABIC_LINE_HEIGHT : LATIN_LINE_HEIGHT;
   const out = {} as Record<TypographyVariant, TextStyleToken>;
   for (const key of Object.keys(SCALE) as TypographyVariant[]) {
-    const entry = SCALE[key]!;
+    const entry: (typeof SCALE)[TypographyVariant] = SCALE[key];
     out[key] = {
       fontSize: entry.fontSize,
       fontWeight: entry.fontWeight,
       lineHeight: Math.round(entry.fontSize * factor),
       letterSpacing: isArabic ? 0 : entry.letterSpacing,
+      ...('fontVariant' in entry ? { fontVariant: [...entry.fontVariant] } : null),
     };
   }
   return out;
```

- [ ] **Step 4: Let `AppText` pass tabular figures through**

```diff
--- a/apps/mobile/src/components/AppText.tsx
+++ b/apps/mobile/src/components/AppText.tsx
@@ -43,6 +43,7 @@ export function AppText({ variant = 'body', color, center, muted, style, ...rest
     // The weight-specific Arabic family already encodes the weight; setting
     // fontWeight on top of it makes iOS synthesize a heavier face.
     ...(fontFamily ? null : { fontWeight: token.fontWeight }),
+    ...(token.fontVariant ? { fontVariant: token.fontVariant } : null),
     ...(center ? { textAlign: 'center' } : null),
   };
   return <Text style={[base, style]} maxFontSizeMultiplier={maxFontScaleFor(variant)} {...rest} />;
```

- [ ] **Step 5: Run the gates**

```bash
pnpm --filter @kitchen/mobile exec vitest run src/theme/typography.spec.ts
pnpm --filter @kitchen/mobile test
pnpm --filter @kitchen/mobile typecheck && pnpm --filter @kitchen/mobile lint
```

Expected: **9 passed (9)**; the suite **54 files, 626 tests**; typecheck and lint exit 0.

- [ ] **Step 6: Format and commit**

```bash
npx prettier --config packages/config/prettier.config.mjs --write apps/mobile/src/theme/index.ts apps/mobile/src/components/AppText.tsx apps/mobile/src/theme/typography.spec.ts
git add apps/mobile/src/theme/index.ts apps/mobile/src/components/AppText.tsx apps/mobile/src/theme/typography.spec.ts
git commit -m "feat(mobile): Apricot type scale with hero and tabular numeral" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 4: Outfit as the Latin face

**Files:**

- Create: `apps/mobile/assets/fonts/Outfit-Regular.ttf`, `Outfit-Medium.ttf`,
  `Outfit-SemiBold.ttf`, `Outfit-Bold.ttf`, `OFL-Outfit.txt` (downloaded, not written)
- Modify: `apps/mobile/assets/fonts/README.md:1-7, 9-15`
- Modify: `apps/mobile/src/lib/fonts.ts:3-9, 21-26, 32-38, 57-71`
- Modify: `apps/mobile/src/lib/font-loader.ts:1-12, 18-32`
- Modify: `apps/mobile/src/lib/fonts.spec.ts:1-5, 13-18, 36-43`
- Modify: `apps/mobile/app.json:124-129` (the `expo-font` plugin)
- Modify (comments only): `apps/mobile/src/components/AppText.tsx:40-47`, `apps/mobile/src/theme/index.ts:71-77`

**Interfaces:**

- Consumes: `ARABIC_FONTS`, `arabicFontFamily` and `useFontStore`, all unchanged.
  `TextStyleToken['fontWeight']` is `'400' | '500' | '600' | '700'`.
- Produces from `lib/fonts.ts`:
  - `LATIN_FONTS`:

    ```ts
    export const LATIN_FONTS = {
      regular: 'Outfit-Regular',
      medium: 'Outfit-Medium',
      semibold: 'Outfit-SemiBold',
      bold: 'Outfit-Bold',
    } as const;
    ```

  - `latinFontFamily(weight): string`. Each weight gets its own cut; 600 is not promoted.
  - `resolveFontFamily(locale, fontsLoaded, weight = '400')` returns Outfit for Latin once the
    faces are loaded, and `undefined` (the system font) before that. This is the same fallback
    Arabic already has.
- `Field.tsx` calls `resolveFontFamily(locale, fontsLoaded)`, so text inputs pick up
  Outfit-Regular with no change. `AppText` keeps omitting `fontWeight` whenever a family resolved.
  The cut encodes the weight, and adding `fontWeight` on top makes iOS synthesise a heavier face.

- [ ] **Step 1: Replace the Latin case in the fonts spec**

The rule "never overrides the system font for Latin" is reversed on purpose, so that case is
replaced rather than kept:

```diff
--- a/apps/mobile/src/lib/fonts.spec.ts
+++ b/apps/mobile/src/lib/fonts.spec.ts
@@ -1,5 +1,11 @@
 import { describe, expect, it } from 'vitest';
-import { ARABIC_FONTS, arabicFontFamily, resolveFontFamily } from './fonts';
+import {
+  ARABIC_FONTS,
+  LATIN_FONTS,
+  arabicFontFamily,
+  latinFontFamily,
+  resolveFontFamily,
+} from './fonts';

 describe('ARABIC_FONTS', () => {
   it('uses the PostScript names the .ttf files self-report', () => {
@@ -13,6 +19,29 @@ describe('ARABIC_FONTS', () => {
   });
 });

+describe('LATIN_FONTS', () => {
+  it('uses the PostScript names the .ttf files self-report', () => {
+    expect(LATIN_FONTS.regular).toBe('Outfit-Regular');
+    expect(LATIN_FONTS.medium).toBe('Outfit-Medium');
+    expect(LATIN_FONTS.semibold).toBe('Outfit-SemiBold');
+    expect(LATIN_FONTS.bold).toBe('Outfit-Bold');
+  });
+});
+
+describe('latinFontFamily', () => {
+  /** Outfit ships a real 600, so no tier shares a cut the way Tajawal's must. */
+  it('gives each of the four weights its own cut', () => {
+    const cuts = (['400', '500', '600', '700'] as const).map(latinFontFamily);
+    expect(cuts).toEqual([
+      LATIN_FONTS.regular,
+      LATIN_FONTS.medium,
+      LATIN_FONTS.semibold,
+      LATIN_FONTS.bold,
+    ]);
+    expect(new Set(cuts).size).toBe(4);
+  });
+});
+
 describe('arabicFontFamily', () => {
   it('maps each weight to its own vendored cut', () => {
     expect(arabicFontFamily('700')).toBe(ARABIC_FONTS.bold);
@@ -36,8 +65,15 @@ describe('resolveFontFamily', () => {
     expect(resolveFontFamily('ar', false, '700')).toBeUndefined();
   });

-  it('never overrides the system font for Latin locales', () => {
-    expect(resolveFontFamily('en', true, '700')).toBeUndefined();
-    expect(resolveFontFamily('en', false, '400')).toBeUndefined();
+  it('returns the weight-specific Outfit face for Latin once fonts are loaded', () => {
+    expect(resolveFontFamily('en', true, '400')).toBe('Outfit-Regular');
+    expect(resolveFontFamily('en', true, '500')).toBe('Outfit-Medium');
+    expect(resolveFontFamily('en', true, '600')).toBe('Outfit-SemiBold');
+    expect(resolveFontFamily('en', true, '700')).toBe('Outfit-Bold');
+    expect(resolveFontFamily('en', true)).toBe('Outfit-Regular');
+  });
+
+  it('falls back to the system font for Latin until the faces have loaded', () => {
+    expect(resolveFontFamily('en', false, '700')).toBeUndefined();
   });
 });
```

- [ ] **Step 2: Run it and watch it fail**

```bash
pnpm --filter @kitchen/mobile exec vitest run src/lib/fonts.spec.ts
```

Expected: **3 failed | 7 passed (10)**:

- `TypeError: Cannot read properties of undefined (reading 'regular')`
- `TypeError: undefined is not a function`
- `AssertionError: expected undefined to be 'Outfit-Regular'`

- [ ] **Step 3: Download the four cuts and the licence from the pinned commit, and verify them**

```bash
cd apps/mobile/assets/fonts
BASE=https://raw.githubusercontent.com/Outfitio/Outfit-Fonts/902773808eb372f70fb34e8946dd1ffe604efc79
for w in Regular Medium SemiBold Bold; do curl -fsSL -o "Outfit-$w.ttf" "$BASE/fonts/ttf/Outfit-$w.ttf"; done
curl -fsSL -o OFL-Outfit.txt "$BASE/OFL.txt"
shasum -a 256 -c <<'EOF'
3b64ac4f6ab6a8eebddd4b0bc03c811c43602e11e176382ab0ee6be615ab861b  Outfit-Regular.ttf
dc8d9212fc57556a55d01e863071f727cd6264b748e28885d853807aeb186142  Outfit-Medium.ttf
bf2e1d2a6ec2a67952e8b36edd2b2bb9f340c0cdd10b0ad5145b4dbbc1339608  Outfit-SemiBold.ttf
f620b69582e06d7e1b3bbde74ed8c5876eadabb038390780db2a3414a1490197  Outfit-Bold.ttf
c676351bf8576b9aba743cd5eaa8c0e7ee0d51f805d720447b4df4ddb6a2e416  OFL-Outfit.txt
EOF
cd -
```

Expected: five `: OK` lines. If any line says `FAILED`, stop. The file is not the pinned one, and
the PostScript names below cannot be trusted.

- [ ] **Step 4 (optional, needs `pip install fonttools`): confirm what the files self-report**

```bash
python3 - <<'EOF'
from fontTools.ttLib import TTFont
for w in ['Regular', 'Medium', 'SemiBold', 'Bold']:
    f = TTFont(f'apps/mobile/assets/fonts/Outfit-{w}.ttf')
    tags = {r.FeatureTag for r in f['GSUB'].table.FeatureList.FeatureRecord}
    print(f['name'].getDebugName(6), f['OS/2'].usWeightClass, 'tnum' in tags)
EOF
```

Expected: `Outfit-Regular 400 True`, `Outfit-Medium 500 True`, `Outfit-SemiBold 600 True`,
`Outfit-Bold 700 True`.

- [ ] **Step 5: Add the Latin family to `lib/fonts.ts`**

```diff
--- a/apps/mobile/src/lib/fonts.ts
+++ b/apps/mobile/src/lib/fonts.ts
@@ -3,7 +3,18 @@ import type { Locale } from '@kitchen/i18n';
 import type { TextStyleToken } from '../theme';

 /**
- * Tajawal — mandated for Arabic typography by spec §7.
+ * Outfit for Latin (mobile redesign spec §7.1) and Tajawal for Arabic (system
+ * design spec §7). All seven faces ship inside the app, so there is no CDN
+ * dependency and no first-launch network fetch.
+ *
+ * Outfit is vendored under `apps/mobile/assets/fonts/` from
+ * `Outfitio/Outfit-Fonts`, pinned at commit
+ * 902773808eb372f70fb34e8946dd1ffe604efc79, version 1.100, SIL OFL 1.1. Its
+ * four static cuts self-report the PostScript names `Outfit-Regular`,
+ * `-Medium`, `-SemiBold` and `-Bold`, and each has the `tnum` feature the
+ * `numeral` type variant asks for.
+ *
+ * Tajawal:
  *
  * The three weights are vendored under `apps/mobile/assets/fonts/` and ship inside
  * the app, so there is no CDN dependency and no first-launch network fetch. See
@@ -21,6 +32,13 @@ import type { TextStyleToken } from '../theme';
  * Tajawal ships no semibold: its weights run 200, 300, 400, 500, 700, 800, 900.
  * The type scale's 600 tier is therefore promoted to Bold — see `arabicFontFamily`.
  */
+export const LATIN_FONTS = {
+  regular: 'Outfit-Regular',
+  medium: 'Outfit-Medium',
+  semibold: 'Outfit-SemiBold',
+  bold: 'Outfit-Bold',
+} as const;
+
 export const ARABIC_FONTS = {
   regular: 'Tajawal-Regular',
   medium: 'Tajawal-Medium',
@@ -32,7 +50,7 @@ interface FontState {
   setLoaded: (loaded: boolean) => void;
 }

-/** Published so any text primitive can react when the Arabic font finishes loading. */
+/** Published so any text primitive can react when the vendored fonts finish loading. */
 export const useFontStore = create<FontState>((set) => ({
   loaded: false,
   setLoaded: (loaded) => set((prev) => (prev.loaded === loaded ? prev : { loaded })),
@@ -57,15 +75,34 @@ export function arabicFontFamily(weight: TextStyleToken['fontWeight']): string {
   }
 }

+/**
+ * Pick the weight-specific Latin family. Unlike Tajawal, Outfit ships a real
+ * 600, so every tier of the scale gets its own cut and nothing is promoted.
+ */
+export function latinFontFamily(weight: TextStyleToken['fontWeight']): string {
+  switch (weight) {
+    case '700':
+      return LATIN_FONTS.bold;
+    case '600':
+      return LATIN_FONTS.semibold;
+    case '500':
+      return LATIN_FONTS.medium;
+    default:
+      return LATIN_FONTS.regular;
+  }
+}
+
 /**
  * The font family to apply for a given locale/weight, or `undefined` to use the
- * system font (Latin, or Arabic before the custom font has loaded).
+ * system font until the vendored faces have loaded. Both scripts share that
+ * fallback: naming a face before it is registered would drop the text to the
+ * system font anyway, but with a warning on Android.
  */
 export function resolveFontFamily(
   locale: Locale,
   fontsLoaded: boolean,
   weight: TextStyleToken['fontWeight'] = '400',
 ): string | undefined {
-  if (locale === 'ar' && fontsLoaded) return arabicFontFamily(weight);
-  return undefined;
+  if (!fontsLoaded) return undefined;
+  return locale === 'ar' ? arabicFontFamily(weight) : latinFontFamily(weight);
 }
```

- [ ] **Step 6: Register the faces at runtime (`lib/font-loader.ts`)**

`.ttf` imports are already declared in `src/types/assets.d.ts`.

```diff
--- a/apps/mobile/src/lib/font-loader.ts
+++ b/apps/mobile/src/lib/font-loader.ts
@@ -1,12 +1,16 @@
 import { useEffect } from 'react';
 import { useFonts } from 'expo-font';
-import { ARABIC_FONTS, useFontStore } from './fonts';
+import { ARABIC_FONTS, LATIN_FONTS, useFontStore } from './fonts';
+import RegularLatin from '../../assets/fonts/Outfit-Regular.ttf';
+import MediumLatin from '../../assets/fonts/Outfit-Medium.ttf';
+import SemiBoldLatin from '../../assets/fonts/Outfit-SemiBold.ttf';
+import BoldLatin from '../../assets/fonts/Outfit-Bold.ttf';
 import RegularArabic from '../../assets/fonts/Tajawal-Regular.ttf';
 import MediumArabic from '../../assets/fonts/Tajawal-Medium.ttf';
 import BoldArabic from '../../assets/fonts/Tajawal-Bold.ttf';

 /**
- * The vendored Tajawal faces, bundled as Metro assets so they ship
+ * The vendored Outfit and Tajawal faces, bundled as Metro assets so they ship
  * inside the JS bundle (offline, no CDN) and appear in `expo export` output. The
  * same files are ALSO embedded natively via the `expo-font` config plugin in
  * app.json (its `fonts` array), which pre-registers them for standalone builds
@@ -18,15 +22,19 @@ import BoldArabic from '../../assets/fonts/Tajawal-Bold.ttf';
  * fall back to the system font.
  */
 const FONT_SOURCES = {
+  [LATIN_FONTS.regular]: RegularLatin,
+  [LATIN_FONTS.medium]: MediumLatin,
+  [LATIN_FONTS.semibold]: SemiBoldLatin,
+  [LATIN_FONTS.bold]: BoldLatin,
   [ARABIC_FONTS.regular]: RegularArabic,
   [ARABIC_FONTS.medium]: MediumArabic,
   [ARABIC_FONTS.bold]: BoldArabic,
 };

 /**
- * Registers the Arabic font faces. Call once, high in the tree. The app never
+ * Registers the Latin and Arabic font faces. Call once, high in the tree. The app never
  * blocks on it: standalone builds already have the faces from the config plugin,
- * and in Expo Go the screens render with the system Arabic font for a frame and
+ * and in Expo Go the screens render with the system font for a frame and
  * re-render once loading resolves.
  */
 export function useAppFonts(): boolean {
```

- [ ] **Step 7: Embed the faces natively (`app.json`)**

Without this, a standalone build embeds no Outfit, and every Latin screen silently falls back to the
system font. The runtime loader only covers Expo Go and the dev client.

```diff
--- a/apps/mobile/app.json
+++ b/apps/mobile/app.json
@@ -124,6 +124,10 @@
         "expo-font",
         {
           "fonts": [
+            "./assets/fonts/Outfit-Regular.ttf",
+            "./assets/fonts/Outfit-Medium.ttf",
+            "./assets/fonts/Outfit-SemiBold.ttf",
+            "./assets/fonts/Outfit-Bold.ttf",
             "./assets/fonts/Tajawal-Regular.ttf",
             "./assets/fonts/Tajawal-Medium.ttf",
             "./assets/fonts/Tajawal-Bold.ttf"
```

- [ ] **Step 8: Record provenance, and correct the two comments that said "Arabic only"**

```diff
--- a/apps/mobile/assets/fonts/README.md
+++ b/apps/mobile/assets/fonts/README.md
@@ -1,7 +1,39 @@
-# Tajawal
+# Vendored fonts

-Vendored so Arabic typography (spec §7) works offline and on first launch, and so
-the app does not fetch font binaries from a mutable CDN ref at runtime.
+Both scripts ship inside the app so typography works offline and on first launch,
+and so the app never fetches font binaries from a mutable CDN ref at runtime.
+`src/lib/fonts.ts` keys each face by its PostScript name, and a mismatch falls
+back to the system font silently, so the names below are load-bearing.
+
+# Outfit (Latin)
+
+The Latin face of the Apricot redesign (mobile redesign spec §7.1).
+
+- **Source:** https://github.com/Outfitio/Outfit-Fonts/tree/main/fonts/ttf
+- **Retrieved at commit:** `902773808eb372f70fb34e8946dd1ffe604efc79`
+- **Version:** 1.100 — Copyright 2021 The Outfit Project Authors
+- **Licence:** SIL Open Font License 1.1 — full text in `OFL-Outfit.txt`
+
+Weights vendored: Regular (400), Medium (500), SemiBold (600), Bold (700). Each
+cut carries the `tnum` feature, which the `numeral` type variant relies on for
+tabular figures. Outfit has no Arabic glyphs; Arabic inside Latin UI falls back
+per glyph to the OS font.
+
+| File                  | sha256                                                             |
+| --------------------- | ------------------------------------------------------------------ |
+| `Outfit-Regular.ttf`  | `3b64ac4f6ab6a8eebddd4b0bc03c811c43602e11e176382ab0ee6be615ab861b` |
+| `Outfit-Medium.ttf`   | `dc8d9212fc57556a55d01e863071f727cd6264b748e28885d853807aeb186142` |
+| `Outfit-SemiBold.ttf` | `bf2e1d2a6ec2a67952e8b36edd2b2bb9f340c0cdd10b0ad5145b4dbbc1339608` |
+| `Outfit-Bold.ttf`     | `f620b69582e06d7e1b3bbde74ed8c5876eadabb038390780db2a3414a1490197` |
+| `OFL-Outfit.txt`      | `c676351bf8576b9aba743cd5eaa8c0e7ee0d51f805d720447b4df4ddb6a2e416` |
+
+To update, re-download the four `.ttf` files from `fonts/ttf/` and the repository's
+`OFL.txt` (saved here as `OFL-Outfit.txt`), record the new commit SHA and hashes
+here, and re-check the PostScript names and `usWeightClass` in each file.
+
+# Tajawal (Arabic)
+
+Mandated for Arabic typography by the system design spec §7.

 - **Source:** https://github.com/google/fonts/tree/main/ofl/tajawal
 - **Retrieved at commit:** `7ff85c87f93ea6cca5f41c69f2e4edcb90240f26`
@@ -9,7 +41,6 @@ the app does not fetch font binaries from a mutable CDN ref at runtime.
 - **Licence:** SIL Open Font License 1.1 — full text in `OFL.txt`

 Weights vendored: Regular (400), Medium (500), Bold (700).
-Latin faces are not vendored; Latin text uses the system font.

 **Tajawal has no semibold.** The family ships 200, 300, 400, 500, 700, 800 and
 900 — there is no 600 — so the type scale's 600 tier is mapped to Bold in
```

```diff
--- a/apps/mobile/src/components/AppText.tsx
+++ b/apps/mobile/src/components/AppText.tsx
@@ -40,8 +40,9 @@ export function AppText({ variant = 'body', color, center, muted, style, ...rest
     // the way we want and is not subject to that swap. Verified in the
     // simulator; `text-direction.spec.ts` guards it.
     writingDirection: dir,
-    // The weight-specific Arabic family already encodes the weight; setting
-    // fontWeight on top of it makes iOS synthesize a heavier face.
+    // The weight-specific family (an Outfit or Tajawal cut) already encodes
+    // the weight; setting fontWeight on top of it makes iOS synthesize a
+    // heavier face.
     ...(fontFamily ? null : { fontWeight: token.fontWeight }),
     ...(token.fontVariant ? { fontVariant: token.fontVariant } : null),
     ...(center ? { textAlign: 'center' } : null),
```

```diff
--- a/apps/mobile/src/theme/index.ts
+++ b/apps/mobile/src/theme/index.ts
@@ -71,7 +71,7 @@ export type Shadow = ReturnType<typeof shadowFor>;

 /**
  * Typography scale. Arabic runs at a larger line-height than Latin per spec §7,
- * and the `fontFamily` itself (Tajawal) is resolved per locale and
+ * and the `fontFamily` itself (Outfit or Tajawal) is resolved per locale and
  * weight in `lib/fonts.ts` — text primitives call `resolveFontFamily` so nothing
  * here needs to know about font loading.
  */
```

- [ ] **Step 9: Run the gates, and check the native font list resolves**

```bash
pnpm --filter @kitchen/mobile exec vitest run src/lib/fonts.spec.ts
pnpm --filter @kitchen/mobile test
pnpm --filter @kitchen/mobile typecheck && pnpm --filter @kitchen/mobile lint
cd apps/mobile && npx expo config --type public --json | python3 -c "import json,os,sys; c=json.load(sys.stdin); f=[p for p in c['plugins'] if isinstance(p,list) and p[0]=='expo-font'][0][1]['fonts']; print(len(f), all(os.path.exists(x) for x in f))"; cd -
```

Expected:

- **10 passed (10)**
- the suite **54 files, 629 tests**
- typecheck and lint exit 0
- the config check prints `7 True`: four Outfit and three Tajawal paths, all present on disk

- [ ] **Step 10: Format and commit**

```bash
npx prettier --config packages/config/prettier.config.mjs --write apps/mobile/assets/fonts/README.md apps/mobile/src/lib/fonts.ts apps/mobile/src/lib/font-loader.ts apps/mobile/src/lib/fonts.spec.ts apps/mobile/src/components/AppText.tsx apps/mobile/src/theme/index.ts apps/mobile/app.json
git add apps/mobile/assets/fonts apps/mobile/src/lib/fonts.ts apps/mobile/src/lib/font-loader.ts apps/mobile/src/lib/fonts.spec.ts apps/mobile/src/components/AppText.tsx apps/mobile/src/theme/index.ts apps/mobile/app.json
git commit -m "feat(mobile): vendor Outfit as the Latin face" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Done when

- [ ] `pnpm --filter @kitchen/mobile test` reports **54 files, 629 tests**, and `typecheck` and
      `lint` exit 0.
- [ ] `pnpm --filter @kitchen/web typecheck && pnpm --filter @kitchen/web test` stay green. Web
      shares no code with these files; this only confirms the workspace.
- [ ] `git grep -nE "ThemeFamily|THEME_FAMILIES|DEFAULT_THEME_FAMILY|tintFor|palettes\.violet" -- apps/mobile`
      prints nothing.
- [ ] **Hand-off note for Plan 4:** `LiveAssistantScreen`'s composer is a bare `TextInput` that sets
      no `fontFamily`. It showed the system font for Arabic before this plan, and now does for Latin
      too. The composer is rebuilt in Plan 4 on `Field`'s font resolution; do not patch it here.
