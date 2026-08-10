# Device Compatibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Expo mobile app adapt gracefully to any screen size and honour the user's text-size preference, so it passes iPad review and does not clip text at large Dynamic Type sizes.

**Architecture:** Four independent changes, each expressed as a rule that phones already satisfy, so the phone rendering is provably unchanged. Layout and scaling decisions are extracted into pure functions tested in node; everything not expressible that way is pinned by a source-scanning guard test. Nothing is iPad-specific.

**Tech Stack:** Expo 57 / React Native 0.86, TypeScript, Vitest (node environment), `react-native-safe-area-context`.

Spec: `docs/superpowers/specs/2026-08-10-device-compatibility-design.md`.

## Global Constraints

- Mobile tests run in a **node** environment with **no render harness**. Do not add `react-native-testing-library` or any render dependency. Test pure functions and scan source.
- Mobile test files are `src/**/*.spec.ts` and must **not** live under `src/app/` — Expo Router bundles everything there into the shipped app, and a spec file there crashes the app at launch. A guard in `src/lib/store-policy.spec.ts` enforces this.
- Mobile imports carry **no** file extension (unlike the API, which uses `.js`).
- No physical-direction style keys (`marginLeft`, `left`, `borderRightColor`…). Use `marginStart`, `start`, logical keys. ESLint enforces this.
- Colour, radius, spacing and typography resolve from `src/theme/index.ts` only. Never hard-code a hex literal or a font size in a component.
- Arabic line-height factor is `1.7`, Latin `1.35`. Arabic letter-spacing is always `0`.
- Chrome variants (`button`, `label`, `caption`) cap font scaling at **`1.6`**. Content variants (`display`, `title`, `heading`, `body`, `bodyStrong`) are **uncapped**.
- Tablet breakpoint is **`700`**; max content width is **`640`**.
- Minimum touch target is **`44`**.
- Run the whole mobile suite with `pnpm --filter @kitchen/mobile exec vitest run`, and a single file with `pnpm --filter @kitchen/mobile exec vitest run <path>`.
- `turbo run build` must have produced `packages/*/dist` before tests. If a test fails to resolve `@kitchen/i18n`, run `pnpm build` first.
- Every guard test added by this plan must be verified to **fail** when the condition it describes is reintroduced, then restored. A guard that cannot fail is not a guard.

---

## File Structure

| File | Responsibility | Task |
| ---- | -------------- | ---- |
| `apps/mobile/src/theme/index.ts` | Modify: `typography()` becomes scale-aware; new `maxFontScaleFor()` | 1 |
| `apps/mobile/src/theme/typography.spec.ts` | Modify: add scaling cases alongside the existing tracking assertions | 1 |
| `apps/mobile/src/components/AppText.tsx` | Modify: read live `fontScale`, pass matching `maxFontSizeMultiplier` | 2 |
| `apps/mobile/src/app/recipe/[id]/cook.tsx` | Modify: remove the hard-coded `fontSize`/`lineHeight` that bypasses scaling | 2 |
| `apps/mobile/src/theme/token-usage.spec.ts` | Create: mobile source sweep — raw `lineHeight`, undersized touch targets | 2, 5 |
| `apps/mobile/src/theme/layout.ts` | Create: `TABLET_BREAKPOINT`, `MAX_CONTENT_WIDTH`, `contentMaxWidth()` | 3 |
| `apps/mobile/src/theme/layout.spec.ts` | Create: width→cap table including the Split View case | 3 |
| `apps/mobile/src/components/Screen.tsx` | Modify: constrain-and-centre, horizontal safe-area edges, keyboard avoidance | 3, 5 |
| `apps/mobile/app.json` | Modify: per-idiom iPad orientations | 4 |
| `apps/mobile/src/lib/store-policy.spec.ts` | Modify: guard the tablet/orientation contradiction | 4 |
| `apps/mobile/src/components/QuantityStepper.tsx` | Modify: 40 → 44 touch target | 5 |

`theme/layout.ts` is a new file rather than more surface on `theme/index.ts` because screen-size adaptation is a separate concern from design tokens, and `index.ts` is already the palette, radius, shadow and typography module.

---

### Task 1: Scale-aware typography

The core bug. React Native multiplies `fontSize` by the system font scale but leaves an explicitly-set absolute `lineHeight` alone, so today's `lineHeight` — computed from the *base* size — stays fixed while the glyphs grow, and the text clips. This task makes the line box a function of the scale. It is pure: no component changes, so nothing renders differently yet.

**Files:**
- Modify: `apps/mobile/src/theme/index.ts:104-138`
- Test: `apps/mobile/src/theme/typography.spec.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `typography(locale: Locale, fontScale?: number): Record<TypographyVariant, TextStyleToken>` — `fontScale` defaults to `1`.
  - `maxFontScaleFor(variant: TypographyVariant): number | undefined` — `1.6` for chrome, `undefined` for content.
  - Both exported from `src/theme/index.ts`. Task 2 imports both.

- [ ] **Step 1: Write the failing tests**

Append to `apps/mobile/src/theme/typography.spec.ts`. Leave the four existing tests exactly as they are — they call `typography('en')` with one argument, and the fact that they keep passing untouched is the proof that the new parameter is additive.

Change the import line at the top of the file to pull in the new function:

```ts
import { maxFontScaleFor, typography } from './index';
```

Then append:

```ts
describe('typography under font scaling', () => {
  it('is unchanged at the default scale', () => {
    // The regression guard for the entire device-compatibility change: a phone
    // at the default text size must render exactly as it did before scaling
    // existed. If this fails, the change is visible on every screen.
    expect(typography('en', 1)).toEqual(typography('en'));
    expect(typography('en').body.lineHeight).toBe(Math.round(16 * 1.35));
    expect(typography('ar').body.lineHeight).toBe(Math.round(16 * 1.7));
  });

  it('grows the line box with the text', () => {
    // React Native scales fontSize by the system font scale but does NOT scale
    // an absolute lineHeight, so the line box must be pre-multiplied here or
    // large text is clipped by a box sized for small text.
    expect(typography('en', 2).body.lineHeight).toBe(Math.round(16 * 2 * 1.35));
    expect(typography('en', 1.5).heading.lineHeight).toBe(Math.round(18 * 1.5 * 1.35));
  });

  it('caps chrome so pills and labels cannot explode', () => {
    // iOS reaches ~3.1x at the largest accessibility sizes. A button label at
    // 3.1x breaks every row in the app, so chrome stops at 1.6x.
    expect(typography('en', 3.1).button.lineHeight).toBe(Math.round(16 * 1.6 * 1.35));
    expect(typography('en', 3.1).label.lineHeight).toBe(Math.round(14 * 1.6 * 1.35));
    expect(typography('en', 3.1).caption.lineHeight).toBe(Math.round(12 * 1.6 * 1.35));
  });

  it('leaves content uncapped so long-form text honours the setting fully', () => {
    expect(typography('en', 3.1).body.lineHeight).toBe(Math.round(16 * 3.1 * 1.35));
    expect(typography('en', 3.1).display.lineHeight).toBe(Math.round(28 * 3.1 * 1.35));
  });

  it('keeps the Arabic factor at every scale', () => {
    expect(typography('ar', 2).body.lineHeight).toBe(Math.round(16 * 2 * 1.7));
    expect(typography('ar', 2).body.lineHeight).toBeGreaterThan(
      typography('en', 2).body.lineHeight,
    );
  });

  it('never letter-spaces Arabic at any scale', () => {
    for (const [variant, token] of Object.entries(typography('ar', 3.1))) {
      expect(token.letterSpacing, variant).toBe(0);
    }
  });

  it('shrinks the line box when the user reduces text size', () => {
    expect(typography('en', 0.85).body.lineHeight).toBe(Math.round(16 * 0.85 * 1.35));
  });
});

describe('maxFontScaleFor', () => {
  it('caps the chrome variants', () => {
    expect(maxFontScaleFor('button')).toBe(1.6);
    expect(maxFontScaleFor('label')).toBe(1.6);
    expect(maxFontScaleFor('caption')).toBe(1.6);
  });

  it('leaves the content variants uncapped', () => {
    // undefined rather than Infinity: this value is handed to React Native's
    // maxFontSizeMultiplier prop, which accepts null, 0, or a number >= 1.
    for (const variant of ['display', 'title', 'heading', 'body', 'bodyStrong'] as const) {
      expect(maxFontScaleFor(variant), variant).toBeUndefined();
    }
  });

  it('classifies every variant in the scale', () => {
    // Adding a variant without deciding whether it is chrome or content would
    // silently default it to uncapped. Fail here instead.
    expect(Object.keys(typography('en')).sort()).toEqual(
      ['body', 'bodyStrong', 'button', 'caption', 'display', 'heading', 'label', 'title'],
    );
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @kitchen/mobile exec vitest run src/theme/typography.spec.ts`

Expected: FAIL. The import of `maxFontScaleFor` does not resolve, so the whole file errors.

- [ ] **Step 3: Implement the scaling**

In `apps/mobile/src/theme/index.ts`, immediately after the `SCALE` constant and the `TypographyVariant` type, add the classification, then replace the body of `typography`:

```ts
export type TypographyVariant = keyof typeof SCALE;

/**
 * How far each tier may scale with the system font size.
 *
 * Chrome — pill buttons, field labels, badges — sits in fixed-height rows, so
 * it stops at 1.6x. Content is uncapped: at the largest accessibility sizes the
 * user has asked for very large text and long-form copy should give it to them.
 */
const CHROME_MAX_FONT_SCALE = 1.6;
const CHROME_VARIANTS: readonly TypographyVariant[] = ['button', 'label', 'caption'];

/**
 * Returned straight to React Native's `maxFontSizeMultiplier`, which accepts
 * `null`, `0`, or a number `>= 1` — hence `undefined` for uncapped rather than
 * a sentinel like `Infinity`, which that prop rejects.
 */
export function maxFontScaleFor(variant: TypographyVariant): number | undefined {
  return CHROME_VARIANTS.includes(variant) ? CHROME_MAX_FONT_SCALE : undefined;
}

export function typography(
  locale: Locale,
  fontScale = 1,
): Record<TypographyVariant, TextStyleToken> {
  const isArabic = locale === 'ar';
  const factor = isArabic ? ARABIC_LINE_HEIGHT : LATIN_LINE_HEIGHT;
  const out = {} as Record<TypographyVariant, TextStyleToken>;
  for (const key of Object.keys(SCALE) as TypographyVariant[]) {
    const entry = SCALE[key]!;
    const cap = maxFontScaleFor(key);
    // React Native scales `fontSize` itself, but not an absolute `lineHeight`,
    // so the line box is pre-multiplied by the same scale the text will get.
    const effectiveScale = Math.min(fontScale, cap ?? fontScale);
    out[key] = {
      fontSize: entry.fontSize,
      fontWeight: entry.fontWeight,
      lineHeight: Math.round(entry.fontSize * effectiveScale * factor),
      letterSpacing: isArabic ? 0 : entry.letterSpacing,
    };
  }
  return out;
}
```

`fontSize` deliberately stays at the base value: React Native applies the scale at render time. Only the line box is pre-multiplied here.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @kitchen/mobile exec vitest run src/theme/typography.spec.ts`
Expected: PASS, including the four pre-existing tracking tests, unmodified.

- [ ] **Step 5: Verify the guard has teeth**

Temporarily change `effectiveScale` to the constant `1`:

```ts
const effectiveScale = 1;
```

Run: `pnpm --filter @kitchen/mobile exec vitest run src/theme/typography.spec.ts`
Expected: FAIL — "grows the line box with the text" and the cap tests fail, while "is unchanged at the default scale" still passes.

Restore `const effectiveScale = Math.min(fontScale, cap ?? fontScale);` and re-run to confirm PASS.

- [ ] **Step 6: Typecheck and commit**

```bash
pnpm --filter @kitchen/mobile typecheck
git add apps/mobile/src/theme/index.ts apps/mobile/src/theme/typography.spec.ts
git commit -m "feat(mobile): scale line-height with the system font size"
```

---

### Task 2: Wire AppText to the live font scale

`AppText` is the only text primitive in the app, so this single file delivers Task 1's maths to every screen. It also fixes the one place that bypasses the type system entirely, and adds the guard that stops it happening again.

**Files:**
- Modify: `apps/mobile/src/components/AppText.tsx`
- Modify: `apps/mobile/src/app/recipe/[id]/cook.tsx:64`
- Create: `apps/mobile/src/theme/token-usage.spec.ts`

**Interfaces:**
- Consumes: `typography(locale, fontScale?)` and `maxFontScaleFor(variant)` from Task 1.
- Produces: nothing new for later tasks. Task 5 appends a second test to `token-usage.spec.ts`.

- [ ] **Step 1: Write the failing guard test**

Create `apps/mobile/src/theme/token-usage.spec.ts`:

```ts
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(__dirname, '..');

/**
 * Every TypeScript source file in the app except the tests themselves.
 */
function sourceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry) && !/\.spec\.tsx?$/.test(entry)) out.push(full);
    }
  };
  walk(SRC);
  return out;
}

/**
 * `theme/index.ts` computes the scaled line box; `AppText.tsx` is the single
 * primitive that applies it. Everywhere else, an absolute `lineHeight` opts
 * that text out of font scaling and clips it at large accessibility sizes.
 */
const LINE_HEIGHT_ALLOWED = [join('theme', 'index.ts'), join('components', 'AppText.tsx')];

describe('mobile source sweep', () => {
  it('never sets a raw lineHeight outside the theme', () => {
    const offenders = sourceFiles()
      .filter((file) => !LINE_HEIGHT_ALLOWED.some((allowed) => file.endsWith(allowed)))
      .filter((file) => /lineHeight\s*:/.test(readFileSync(file, 'utf8')))
      .map((file) => relative(SRC, file));

    expect(
      offenders,
      'An absolute lineHeight outside theme/index.ts bypasses the font-scale ' +
        'maths, so React Native grows the text but not the box that holds it ' +
        'and the text clips at large Dynamic Type sizes. Use a typography ' +
        `variant instead. Offending files: ${offenders.join(', ')}`,
    ).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails, and note what it catches**

Run: `pnpm --filter @kitchen/mobile exec vitest run src/theme/token-usage.spec.ts`

Expected: FAIL, listing `app/recipe/[id]/cook.tsx`. That file hard-codes `fontSize: 30, lineHeight: 44` on the cook-mode step text, so at 2× Dynamic Type React Native renders 60pt glyphs inside a 44pt line box. Cook mode is read at arm's length with busy hands, which makes it the worst screen in the app to have unscalable text.

- [ ] **Step 3: Fix cook mode to use the type scale**

In `apps/mobile/src/app/recipe/[id]/cook.tsx`, replace line 64:

```tsx
          <AppText variant="display" style={{ color: colors.textInverse }}>
```

The `display` variant is 28pt against the hard-coded 30pt — a 2pt reduction at the default text size that is not perceptible, in exchange for text that now scales all the way to the user's chosen size instead of clipping. Do not add a new variant for the 2pt.

- [ ] **Step 4: Run the guard to verify it passes**

Run: `pnpm --filter @kitchen/mobile exec vitest run src/theme/token-usage.spec.ts`
Expected: PASS.

- [ ] **Step 5: Wire AppText to the live scale**

In `apps/mobile/src/components/AppText.tsx`, change the import to pull in `useWindowDimensions` and `maxFontScaleFor`:

```tsx
import { Text, useWindowDimensions, type TextProps, type TextStyle } from 'react-native';
import {
  colors,
  maxFontScaleFor,
  typography,
  type ColorToken,
  type TypographyVariant,
} from '../theme';
```

Inside the component, read the live scale and use it:

```tsx
  const { locale } = useLocale();
  const { fontScale } = useWindowDimensions();
  const fontsLoaded = useFontStore((state) => state.loaded);
  const token = typography(locale, fontScale)[variant]!;
```

And set the matching cap on the rendered element. `{...rest}` stays last so a
caller can still override it deliberately:

```tsx
  return <Text style={[base, style]} maxFontSizeMultiplier={maxFontScaleFor(variant)} {...rest} />;
```

`useWindowDimensions` re-renders on change, so the app responds live when the user changes their text size in Settings without a relaunch.

- [ ] **Step 6: Run the full mobile suite**

Run: `pnpm --filter @kitchen/mobile exec vitest run`
Expected: PASS. No existing test asserts on `AppText`'s rendered output, so nothing should break.

- [ ] **Step 7: Verify the guard has teeth**

Re-add the hard-coded style to `cook.tsx` line 64:

```tsx
          <AppText variant="display" style={{ color: colors.textInverse, fontSize: 30, lineHeight: 44 }}>
```

Run: `pnpm --filter @kitchen/mobile exec vitest run src/theme/token-usage.spec.ts`
Expected: FAIL, naming `app/recipe/[id]/cook.tsx`.

Restore the fixed version from Step 3 and re-run to confirm PASS.

- [ ] **Step 8: Typecheck, lint and commit**

```bash
pnpm --filter @kitchen/mobile typecheck && pnpm --filter @kitchen/mobile lint
git add apps/mobile/src/components/AppText.tsx apps/mobile/src/app/recipe/ apps/mobile/src/theme/token-usage.spec.ts
git commit -m "feat(mobile): honour the system font scale in AppText"
```

---

### Task 3: Constrain and centre content on large screens

Without this, an iPad renders the phone layout stretched edge to edge and lines of text run the full width of a 13-inch screen. The rule keys off the live window width, not the device, so iPad landscape, Split View, Slide Over and Stage Manager resizing are all the same case.

**Files:**
- Create: `apps/mobile/src/theme/layout.ts`
- Create: `apps/mobile/src/theme/layout.spec.ts`
- Modify: `apps/mobile/src/components/Screen.tsx`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `contentMaxWidth(width: number): number | undefined`, plus `TABLET_BREAKPOINT = 700` and `MAX_CONTENT_WIDTH = 640`, exported from `src/theme/layout.ts`. Task 5 modifies the same `Screen.tsx` but does not use these values.

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/src/theme/layout.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { MAX_CONTENT_WIDTH, TABLET_BREAKPOINT, contentMaxWidth } from './layout';

describe('contentMaxWidth', () => {
  it('runs full bleed on every phone', () => {
    expect(contentMaxWidth(320)).toBeUndefined();
    expect(contentMaxWidth(390)).toBeUndefined();
    expect(contentMaxWidth(440)).toBeUndefined();
  });

  it('caps the measure on a tablet in either orientation', () => {
    expect(contentMaxWidth(834)).toBe(MAX_CONTENT_WIDTH); // iPad portrait
    expect(contentMaxWidth(1194)).toBe(MAX_CONTENT_WIDTH); // iPad landscape
    expect(contentMaxWidth(1032)).toBe(MAX_CONTENT_WIDTH); // 13-inch portrait
  });

  it('treats a narrow split-view pane as a phone', () => {
    // The rule keys off the window, not the device. A 507pt Split View pane on
    // an iPad must render exactly like a phone, and a resized Stage Manager
    // window must re-evaluate as it is dragged.
    expect(contentMaxWidth(507)).toBeUndefined();
  });

  it('pins the breakpoint boundary', () => {
    expect(contentMaxWidth(TABLET_BREAKPOINT - 1)).toBeUndefined();
    expect(contentMaxWidth(TABLET_BREAKPOINT)).toBe(MAX_CONTENT_WIDTH);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @kitchen/mobile exec vitest run src/theme/layout.spec.ts`
Expected: FAIL — cannot resolve `./layout`.

- [ ] **Step 3: Implement the layout module**

Create `apps/mobile/src/theme/layout.ts`:

```ts
/**
 * Screen-size adaptation.
 *
 * Every decision here keys off the live window width rather than the device,
 * so iPad portrait, iPad landscape, Split View, Slide Over and Stage Manager
 * resizing are all the same case — a window narrower than the breakpoint
 * renders exactly like a phone, with no device checks anywhere.
 */

/** Below this the app is phone-shaped and runs full bleed. */
export const TABLET_BREAKPOINT = 700;

/** A comfortable measure. Wider than this and the eye loses the line. */
export const MAX_CONTENT_WIDTH = 640;

/**
 * The cap to apply to a screen's content, or `undefined` for full bleed.
 */
export function contentMaxWidth(width: number): number | undefined {
  return width >= TABLET_BREAKPOINT ? MAX_CONTENT_WIDTH : undefined;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @kitchen/mobile exec vitest run src/theme/layout.spec.ts`
Expected: PASS.

- [ ] **Step 5: Apply the cap in Screen**

Rewrite `apps/mobile/src/components/Screen.tsx` so the constraint applies to the content in both the scrolling and non-scrolling branches, and horizontal safe-area edges are included:

```tsx
import type { ReactNode } from 'react';
import {
  ScrollView,
  View,
  useWindowDimensions,
  type ViewStyle,
  RefreshControl,
} from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { colors, spacing } from '../theme';
import { contentMaxWidth } from '../theme/layout';

export interface ScreenProps {
  children: ReactNode;
  scroll?: boolean;
  padded?: boolean;
  edges?: readonly Edge[];
  style?: ViewStyle;
  contentStyle?: ViewStyle;
  refreshing?: boolean;
  onRefresh?: () => void;
  footer?: ReactNode;
}

/**
 * Page container: applies safe-area insets, the app background, optional
 * scrolling with pull-to-refresh, and — on screens wider than a phone — caps
 * and centres the content so an iPad does not stretch a phone layout across
 * thirteen inches. Keeps every screen visually consistent.
 */
export function Screen({
  children,
  scroll,
  padded = true,
  edges = ['top', 'bottom', 'left', 'right'],
  style,
  contentStyle,
  refreshing,
  onRefresh,
  footer,
}: ScreenProps) {
  const { width } = useWindowDimensions();
  const maxWidth = contentMaxWidth(width);
  const pad: ViewStyle = padded ? { padding: spacing.lg, gap: spacing.md } : {};
  // `undefined` below the breakpoint leaves the phone layout untouched.
  const constrain: ViewStyle = maxWidth ? { maxWidth, width: '100%', alignSelf: 'center' } : {};
  return (
    <SafeAreaView edges={edges} style={[{ flex: 1, backgroundColor: colors.bg }, style]}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={[pad, { flexGrow: 1 }, constrain, contentStyle]}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} /> : undefined
          }
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1 }, pad, constrain, contentStyle]}>{children}</View>
      )}
      {footer ? (
        <View style={[{ padding: spacing.lg, paddingTop: spacing.sm }, constrain]}>{footer}</View>
      ) : null}
    </SafeAreaView>
  );
}
```

`'left'` and `'right'` are added to the default edges because a rotated iPad has horizontal insets. On a portrait phone those insets are `0`, so this is invisible there.

- [ ] **Step 6: Run the full mobile suite**

Run: `pnpm --filter @kitchen/mobile exec vitest run`
Expected: PASS.

- [ ] **Step 7: Verify the constraint has teeth**

Temporarily force the cap on:

```tsx
  const maxWidth = 640;
```

Run: `pnpm --filter @kitchen/mobile exec vitest run src/theme/layout.spec.ts`
Expected: still PASS — the pure function is untouched, which correctly shows the unit test cannot see the wiring. This is why Task 6 exists. Note this in the report, restore `const maxWidth = contentMaxWidth(width);`, and confirm the suite passes.

- [ ] **Step 8: Typecheck, lint and commit**

```bash
pnpm --filter @kitchen/mobile typecheck && pnpm --filter @kitchen/mobile lint
git add apps/mobile/src/theme/layout.ts apps/mobile/src/theme/layout.spec.ts apps/mobile/src/components/Screen.tsx
git commit -m "feat(mobile): cap and centre content above the tablet breakpoint"
```

---

### Task 4: Let the iPad rotate

`app.json` currently declares `"supportsTablet": true` while locking `"orientation": "portrait"` — the app tells Apple it is an iPad app and then refuses to rotate. iPad review exercises rotation.

**Files:**
- Modify: `apps/mobile/app.json`
- Test: `apps/mobile/src/lib/store-policy.spec.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Write the failing test**

Append to `apps/mobile/src/lib/store-policy.spec.ts`. `APP_JSON` and the `node:fs` imports already exist at the top of that file — reuse them, do not redeclare.

```ts
/**
 * Device compatibility, as promised to the App Store.
 *
 * Declaring `supportsTablet` while locking the app to portrait is a rejection
 * risk: iPad review rotates the device. The two settings are therefore pinned
 * together — whichever one a future change touches, this fails until the other
 * agrees with it.
 */
describe('device compatibility policy', () => {
  const config = JSON.parse(readFileSync(APP_JSON, 'utf8')) as {
    expo: {
      orientation?: string;
      ios?: { supportsTablet?: boolean; infoPlist?: Record<string, unknown> };
    };
  };

  it('claims iPad support', () => {
    expect(config.expo.ios?.supportsTablet).toBe(true);
  });

  it('keeps phones portrait', () => {
    // Phones stay portrait deliberately: there are no landscape phone layouts.
    expect(config.expo.orientation).toBe('portrait');
  });

  it('lets the iPad rotate, because it claims iPad support', () => {
    const reason =
      'app.json sets ios.supportsTablet: true, so the App Store treats this as ' +
      'an iPad app and review will rotate the device. iOS reads the ~ipad ' +
      'variant only on iPad, which is what keeps phones portrait while letting ' +
      'the iPad turn. Without both landscape entries the app is portrait-locked ' +
      'on iPad and can be rejected.';
    const ipad = config.expo.ios?.infoPlist?.['UISupportedInterfaceOrientations~ipad'];
    expect(ipad, reason).toEqual([
      'UIInterfaceOrientationPortrait',
      'UIInterfaceOrientationPortraitUpsideDown',
      'UIInterfaceOrientationLandscapeLeft',
      'UIInterfaceOrientationLandscapeRight',
    ]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @kitchen/mobile exec vitest run src/lib/store-policy.spec.ts`
Expected: FAIL on "lets the iPad rotate" — the key is `undefined`. The other two pass, which confirms they describe the current state.

- [ ] **Step 3: Add the per-idiom orientations**

In `apps/mobile/app.json`, inside `expo.ios.infoPlist`, add the key alongside the existing `NSCameraUsageDescription` and `UIApplicationSceneManifest` entries. Leave `expo.orientation` set to `"portrait"` — that is what pins iPhone and Android phones.

```json
      "infoPlist": {
        "NSCameraUsageDescription": "Kitchen AI uses the camera to recognise ingredients in your kitchen.",
        "NSPhotoLibraryUsageDescription": "Kitchen AI reads photos of your kitchen to build your inventory.",
        "UISupportedInterfaceOrientations~ipad": [
          "UIInterfaceOrientationPortrait",
          "UIInterfaceOrientationPortraitUpsideDown",
          "UIInterfaceOrientationLandscapeLeft",
          "UIInterfaceOrientationLandscapeRight"
        ],
        "UIApplicationSceneManifest": {
```

Do not add an Android equivalent. Android has no per-idiom manifest attribute; from API 36 it ignores orientation restrictions on large screens, which produces the same phone-portrait / tablet-rotating split without configuration.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @kitchen/mobile exec vitest run src/lib/store-policy.spec.ts`
Expected: PASS.

- [ ] **Step 5: Verify the guard has teeth**

Temporarily remove the two landscape entries from the array in `app.json`, leaving only the two portrait ones.

Run: `pnpm --filter @kitchen/mobile exec vitest run src/lib/store-policy.spec.ts`
Expected: FAIL on "lets the iPad rotate", printing the rejection-risk explanation.

Restore all four entries and re-run to confirm PASS.

- [ ] **Step 6: Rebuild the native project so the change takes effect**

The orientation lives in `Info.plist`, which is generated from `app.json`, so a JS reload will not pick it up. Task 6 rebuilds once for all native changes; note here that a rebuild is required.

```bash
git add apps/mobile/app.json apps/mobile/src/lib/store-policy.spec.ts
git commit -m "fix(mobile): let the iPad rotate instead of claiming tablet support and locking portrait"
```

---

### Task 5: Touch targets and keyboard avoidance

Two independent usability defects: a control below the platform minimum touch target, and no keyboard avoidance anywhere in the app.

**Files:**
- Modify: `apps/mobile/src/components/QuantityStepper.tsx:32-34`
- Modify: `apps/mobile/src/components/Screen.tsx`
- Modify: `apps/mobile/src/theme/token-usage.spec.ts`

**Interfaces:**
- Consumes: the `sourceFiles()` helper and the `describe('mobile source sweep')` block created in Task 2; the `Screen` component as rewritten in Task 3.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Write the failing test**

Append inside the existing `describe('mobile source sweep', ...)` block in `apps/mobile/src/theme/token-usage.spec.ts`:

```ts
  /**
   * Apple requires a 44pt minimum touch target and Android 48dp. A regex sweep
   * over every file produces false positives — hairline dividers legitimately
   * set `height: 1`, and `shadowOffset` contains its own `height` — so each
   * interactive control is named with the property that carries its touch
   * dimension. Adding a control means adding a line here, which is the point:
   * it forces the size to be a decision rather than an accident.
   */
  const TOUCH_TARGETS: Record<string, RegExp> = {
    'Button.tsx': /minHeight:\s*(\d+)/,
    'Fab.tsx': /height:\s*(\d+)/,
    'Field.tsx': /minHeight:\s*(\d+)/,
    'Header.tsx': /minHeight:\s*(\d+)/,
    'QuantityStepper.tsx': /height:\s*(\d+)/,
    'StarRating.tsx': /minHeight:\s*(\d+)/,
  };

  it('keeps every interactive control at or above the 44pt minimum', () => {
    for (const [file, pattern] of Object.entries(TOUCH_TARGETS)) {
      const content = readFileSync(join(SRC, 'components', file), 'utf8');
      const match = content.match(pattern);
      expect(
        match,
        `${file} no longer declares the touch dimension this guard tracks. If ` +
          'the control was restyled, update the pattern; do not delete the entry.',
      ).not.toBeNull();
      expect(
        Number(match![1]),
        `${file} renders a touch target below the 44pt minimum Apple requires ` +
          '(Android asks for 48dp). Small targets are a rejection risk and a ' +
          'real barrier for anyone with a motor impairment.',
      ).toBeGreaterThanOrEqual(44);
    }
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @kitchen/mobile exec vitest run src/theme/token-usage.spec.ts`
Expected: FAIL — `QuantityStepper.tsx` reports `40`.

- [ ] **Step 3: Enlarge the stepper**

In `apps/mobile/src/components/QuantityStepper.tsx`, change the button's fixed size:

```tsx
      style={{
        width: 44,
        height: 44,
```

Leave the `minWidth: 40` on the value `AppText` alone — it is a text measure, not a touch target.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @kitchen/mobile exec vitest run src/theme/token-usage.spec.ts`
Expected: PASS.

- [ ] **Step 5: Add keyboard avoidance to Screen**

In `apps/mobile/src/components/Screen.tsx`, import the two extra symbols:

```tsx
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  View,
  useWindowDimensions,
  type ViewStyle,
  RefreshControl,
} from 'react-native';
```

Wrap the existing content — both branches and the footer — in a `KeyboardAvoidingView` inside the `SafeAreaView`:

```tsx
  return (
    <SafeAreaView edges={edges} style={[{ flex: 1, backgroundColor: colors.bg }, style]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        // Expo sets Android's softwareKeyboardLayoutMode to "resize", so Android
        // already shrinks the window for the keyboard. Adding a behavior on top
        // of that double-adjusts and pushes content off-screen.
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {scroll ? (
          <ScrollView
            contentContainerStyle={[pad, { flexGrow: 1 }, constrain, contentStyle]}
            keyboardShouldPersistTaps="handled"
            refreshControl={
              onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} /> : undefined
            }
          >
            {children}
          </ScrollView>
        ) : (
          <View style={[{ flex: 1 }, pad, constrain, contentStyle]}>{children}</View>
        )}
        {footer ? (
          <View style={[{ padding: spacing.lg, paddingTop: spacing.sm }, constrain]}>{footer}</View>
        ) : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
```

This is the change with the most interaction risk in the plan: combined with `SafeAreaView`'s bottom inset, `padding` behaviour can double-pad and leave a gap above the keyboard. Task 6 checks it visually on the sign-in form.

- [ ] **Step 6: Run the full mobile suite**

Run: `pnpm --filter @kitchen/mobile exec vitest run`
Expected: PASS.

- [ ] **Step 7: Verify the guard has teeth**

Set the stepper back to `width: 40, height: 40`.

Run: `pnpm --filter @kitchen/mobile exec vitest run src/theme/token-usage.spec.ts`
Expected: FAIL, naming `QuantityStepper.tsx` and the 44pt minimum.

Restore `44` and re-run to confirm PASS.

- [ ] **Step 8: Typecheck, lint and commit**

```bash
pnpm --filter @kitchen/mobile typecheck && pnpm --filter @kitchen/mobile lint
git add apps/mobile/src/components/QuantityStepper.tsx apps/mobile/src/components/Screen.tsx apps/mobile/src/theme/token-usage.spec.ts
git commit -m "fix(mobile): meet the 44pt touch minimum and avoid the keyboard"
```

---

### Task 6: Verify on simulators

Tests cannot see clipping, double-padding, or a stretched tablet layout. Task 3 Step 7 demonstrates the gap directly: the pure function passes whether or not `Screen` is wired to it. This task is where the work is actually proven, and it is the step most likely to find a real defect.

**Files:**
- No source files by default. Any defect found here is fixed in the file that owns it, with a test added if the failure was expressible as one.

**Interfaces:**
- Consumes: every change from Tasks 1–5.
- Produces: a verification record in the task report.

- [ ] **Step 1: Rebuild the native app**

`app.json` changed in Task 4, so `Info.plist` must be regenerated — a Metro reload is not enough.

```bash
cd apps/mobile
export DEVELOPER_DIR=/Users/aomr/Downloads/Xcode-beta.app/Contents/Developer
npx expo prebuild --platform ios --clean
xcodebuild -workspace ios/KitchenAI.xcworkspace -scheme KitchenAI \
  -configuration Debug -sdk iphonesimulator \
  -derivedDataPath ios/build CODE_SIGNING_ALLOWED=NO build
```

Xcode 27 beta lives in `~/Downloads`, not `/Applications`, and `xcode-select` points at CommandLineTools, so `DEVELOPER_DIR` must be exported for every `xcodebuild`, `xcrun` and `simctl` call. `expo run:ios` is broken against Xcode 27 — build with `xcodebuild` and install manually.

- [ ] **Step 2: Install and launch on each device**

Metro serves the JS, so start it once (`pnpm --filter @kitchen/mobile start`) and reuse it. For each device below:

```bash
export DEVELOPER_DIR=/Users/aomr/Downloads/Xcode-beta.app/Contents/Developer
xcrun simctl boot <UDID>
xcrun simctl install <UDID> ios/build/Build/Products/Debug-iphonesimulator/KitchenAI.app
xcrun simctl launch <UDID> com.kitchenai.app
xcrun simctl io <UDID> screenshot /tmp/<name>.png
```

| Device | UDID | Checks |
| ------ | ---- | ------ |
| iPhone 17e | `92B42615-5C2B-4607-BE3B-1CB82BA9594F` | Smallest available phone. Layout unchanged from before this work. |
| iPhone 17 Pro Max | `F926F79D-E4D3-471A-A629-F8FE574C83D8` | Layout unchanged. |
| iPad mini (A17 Pro) | `E1129CE3-3ACE-475A-8F51-425531EA6811` | 744pt portrait — just above the 700 breakpoint, so the cap engages. |
| iPad Pro 13-inch (M5) | `3CAEE3EA-564E-4380-8F21-03656C230493` | Largest screen. Content centred, not stretched. |

There is no iPhone SE in this Xcode's simulator set; iPhone 17e is the smallest available.

- [ ] **Step 3: Check the four things tests cannot see**

On each device, capture a screenshot and confirm:

1. **Phones are unchanged.** Compare the two iPhones against the pre-change appearance. Any visible difference on a phone at the default text size is a defect — the `fontScale: 1` test asserts this should be impossible.
2. **iPad centres rather than stretches.** Content sits in a 640pt column with the background either side, in both orientations. Rotate with `xcrun simctl ui <UDID> orientation landscape` — if it stays portrait, Task 4 did not take effect and the app needs a clean rebuild.
3. **Large text does not clip.** Raise the text size to the maximum accessibility setting via Settings → Accessibility → Display & Text Size → Larger Text. Check `home`, a recipe, and **cook mode** specifically, since that screen was the one bypassing the type scale. Text must reflow, not overlap or truncate. Text that looks wildly over-spaced instead means the line box is being double-scaled and Task 1's premise is wrong for this RN version — report it rather than patching around it.
4. **The keyboard does not cover the field.** Focus the password field on sign-in on the smallest phone. The field stays visible, and there is no dead gap between content and keyboard (that gap is the `SafeAreaView` + `KeyboardAvoidingView` double-padding risk from Task 5).

- [ ] **Step 4: Repeat the large-text and iPad checks in Arabic**

Switch the app to Arabic and repeat checks 2 and 3. Arabic uses the 1.7 line-height factor, so clipping shows up there first, and RTL mirroring must survive the centred layout — the column stays centred and the text stays right-aligned.

- [ ] **Step 5: Record the result**

Report, for each of the four devices: pass or fail per check, with a screenshot path for anything that failed. If everything passes, say so explicitly. Do not create a markdown file for this; it belongs in the task report.

- [ ] **Step 6: Commit any fixes**

If Step 3 or 4 found nothing, there is nothing to commit and the task is complete. If a defect was found, fix it in the owning file, add a test if the failure can be expressed as one, and commit:

```bash
git add <files>
git commit -m "fix(mobile): <what the simulator check found>"
```

---

## Self-Review

**Spec coverage**

| Spec section | Task |
| ------------ | ---- |
| §4.1 orientation configuration | 4 |
| §4.2 typography scaling | 1 (maths), 2 (wiring) |
| §4.3 fluid layout | 3 |
| §4.4 touch targets and keyboard | 5 |
| §5.1 pure function tests | 1, 3 |
| §5.2 guard tests | 2 (lineHeight), 4 (orientation), 5 (touch targets) |
| §5.3 visual verification | 6 |
| §5.4 existing tests preserved | 1 Step 1 keeps all four tracking tests unmodified |

**Deviation from the spec, deliberate:**

- §5.4 states `theme/typography.spec.ts` "must be updated for the new signature". It does not: `fontScale` has a default of `1`, so every existing call compiles and returns identical values. Leaving those four tests untouched is stronger evidence of additivity than editing them, so the plan keeps them as they are and adds new cases alongside. The spec sentence is now inaccurate and is corrected in the same commit as this plan.
- §4.4 specifies `height` as the Android `KeyboardAvoidingView` behaviour. The plan uses `undefined` on Android instead, because Expo defaults `android.softwareKeyboardLayoutMode` to `"resize"`, so Android already shrinks the window; adding `height` on top double-adjusts. iOS keeps `padding` as specified. The spec is corrected to match.

**Discovered during planning, added to scope:** `app/recipe/[id]/cook.tsx:64` hard-codes `fontSize: 30, lineHeight: 44`, a live instance of the exact bug this project fixes, on the screen where large text matters most. Fixed in Task 2 Step 3.

**Placeholder scan:** no TBD, TODO, "handle edge cases", or "similar to Task N". Every code step carries the actual code.

**Type consistency:** `typography(locale, fontScale?)`, `maxFontScaleFor(variant)`, `contentMaxWidth(width)`, `TABLET_BREAKPOINT`, `MAX_CONTENT_WIDTH` are named identically in the tasks that define them (1, 3) and the tasks that consume them (2, 3, 5). `token-usage.spec.ts` is created in Task 2 and appended to in Task 5, sharing the `sourceFiles()` helper and the `describe` block.
