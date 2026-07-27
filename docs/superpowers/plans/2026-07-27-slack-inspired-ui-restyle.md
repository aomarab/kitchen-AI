# Slack-inspired UI Restyle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle `apps/web` and `apps/mobile` to a single Slack-inspired visual language — aubergine on cream, pill buttons, 4px fields, status colour decoupled from brand — without changing layout, markup structure, or component APIs.

**Architecture:** Colour, radius and tracking all resolve from two token files (`apps/web/src/app/globals.css`, `apps/mobile/src/theme/index.ts`). Components consume tokens by name only. Two automated guards make the palette self-enforcing: a contrast test that parses the token files and asserts WCAG ratios, and a source sweep that fails if a component reaches for a fill colour where it needs a text colour.

**Tech Stack:** Next.js 15 + Tailwind CSS v4.3.3 (`@theme inline` custom tokens) on web; Expo React Native with a plain TypeScript token module on mobile. Vitest on both (`jsdom` for web, `node` for mobile).

**Spec:** `docs/superpowers/specs/2026-07-27-slack-inspired-ui-design.md` (commits `89d519e`, `2c0927c`).

## Global Constraints

- **This is a restyle, not a redesign.** No layout changes, no new screens, no navigation restructure, no component API changes, no mobile dark theme.
- **No test may be modified to make it pass.** No test in either app asserts a class name and there are no snapshots. The 29 web and 68 mobile tests must stay green untouched. If one breaks, it found a real regression.
- **Every colour lives in a token file.** No hex literal may be introduced into any `.tsx`/`.ts` outside `apps/web/src/app/globals.css` and `apps/mobile/src/theme/index.ts`. Two exceptions, both enforced by name in Task 4's guard: the Google logo SVG in `OAuthButtons` is a third-party brand asset, and `app/layout.tsx` sets Next's `themeColor`, which is serialised into a `<meta>` tag and cannot read a CSS variable.
- **`text-primary` is reserved for fills and focus rings.** Aubergine that renders text or an icon uses `text-primary-text`. `--primary` `#8a4d90` measures 2.00–3.21:1 as text in dark mode.
- **Tinted backgrounds are solid `*-soft` tokens, never opacity utilities.** Tailwind v4 compiles `/8` to `color-mix(in oklab, … 8%, transparent)`, so an opacity tint is not the sRGB blend contrast maths assumes. This binds every brand and status colour — `primary`, `success`, `warning`, `danger` — which is exactly what Task 4's guard matches. `Badge`'s `info` tone is the one deliberate exception: `bg-foreground/10` under `text-foreground` derives both halves from the same token, so the tint is always a 10% wash of the very colour standing on it and cannot drift. Measured, it is the most legible chip in the set at 13.76:1 on a light card, 11.94:1 on light canvas, 10.83:1 on a dark card and 12.72:1 on dark canvas.
- **Latin typographic devices stay on Latin.** Tracking is delivered through `--track-*` variables that `:root:lang(ar)` sets to `0`. Never hard-code a `letter-spacing` value on an element. Two pre-existing `tracking-[0.3em]` sites are exempt and stay: `settings/HouseholdView.tsx:27` displays the six-character invite code and `auth/HouseholdSetup.tsx:72` is the input that accepts it. Both render an alphanumeric code rather than prose, so their content is never Arabic script and the fixed tracking is correct in both locales.
- **Arabic keeps 1.85 line-height; Latin moves to 1.55.**
- **Run commands from the repo root** unless a step says otherwise. Web dev server is on port **3100** (`WEB_PORT`) — port 3000 is taken on this machine.

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `apps/web/src/lib/contrast.ts` | **New.** WCAG ratio maths + a reader for `globals.css` tokens. Pure, no React. | 1 |
| `apps/web/src/app/palette.test.ts` | **New.** Asserts the light and dark palettes satisfy the contrast contract. | 1 |
| `apps/web/src/app/globals.css` | Single source of web colour, tracking and leading. | 1, 5 |
| `apps/mobile/src/theme/contrast.ts` | **New.** Same maths, imported by the mobile theme specs. | 2 |
| `apps/mobile/src/theme/palette.spec.ts` | **New.** Asserts the mobile palette. | 2 |
| `apps/mobile/src/theme/typography.spec.ts` | **New.** Asserts Latin tracking and that Arabic gets none. | 6 |
| `apps/mobile/src/theme/index.ts` | Single source of mobile colour, radius and typography. | 2, 6 |
| `apps/mobile/src/components/AppText.tsx` | The only text primitive; applies the scale. | 6 |
| `apps/web/src/components/ui/{Button,Input,Badge,IconButton}.tsx` | Web primitives. | 3 |
| `apps/web/src/app/(auth)/layout.tsx` | Auth canvas + the app's one lifted surface. | 3, 5 |
| `apps/web/src/lib/token-usage.test.ts` | **New.** Source sweep: no `text-primary`, no opacity tints. | 4 |
| ~30 web component files | Semantic corrections. | 4 |
| `apps/web/src/components/shell/AppShell.tsx`, `app/layout.tsx` | Canvas + `theme-color` metas. | 5 |
| `apps/mobile/src/components/{Button,Field}.tsx`, `app/recipe/[id]/cook.tsx` | Mobile primitives + cook mode. | 6 |

The two contrast helpers are deliberately duplicated rather than shared. They are ~25 lines of standard arithmetic; the apps share no UI code today, mobile's Vitest runs in a `node` environment that cannot resolve web's `@/` alias, and `packages/config` is tooling-only (tsconfig/eslint/prettier, no `src`, no build). A new shared runtime package would cost more than the duplication removes.

---

### Task 1: Web colour tokens and the contrast guard

The palette is worthless if nothing checks it. This task builds the check first, watches it fail against today's colours, then lands the colours that satisfy it.

**Files:**
- Create: `apps/web/src/lib/contrast.ts`
- Create: `apps/web/src/app/palette.test.ts`
- Modify: `apps/web/src/app/globals.css` (whole file)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `contrast(a: string, b: string): number`, `luminance(hex: string): number`, `channels(hex: string): [number, number, number]`, `readTokens(css: string, theme: Theme): Record<string, string>`, `type Theme = 'light' | 'dark'` — all exported from `apps/web/src/lib/contrast.ts`. Task 2 mirrors these signatures in `apps/mobile/src/theme/contrast.ts`. Tasks 3–5 rely on the CSS custom properties this task defines: `--canvas`, `--canvas-lavender`, `--background`, `--foreground`, `--muted`, `--muted-foreground`, `--border`, `--primary`, `--primary-press`, `--primary-foreground`, `--primary-soft`, `--primary-text`, `--link`, `--success`, `--success-soft`, `--warning`, `--warning-soft`, `--danger`, `--danger-soft`, `--danger-foreground`, and the `--track-*` family.

- [ ] **Step 1: Write the contrast helper**

Create `apps/web/src/lib/contrast.ts`:

```ts
/**
 * WCAG 2.1 relative-luminance contrast, plus a reader for the design tokens in
 * `app/globals.css`.
 *
 * The CSS stays the single source of truth: nothing here restates a colour
 * value, so the palette test cannot drift from what actually ships.
 */

export type Theme = 'light' | 'dark';

/** Splits `#rgb` or `#rrggbb` into 0-255 channels. */
export function channels(hex: string): [number, number, number] {
  const raw = hex.trim().replace('#', '');
  const full = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw;
  if (!/^[0-9a-f]{6}$/i.test(full)) throw new Error(`not a hex colour: ${hex}`);
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
  return [r!, g!, b!];
}

function linearise(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map(linearise);
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

/** WCAG contrast ratio, 1 (identical) to 21 (black on white). Order-independent. */
export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

const LIGHT_BLOCK = /:root\s*\{([^}]*)\}/;
const DARK_BLOCK = /prefers-color-scheme:\s*dark\s*\)\s*\{\s*:root\s*\{([^}]*)\}/;

/**
 * Pulls the hex custom properties out of one theme block. Non-colour
 * declarations in the same block (`line-height`, the `--track-*` family) are
 * skipped by the hex pattern. `:root:lang(ar)` cannot match either block
 * because both require `{` to follow `:root` directly.
 */
export function readTokens(css: string, theme: Theme): Record<string, string> {
  const block = (theme === 'light' ? LIGHT_BLOCK : DARK_BLOCK).exec(css);
  if (!block?.[1]) throw new Error(`no ${theme} :root block found in globals.css`);
  const tokens: Record<string, string> = {};
  for (const match of block[1].matchAll(/--([a-z-]+):\s*(#[0-9a-f]{3,8})\s*;/gi)) {
    tokens[match[1]!] = match[2]!;
  }
  return tokens;
}
```

- [ ] **Step 2: Write the palette test**

Create `apps/web/src/app/palette.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { contrast, readTokens, type Theme } from '../lib/contrast';

const CSS = readFileSync(fileURLToPath(new URL('./globals.css', import.meta.url)), 'utf8');

/** Surfaces a text colour can legitimately land on. Dark has no lavender. */
const SURFACES: Record<Theme, readonly string[]> = {
  light: ['canvas', 'canvas-lavender', 'background', 'muted'],
  dark: ['canvas', 'background', 'muted'],
};

const STATUSES = ['success', 'warning', 'danger'] as const;

const AA_TEXT = 4.5;
const AA_NON_TEXT = 3;

describe.each(['light', 'dark'] as const)('%s palette', (theme) => {
  const tokens = readTokens(CSS, theme);

  const value = (name: string): string => {
    const hex = tokens[name];
    if (!hex) throw new Error(`--${name} is not defined in the ${theme} palette`);
    return hex;
  };

  const ratio = (fg: string, bg: string): number => contrast(value(fg), value(bg));

  it.each(['foreground', 'muted-foreground', 'link'])('--%s reads on every surface', (fg) => {
    for (const bg of SURFACES[theme]) {
      expect(ratio(fg, bg), `--${fg} on --${bg}`).toBeGreaterThanOrEqual(AA_TEXT);
    }
  });

  it('button fills carry readable labels', () => {
    expect(ratio('primary-foreground', 'primary'), 'primary').toBeGreaterThanOrEqual(AA_TEXT);
    expect(ratio('primary-foreground', 'primary-press'), 'primary pressed').toBeGreaterThanOrEqual(AA_TEXT);
    expect(ratio('danger-foreground', 'danger'), 'danger').toBeGreaterThanOrEqual(AA_TEXT);
  });

  it.each(STATUSES)('--%s reads on its own soft chip', (status) => {
    expect(ratio(status, `${status}-soft`), `--${status} on --${status}-soft`).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it.each(STATUSES)('--%s separates as a chip border', (status) => {
    for (const bg of ['canvas', 'background']) {
      expect(ratio(status, bg), `--${status} border on --${bg}`).toBeGreaterThanOrEqual(AA_NON_TEXT);
    }
  });

  it('aubergine-as-text reads wherever it is used', () => {
    for (const bg of ['primary-soft', 'background', 'canvas']) {
      expect(ratio('primary-text', bg), `--primary-text on --${bg}`).toBeGreaterThanOrEqual(AA_TEXT);
    }
  });
});

describe('contrast harness', () => {
  it('matches the WCAG reference extremes', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 4);
    expect(contrast('#ffffff', '#ffffff')).toBeCloseTo(1, 4);
  });

  it('detects the amber-on-amber warning badge that shipped for months', () => {
    // `Badge tone="warning"` was `bg-accent/20 text-accent` — #e8a33d text on
    // #e8a33d at 20% over white, which composites to #faedd8. It measured
    // 1.87:1 against a 4.5:1 minimum and nothing was watching. Pinned here so
    // the harness itself is proven to catch the class of defect it guards.
    expect(contrast('#e8a33d', '#faedd8')).toBeLessThan(AA_TEXT);
  });
});
```

- [ ] **Step 3: Run the test against today's palette to watch it fail**

```bash
pnpm --filter @kitchen/web test -- --run src/app/palette.test.ts
```

Expected: **FAIL.** The `contrast harness` block passes (21.0000, 1.0000, 1.87). Every `light palette` and `dark palette` case throws `--canvas is not defined in the light palette` and similar, because today's `globals.css` defines only `background`, `foreground`, `muted`, `muted-foreground`, `border`, `primary`, `primary-foreground`, `accent`, `danger`.

Do not proceed until you have seen this fail. That is the proof the guard is wired up.

- [ ] **Step 4: Replace the token file**

Overwrite `apps/web/src/app/globals.css`:

```css
@import 'tailwindcss';

:root {
  --canvas: #f4ede4;
  --canvas-lavender: #f9f0ff;
  --background: #ffffff;
  --foreground: #1d1d1d;
  --muted: #f2f2f2;
  --muted-foreground: #696969;
  --border: #e6e6e6;
  --primary: #4a154b;
  --primary-press: #611f69;
  --primary-foreground: #ffffff;
  --primary-soft: #ede8ed;
  --primary-text: #4a154b;
  --link: #1264a3;
  --success: #007a5a;
  --success-soft: #ebf4f2;
  --warning: #8a5300;
  --warning-soft: #f3eee6;
  --danger: #bf3a10;
  --danger-soft: #faefec;
  --danger-foreground: #ffffff;

  /* Latin letter-spacing. Arabic is cursive — letter-spacing forces gaps into
     the joins — so :root:lang(ar) resets each of these to zero and every
     `tracking-*` utility follows automatically, with no per-element rules.
     Only the tiers the app actually renders are defined: web tops out at 24px,
     so there is no display tier, and there is no caption component. */
  --track-heading-lg: -0.096px;
  --track-heading-sm: -0.02px;
  --track-button: 0.2px;

  line-height: 1.55;
}

@media (prefers-color-scheme: dark) {
  :root {
    --canvas: #140e15;
    /* Same as --canvas on purpose: a lifted plum canvas puts the #221a24 card
       at 1.05:1 and the card disappears. Lavender is a light-mode device. */
    --canvas-lavender: #140e15;
    --background: #221a24;
    --foreground: #f0e9f1;
    --muted: #2c2230;
    --muted-foreground: #a99dab;
    --border: #3a2d3d;
    --primary: #8a4d90;
    --primary-press: #7a4380;
    --primary-foreground: #f0e9f1;
    --primary-soft: #403343;
    /* --primary as *text* on a card is 2.86:1, so aubergine text lifts here. */
    --primary-text: #c9a3ce;
    --link: #7cb3e8;
    --success: #3fbd95;
    --success-soft: #273738;
    --warning: #e0a94a;
    --warning-soft: #44342b;
    --danger: #ef7a63;
    --danger-soft: #472b2f;
    /* White on this salmon is 2.31:1, so destructive labels go dark. */
    --danger-foreground: #221a24;
  }
}

@theme inline {
  --color-canvas: var(--canvas);
  --color-canvas-lavender: var(--canvas-lavender);
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-border: var(--border);
  --color-primary: var(--primary);
  --color-primary-press: var(--primary-press);
  --color-primary-foreground: var(--primary-foreground);
  --color-primary-soft: var(--primary-soft);
  --color-primary-text: var(--primary-text);
  --color-link: var(--link);
  --color-success: var(--success);
  --color-success-soft: var(--success-soft);
  --color-warning: var(--warning);
  --color-warning-soft: var(--warning-soft);
  --color-danger: var(--danger);
  --color-danger-soft: var(--danger-soft);
  --color-danger-foreground: var(--danger-foreground);

  --tracking-heading-lg: var(--track-heading-lg);
  --tracking-heading-sm: var(--track-heading-sm);
  --tracking-button: var(--track-button);

  --font-sans: var(--font-latin), var(--font-arabic), system-ui, sans-serif;
}

/* Arabic needs more leading than Latin at the same size, and no tracking.
   `:root:lang(ar)` outranks the `:root` defaults above on specificity. */
:root:lang(ar) {
  --font-sans: var(--font-arabic), system-ui, sans-serif;
  line-height: 1.85;
  --track-heading-lg: 0;
  --track-heading-sm: 0;
  --track-button: 0;
}

body {
  font-family: var(--font-sans);
}

/* Direction-implying glyphs mirror in RTL. Applied via <DirectionalIcon>. */
[dir='rtl'] .dir-flip {
  transform: scaleX(-1);
}
```

Note `--accent` is gone. The build will still pass — Tailwind emits no `.text-accent` rule and the class becomes inert — but the five components that still reference it look wrong until Tasks 3 and 4. That is expected and is why the route sweep is Task 7.

- [ ] **Step 5: Run the palette test to verify it passes**

```bash
pnpm --filter @kitchen/web test -- --run src/app/palette.test.ts
```

Expected: **PASS**, 51 colour pairs across the two themes plus the two harness cases.

- [ ] **Step 6: Run the whole web suite**

```bash
pnpm --filter @kitchen/web test -- --run
```

Expected: PASS. 29 pre-existing tests plus the new file. If any pre-existing test fails, stop — no test asserts a class name, so a failure here is a real regression.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/contrast.ts apps/web/src/app/palette.test.ts apps/web/src/app/globals.css
git commit -m "feat(web): adopt the aubergine-on-cream palette behind a contrast guard

Replaces the green-on-white tokens with the Slack-inspired palette and adds a
test that parses globals.css and asserts 51 colour pairs across both themes.
The guard was run against the old palette first and failed, which is the proof
it is wired up.

Two tokens exist only because dark mode diverges: --primary-text, because the
aubergine fill measures 2.86:1 as text on a dark card, and --danger-foreground,
because white on the dark salmon fill measures 2.31:1."
```

---

### Task 2: Mobile colour tokens and contrast guard

**Files:**
- Create: `apps/mobile/src/theme/contrast.ts`
- Create: `apps/mobile/src/theme/palette.spec.ts`
- Modify: `apps/mobile/src/theme/index.ts:10-30` (the `colors` object)

**Interfaces:**
- Consumes: nothing. Mirrors Task 1's maths but reads the `colors` object directly — mobile tokens are TypeScript, so there is nothing to parse.
- Produces: `contrast(a, b)` and `luminance(hex)` from `apps/mobile/src/theme/contrast.ts`; new `colors` keys `surfaceInverse` and `textInverseMuted` consumed by Task 6.

- [ ] **Step 1: Write the mobile contrast helper**

Create `apps/mobile/src/theme/contrast.ts`:

```ts
/**
 * WCAG 2.1 contrast, for the palette spec next door.
 *
 * Deliberately a copy of the web helper rather than a shared package: this is
 * standard arithmetic, the apps share no UI code, and mobile's Vitest runs in a
 * node environment that cannot resolve web's module aliases.
 */

function channels(hex: string): [number, number, number] {
  const raw = hex.trim().replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(raw)) throw new Error(`not a hex colour: ${hex}`);
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(raw.slice(i, i + 2), 16));
  return [r!, g!, b!];
}

function linearise(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map(linearise);
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
```

- [ ] **Step 2: Write the mobile palette spec**

Create `apps/mobile/src/theme/palette.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { colors } from './index';
import { contrast } from './contrast';

const AA_TEXT = 4.5;
const AA_NON_TEXT = 3;

/** Every surface a text colour can land on. Mobile has no dark theme. */
const SURFACES = ['bg', 'surface', 'surfaceAlt'] as const;

const STATUSES = ['success', 'warn', 'danger'] as const;

describe('mobile palette', () => {
  it.each(['text', 'textMuted'] as const)('%s reads on every surface', (token) => {
    for (const surface of SURFACES) {
      expect(contrast(colors[token], colors[surface]), `${token} on ${surface}`).toBeGreaterThanOrEqual(AA_TEXT);
    }
  });

  it('accent reads on every surface', () => {
    for (const surface of SURFACES) {
      expect(contrast(colors.accent, colors[surface]), `accent on ${surface}`).toBeGreaterThanOrEqual(AA_TEXT);
    }
  });

  it('button fills carry readable labels', () => {
    expect(contrast(colors.textInverse, colors.primary), 'primary').toBeGreaterThanOrEqual(AA_TEXT);
    expect(contrast(colors.textInverse, colors.primaryPressed), 'primary pressed').toBeGreaterThanOrEqual(AA_TEXT);
    expect(contrast(colors.textInverse, colors.danger), 'danger').toBeGreaterThanOrEqual(AA_TEXT);
  });

  it.each(STATUSES)('%s reads on its own soft chip', (status) => {
    const soft = `${status}Soft` as const;
    expect(contrast(colors[status], colors[soft]), `${status} on ${soft}`).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it.each(STATUSES)('%s separates as a chip border', (status) => {
    for (const surface of ['bg', 'surface'] as const) {
      expect(contrast(colors[status], colors[surface]), `${status} on ${surface}`).toBeGreaterThanOrEqual(AA_NON_TEXT);
    }
  });

  it('primary reads as text on its own soft chip', () => {
    expect(contrast(colors.primary, colors.primarySoft)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it('cook mode inverts legibly', () => {
    expect(contrast(colors.textInverse, colors.surfaceInverse), 'primary').toBeGreaterThanOrEqual(AA_TEXT);
    expect(contrast(colors.textInverseMuted, colors.surfaceInverse), 'muted').toBeGreaterThanOrEqual(AA_TEXT);
  });

  /**
   * Cook mode is the one screen that inverts, and it hosts buttons. The
   * light-mode `primary` is 1.20:1 on `surfaceInverse` — the CTA fill
   * disappears and the ghost label is unreadable. These three pairs are what
   * the `primaryInverse` / `ghostInverse` variants must satisfy.
   */
  it('cook mode buttons separate from the inverted surface', () => {
    expect(contrast(colors.primaryInverse, colors.surfaceInverse), 'ghostInverse label').toBeGreaterThanOrEqual(AA_TEXT);
    expect(contrast(colors.primaryInverse, colors.surfaceInverse), 'primaryInverse fill').toBeGreaterThanOrEqual(AA_NON_TEXT);
    expect(contrast(colors.text, colors.primaryInverse), 'primaryInverse label').toBeGreaterThanOrEqual(AA_TEXT);
  });
});
```

- [ ] **Step 3: Run it against today's palette to watch it fail**

```bash
pnpm --filter @kitchen/mobile test -- --run src/theme/palette.spec.ts
```

Expected: **FAIL**, with six problems. `cook mode inverts legibly` throws `not a hex colour: undefined` because `colors.surfaceInverse` and `colors.textInverseMuted` do not exist yet. The other five are real contrast defects in today's palette:

| Pair | Today | Minimum |
|---|---|---|
| `warn` on `warnSoft` | **2.74:1** | 4.5 |
| `primary` on `primarySoft` | 3.59:1 | 4.5 |
| `textMuted` on `surfaceAlt` | 4.23:1 | 4.5 |
| `textInverse` on `primary` | 4.46:1 | 4.5 |
| `danger` on `dangerSoft` | 4.47:1 | 4.5 |

`warn` on `warnSoft` at 2.74:1 is mobile's own version of the web amber-badge defect, and like it, has been shipping unnoticed.

- [ ] **Step 4: Replace the mobile colours**

In `apps/mobile/src/theme/index.ts`, replace the `colors` object (lines 10-30):

```ts
export const colors = {
  bg: '#F4EDE4',
  surface: '#FFFFFF',
  surfaceAlt: '#F9F0FF',
  border: '#E6E6E6',
  text: '#1D1D1D',
  textMuted: '#696969',
  textInverse: '#FFFFFF',
  primary: '#4A154B',
  primaryPressed: '#611F69',
  primarySoft: '#EDE8ED',
  // Cook mode inverts the screen, and #4A154B on #1D1D1D is 1.20:1 — the CTA
  // fill vanishes and the ghost label is unreadable. This is the same lifted
  // aubergine the web dark theme uses for --primary-text, and it measures
  // 7.72:1 on surfaceInverse both as text and as a fill carrying a dark label.
  primaryInverse: '#C9A3CE',
  accent: '#1264A3',
  accentSoft: '#E3EDF6',
  warn: '#8A5300',
  warnSoft: '#F3EEE6',
  danger: '#BF3A10',
  dangerSoft: '#FAEFEC',
  success: '#007A5A',
  successSoft: '#EBF4F2',
  /** Cook mode runs inverted. Named so the intent survives a palette change. */
  surfaceInverse: '#1D1D1D',
  textInverseMuted: '#C7C7C7',
  overlay: 'rgba(26,14,27,0.45)',
} as const;
```

- [ ] **Step 5: Run the spec to verify it passes**

```bash
pnpm --filter @kitchen/mobile test -- --run src/theme/palette.spec.ts
```

Expected: **PASS.**

- [ ] **Step 6: Run the whole mobile suite**

```bash
pnpm --filter @kitchen/mobile test -- --run
```

Expected: PASS, 68 pre-existing tests plus the new file.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/src/theme/contrast.ts apps/mobile/src/theme/palette.spec.ts apps/mobile/src/theme/index.ts
git commit -m "feat(mobile): adopt the aubergine-on-cream palette behind a contrast guard

Moves mobile from terracotta-on-cream to the same tokens as web, and adds the
matching contrast spec. Run against the old palette first, it failed on the
green accent at 4.20:1 on white.

Adds surfaceInverse and textInverseMuted so cook mode can stop reading surface
tokens as text colours (fixed in a later commit)."
```

---

### Task 3: Web primitives

Pill buttons, 4px fields, bordered status chips, and the app's one lifted surface.

**Files:**
- Modify: `apps/web/src/components/ui/Button.tsx:7-19,34`
- Modify: `apps/web/src/components/ui/Input.tsx:4-5`
- Modify: `apps/web/src/components/ui/Badge.tsx:6-12,22`
- Modify: `apps/web/src/components/ui/IconButton.tsx` (the `rounded-lg` in the class list)
- Modify: `apps/web/src/app/(auth)/layout.tsx:8`

**Interfaces:**
- Consumes: the colour and `--track-*` tokens from Task 1.
- Produces: no signature changes. `buttonClasses({ variant, size, block, className })`, `Button`, `Input`, `Select`, `Field`, `Badge`, `IconButton` all keep their exact current props. Task 4 relies on `Badge`'s `Tone` union staying `'neutral' | 'success' | 'warning' | 'danger' | 'info'`.

- [ ] **Step 1: Make buttons pills**

In `apps/web/src/components/ui/Button.tsx`, replace `VARIANTS`, `SIZES`, and the base class string:

```tsx
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-primary text-primary-foreground hover:bg-primary-press',
  secondary: 'bg-canvas-lavender text-foreground hover:bg-muted',
  ghost: 'bg-transparent text-foreground hover:bg-muted',
  danger: 'bg-danger text-danger-foreground hover:opacity-90',
  outline: 'border-2 border-primary-text bg-transparent text-primary-text hover:bg-primary-soft',
};

const SIZES: Record<Size, string> = {
  sm: 'h-8 px-4 text-[13px] gap-1.5',
  md: 'h-10 px-5 text-sm gap-2',
  lg: 'h-12 px-7 text-base gap-2',
};
```

and in `buttonClasses()` change the first argument to `cn(`:

```tsx
    'inline-flex items-center justify-center rounded-full font-bold tracking-button transition',
```

`rounded-lg` → `rounded-full`, `font-medium` → `font-bold`, and `tracking-button` resolves to `0.2px` under `:lang(en)` and `0` under `:lang(ar)`. `outline` uses `border-primary-text`, not `border-primary`, because the fill colour is only 2.86:1 as text in dark mode.

- [ ] **Step 2: Sharpen the fields**

In `apps/web/src/components/ui/Input.tsx`, change `FIELD_BASE`'s radius from `rounded-lg` to `rounded` (8px → 4px):

```tsx
const FIELD_BASE =
  'h-10 w-full rounded border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary';
```

- [ ] **Step 3: Give badges solid tints and status borders**

Replace `TONES` and the class list in `apps/web/src/components/ui/Badge.tsx`:

```tsx
const TONES: Record<Tone, string> = {
  neutral: 'bg-muted text-muted-foreground border-border',
  success: 'bg-success-soft text-success border-success',
  warning: 'bg-warning-soft text-warning border-warning',
  danger: 'bg-danger-soft text-danger border-danger',
  info: 'bg-foreground/10 text-foreground border-transparent',
};
```

```tsx
        'inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium',
```

A light tint cannot be both legible under its own text and distinguishable from every surface it lands on, so status chips carry a 1px border in the solid status colour. `info` stays a neutral `foreground/10` — both halves derive from the same token so it cannot drift — and takes a transparent border to keep every badge the same size.

- [ ] **Step 4: Round the icon button**

In `apps/web/src/components/ui/IconButton.tsx`, change `rounded-lg` to `rounded-full` in the class list.

- [ ] **Step 5: Lift the auth card**

In `apps/web/src/app/(auth)/layout.tsx:8`, change the card's `shadow-sm` to the spec's level-1 shadow:

```tsx
        <div className="w-full max-w-md rounded-2xl border border-border bg-background p-6 shadow-[0_5px_20px_rgba(0,0,0,0.1)] sm:p-8">
```

Leave the `bg-muted/40` on line 5 alone; Task 5 changes it.

- [ ] **Step 6: Run the web suite**

```bash
pnpm --filter @kitchen/web test -- --run
```

Expected: PASS. `states.test.tsx`, `AppShell.test.tsx`, `ReviewList.test.tsx`, `ItemSheet.test.tsx`, `PantryRailView.test.tsx` and `AuthGate.test.tsx` all render these primitives and none assert a class name.

- [ ] **Step 7: Typecheck and lint**

```bash
pnpm --filter @kitchen/web typecheck && pnpm --filter @kitchen/web lint
```

Expected: PASS. Lint reports exactly one pre-existing warning — `shell/PantryRail.tsx:54`, a `useMemo` missing-dependency unrelated to the restyle. It is present at this task's base commit and is not this task's to fix; the gate is that no NEW warning appears.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/components/ui apps/web/src/app/\(auth\)/layout.tsx
git commit -m "feat(web): pill buttons, 4px fields, bordered status chips

Buttons go rounded-full at 700 with Latin-only tracking and a pressed colour
instead of hover:opacity-90. Fields go 8px -> 4px; sharp fields against round
buttons is most of what makes the language read as Slack.

Badges move off opacity tints onto solid *-soft tokens with a 1px border in
the matching status colour. This fixes tone=\"warning\", which was amber on
pale amber at 1.87:1, and decouples tone=\"success\" from the brand colour."
```

---

### Task 4: Web semantic corrections

Thirty-odd sites where a component names the brand but means a status, or reaches for an opacity tint. Every `text-primary` that renders text is a dark-mode contrast failure: `--primary` `#8a4d90` measures 2.00:1 on `--primary-soft`, 2.57:1 on `--muted`, 2.86:1 on `--background`, 3.21:1 on `--canvas`.

**Files:**
- Create: `apps/web/src/lib/token-usage.test.ts`
- Modify: `apps/web/src/components/shell/Sidebar.tsx:26,29`
- Modify: `apps/web/src/components/shell/PantryRailView.tsx:59,79,87,137`
- Modify: `apps/web/src/components/dashboard/DashboardView.tsx:54,115,168`
- Modify: `apps/web/src/components/kitchen/ReviewList.tsx:134`
- Modify: `apps/web/src/components/kitchen/KitchenView.tsx:129`
- Modify: `apps/web/src/components/kitchen/CaptureFlow.tsx:58,137`
- Modify: `apps/web/src/components/recipe/RecipeView.tsx:67,69,127`
- Modify: `apps/web/src/components/recipe/RecipesIndex.tsx:34`
- Modify: `apps/web/src/components/plans/PlanDetail.tsx:81,95,220`
- Modify: `apps/web/src/components/plans/PlansIndex.tsx:46`
- Modify: `apps/web/src/components/plans/GeneratePlanForm.tsx:97`
- Modify: `apps/web/src/components/settings/SettingsView.tsx:130,208`
- Modify: `apps/web/src/components/settings/HouseholdView.tsx:40`
- Modify: `apps/web/src/components/ui/states.tsx:47`
- Modify: `apps/web/src/components/auth/SignInForm.tsx:56`
- Modify: `apps/web/src/components/auth/SignUpForm.tsx:72`

**Interfaces:**
- Consumes: the tokens from Task 1 and the `Badge` tones from Task 3.
- Produces: no exports. The guard test it adds constrains every later task and any future component.

- [ ] **Step 1: Write the usage guard**

Contrast tests check the palette; they cannot see a component reaching for the wrong token. Create `apps/web/src/lib/token-usage.test.ts`:

```ts
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = fileURLToPath(new URL('..', import.meta.url));

/**
 * `text-primary` on a native checkbox sets `color`, which native checkboxes
 * ignore. It renders nothing today and would render nothing if changed, so the
 * two occurrences stay. Allowed by exact line rather than by filename, so a
 * genuine offender elsewhere in the same file is still caught.
 */
const INERT_CHECKBOX =
  'className="h-5 w-5 rounded border-border text-primary focus-visible:ring-2 focus-visible:ring-primary"';

/**
 * `layout.tsx` sets Next's `themeColor`, which is serialised into a <meta> tag
 * and cannot read a CSS variable. `OAuthButtons.tsx` draws the Google mark,
 * which is a third-party brand asset, not a theme colour.
 */
const HEX_ALLOWED = ['app/layout.tsx', 'components/auth/OAuthButtons.tsx'];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(entry) && !/\.(test|spec)\.tsx?$/.test(entry) ? [full] : [];
  });
}

const FILES = sourceFiles(SRC).map((full) => ({
  path: full.slice(SRC.length),
  lines: readFileSync(full, 'utf8').split('\n'),
}));

/** Every `path:line` matching `pattern`, minus lines `allow` accepts. */
function offenders(pattern: RegExp, allow: (line: string) => boolean = () => false): string[] {
  return FILES.flatMap((file) =>
    file.lines.flatMap((line, i) =>
      pattern.test(line) && !allow(line.trim()) ? [`${file.path}:${i + 1}`] : [],
    ),
  );
}

describe('token usage', () => {
  it('never uses the aubergine fill as a text colour', () => {
    // --primary is a fill. As text it measures 2.00:1 on --primary-soft and
    // 2.86:1 on a dark card. Aubergine text uses --primary-text, which lifts
    // to #c9a3ce in dark mode.
    expect(offenders(/\btext-primary\b(?!-)/, (line) => line === INERT_CHECKBOX)).toEqual([]);
  });

  it('never tints a surface with an opacity utility', () => {
    // Tailwind v4 compiles `/12` to color-mix(in oklab, ...), which is not the
    // sRGB blend the contrast maths assumes. Tints are solid *-soft tokens, so
    // the measured number is the shipped number.
    expect(offenders(/\b(?:bg|border)-(?:primary|success|warning|danger)\/\d+/)).toEqual([]);
  });

  it('keeps colour in the token file', () => {
    const withHex = FILES.filter(
      (file) =>
        !HEX_ALLOWED.includes(file.path) &&
        file.lines.some((line) => /#[0-9a-fA-F]{6}\b/.test(line)),
    ).map((file) => file.path);
    expect(withHex).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the guard to watch it fail**

```bash
pnpm --filter @kitchen/web test -- --run src/lib/token-usage.test.ts
```

Expected: **FAIL** on the first two cases, listing exact line numbers:

- `never uses the aubergine fill as a text colour` — **17** offenders. `ui/Badge.tsx:8` is among them; Task 3 already fixed it if you are running these in order, in which case expect 16.
- `never tints a surface with an opacity utility` — **19** offenders, from `components/kitchen/CaptureFlow.tsx:58` through `components/ui/states.tsx:47`. `ui/Badge.tsx:8` and `:10` are in this list for the same reason.
- `keeps colour in the token file` — **PASS** already. It is here to stop new hex creeping in during the edits below.

- [ ] **Step 3: Apply the three mechanical rules**

Every edit below follows one of: aubergine that renders text or an icon → `text-primary-text`; opacity tint behind text → the solid `*-soft` token; opacity border → the solid token.

| File:line | Replace | With |
|---|---|---|
| `shell/Sidebar.tsx:26` | `'bg-primary/12 text-primary'` | `'bg-primary-soft text-primary-text'` |
| `shell/Sidebar.tsx:29` | `active && 'text-primary'` | `active && 'text-primary-text'` |
| `shell/PantryRailView.tsx:59` | `className="h-4 w-4 text-accent"` | `className="h-4 w-4 text-primary-text"` |
| `shell/PantryRailView.tsx:79` | `className="h-4 w-4 text-primary"` | `className="h-4 w-4 text-primary-text"` |
| `shell/PantryRailView.tsx:87` | `className="h-4 w-4 text-accent"` | `className="h-4 w-4 text-primary-text"` |
| `shell/PantryRailView.tsx:137` | `tone === 'success' ? 'bg-primary/5' : 'bg-accent/10',` | `tone === 'success' ? 'border border-success bg-success-soft' : 'border border-warning bg-warning-soft',` |
| `dashboard/DashboardView.tsx:54` | `className="h-5 w-5 text-accent"` | `className="h-5 w-5 text-primary-text"` |
| `dashboard/DashboardView.tsx:115` | `className="h-5 w-5 text-accent"` | `className="h-5 w-5 text-warning"` |
| `dashboard/DashboardView.tsx:168` | `className="text-primary"` | `className="text-primary-text"` |
| `kitchen/ReviewList.tsx:134` | `low ? 'border-accent/50 bg-accent/5' : undefined` | `low ? 'border-warning bg-warning-soft' : undefined` |
| `kitchen/KitchenView.tsx:129` | `'border-primary bg-primary/12 text-primary'` | `'border-primary-text bg-primary-soft text-primary-text'` |
| `kitchen/CaptureFlow.tsx:58` | `bg-primary/15 text-primary` | `bg-primary-soft text-primary-text` |
| `kitchen/CaptureFlow.tsx:137` | `border border-primary bg-primary/12 ... text-primary` | `border border-primary-text bg-primary-soft ... text-primary-text` |
| `recipe/RecipeView.tsx:67` | `border-primary/40 bg-primary/5` | `border-primary-text bg-primary-soft` |
| `recipe/RecipeView.tsx:69` | `font-medium text-primary` | `font-medium text-primary-text` |
| `recipe/RecipeView.tsx:127` | `bg-primary/15 text-xs font-semibold text-primary` | `bg-primary-soft text-xs font-semibold text-primary-text` |
| `recipe/RecipesIndex.tsx:34` | `hover:border-primary/50` | `hover:border-primary-text` |
| `plans/PlanDetail.tsx:81` | `'border-primary bg-primary/12 text-primary'` | `'border-primary-text bg-primary-soft text-primary-text'` |
| `plans/PlanDetail.tsx:95` | `hover:border-primary/50` | `hover:border-primary-text` |
| `plans/PlanDetail.tsx:220` | `'border-primary/40 bg-primary/10 font-medium text-primary hover:bg-primary/20'` | `'border-primary-text bg-primary-soft font-medium text-primary-text'` |
| `plans/PlansIndex.tsx:46` | `hover:border-primary/50` | `hover:border-primary-text` |
| `plans/GeneratePlanForm.tsx:97` | `border border-primary bg-primary/12 ... text-primary` | `border border-primary-text bg-primary-soft ... text-primary-text` |
| `settings/SettingsView.tsx:130` | `bg-danger/10 px-3 py-1 text-sm text-danger` | `border border-danger bg-danger-soft px-3 py-1 text-sm text-danger` |
| `settings/SettingsView.tsx:208` | `'border-primary bg-primary/12 text-primary'` | `'border-primary-text bg-primary-soft text-primary-text'` |
| `settings/HouseholdView.tsx:40` | `bg-primary/15 font-semibold text-primary` | `bg-primary-soft font-semibold text-primary-text` |
| `ui/states.tsx:47` | `border-danger/40 bg-danger/5` | `border-danger bg-danger-soft` |
| `auth/SignInForm.tsx:56` | `font-medium text-primary` | `font-medium text-link` |
| `auth/SignUpForm.tsx:72` | `font-medium text-primary` | `font-medium text-link` |

`PlanDetail.tsx:220` drops its `hover:bg-primary/20` rather than replacing it: the chip is already at `bg-primary-soft` when active, and there is no second tint to move to. The two auth links take `--link` rather than `--primary-text`; they are the app's only inline text links, and this gives `--link` its only home rather than leaving it defined and unused.

Leave `ui/Sheet.tsx:44` and `shell/AppShell.tsx:41` (`bg-foreground/40`) alone — those are modal scrims, deliberate translucency over arbitrary page content, not tints behind text. The guard's regex only covers `primary|success|warning|danger`, so it will not flag them.

- [ ] **Step 4: Run the guard to verify it passes**

```bash
pnpm --filter @kitchen/web test -- --run src/lib/token-usage.test.ts
```

Expected: **PASS**, all three cases.

- [ ] **Step 5: Run the whole web suite**

```bash
pnpm --filter @kitchen/web test -- --run
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src
git commit -m "fix(web): use status tokens for status, and --primary-text for text

Thirty-odd sites named the brand but meant a status, or reached for an opacity
tint. Every text-primary that renders actual text was a dark-mode failure:
--primary #8a4d90 measures 2.00:1 on --primary-soft, 2.57:1 on --muted,
2.86:1 on --background and 3.21:1 on --canvas.

Adds a source-sweep guard so the pattern cannot come back. Contrast tests check
the palette but cannot see a component reaching for the wrong token, which is
exactly how these were missed the first time round."
```

---

### Task 5: Web shell and typography

**Files:**
- Modify: `apps/web/src/components/shell/AppShell.tsx:26`
- Modify: `apps/web/src/app/(auth)/layout.tsx:5`
- Modify: `apps/web/src/app/layout.tsx:22-27`
- Modify: 14 heading sites listed below

**Interfaces:**
- Consumes: `--canvas`, `--canvas-lavender` and the `tracking-*` utilities from Task 1.
- Produces: nothing exported.

- [ ] **Step 1: Turn the canvas cream**

`apps/web/src/components/shell/AppShell.tsx:26`:

```tsx
    <div className="flex min-h-screen bg-canvas">
```

`apps/web/src/app/(auth)/layout.tsx:5`:

```tsx
    <div className="flex min-h-screen flex-col bg-canvas-lavender">
```

Cards already use `bg-background` (white), so every card lifts off the new canvas with no further change.

- [ ] **Step 2: Fix the browser chrome colour**

`apps/web/src/app/layout.tsx:22-27`. These are the only hardcoded colours in the web app outside `globals.css`, and would leave a white notch above a cream page in mobile Safari:

```tsx
export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f4ede4' },
    { media: '(prefers-color-scheme: dark)', color: '#140e15' },
  ],
};
```

- [ ] **Step 3: Add heading tracking**

Add one `tracking-*` class per heading. `text-2xl` (24px) takes `tracking-heading-lg`; `text-xl` (20px) and `text-lg` (18px) take `tracking-heading-sm`. Each resolves to `0` under `:lang(ar)`.

| File:line | Add to className |
|---|---|
| `components/auth/SignInForm.tsx:28` | `tracking-heading-lg` |
| `components/auth/SignUpForm.tsx:32` | `tracking-heading-lg` |
| `components/auth/HouseholdSetup.tsx:28` | `tracking-heading-lg` |
| `components/recipe/RecipeView.tsx:52` | `tracking-heading-lg` |
| `components/dashboard/DashboardView.tsx:43` | `tracking-heading-lg` |
| `components/plans/PlanDetailContainer.tsx:25` | `tracking-heading-sm` |
| `components/plans/EntrySheet.tsx:47` | `tracking-heading-sm` |
| `components/kitchen/ItemSheet.tsx:60` | `tracking-heading-sm` |
| `components/ui/Card.tsx:18` (`CardTitle`) | `tracking-heading-sm` |
| `components/ui/Sheet.tsx:56` | `tracking-heading-sm` |
| `components/shell/AppShell.tsx:60` | `tracking-heading-sm` |
| `components/recipe/CookMode.tsx:23` | `tracking-heading-sm` |
| `components/dashboard/DashboardView.tsx:72` | `tracking-heading-sm` |
| `components/kitchen/ReviewList.tsx:119` | `tracking-heading-sm` |

For example `apps/web/src/components/ui/Card.tsx:18` becomes:

```tsx
  return <h2 className={cn('text-lg font-semibold tracking-heading-sm', className)} {...props} />;
}
```

Three `text-lg`/`text-2xl` sites are deliberately skipped because they are not headings: `settings/HouseholdView.tsx:27` is the invite code and carries its own intentional `tracking-[0.3em]`; `recipe/RecipeView.tsx:182` is a stat value; `recipe/CookMode.tsx:36` is a cooking step, which is body copy at a large size.

- [ ] **Step 3b: Keep the Latin device off user-generated content**

`CardTitle` is shared, so tracking it reaches all sixteen call sites. Fifteen render `t(...)` — translated UI strings, which follow the UI locale, so `:root:lang(ar)` zeroes them correctly. One does not.

`settings/HouseholdView.tsx:23` renders `{household.name}`, free text the user typed. A household can be named in Arabic while the UI locale stays English, and `:root:lang(ar)` keys off the UI locale, not the content — so that title would keep its Latin tracking. Opt it out:

```tsx
          <CardTitle className="tracking-normal">{household.name}</CardTitle>
```

`cn()` is a naive joiner, not `tailwind-merge`, so this override depends on CSS source order rather than class order. Verified by compiling: Tailwind emits `.tracking-normal` after `.tracking-heading-sm`, so it wins, and `--tracking-normal: 0em` survives our `@theme inline` from the default theme. The override is deterministic, not incidental.

The practical effect here is small — `--track-heading-sm` is `-0.02px`, which tightens rather than opening gaps in cursive joins — but the rule is that a Latin typographic device never lands on content whose language we do not control, and a shared primitive is exactly where that rule quietly stops holding.

Body leading needs no work here — Task 1 set `line-height: 1.55` on `:root` with `:root:lang(ar)` overriding at 1.85 on higher specificity.

- [ ] **Step 4: Run the web suite, typecheck, lint and build**

```bash
pnpm --filter @kitchen/web test -- --run && pnpm --filter @kitchen/web typecheck && pnpm --filter @kitchen/web lint && pnpm --filter @kitchen/web build
```

Expected: all PASS. The build is the first real proof that every custom token and `tracking-*` utility compiles in a production Tailwind pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): cream app canvas, lavender auth, Latin-only tracking

Signed-out pages go lavender and the app goes cream, so signing in reads as
walking through a door. theme-color follows, or mobile Safari paints a white
notch above a cream page.

Tracking is delivered through --track-* variables that :root:lang(ar) sets to
zero, so the tracking-* utilities resolve to 0 in Arabic automatically. Arabic
is cursive: letter-spacing forces gaps into the letter joins."
```

---

### Task 6: Mobile primitives, typography and cook mode

**Files:**
- Create: `apps/mobile/src/theme/typography.spec.ts`
- Modify: `apps/mobile/src/theme/index.ts:43-48` (`radius`), `:56-89` (typography)
- Modify: `apps/mobile/src/components/AppText.tsx:32-40` (the `base` style)
- Modify: `apps/mobile/src/components/Button.tsx`
- Modify: `apps/mobile/src/components/Field.tsx:37`
- Modify: `apps/mobile/src/app/recipe/[id]/cook.tsx:27,38,41,64,69`

**Interfaces:**
- Consumes: `colors.surfaceInverse`, `colors.textInverseMuted`, `colors.primaryPressed`, `colors.primaryInverse` from Task 2.
- Produces: `radius.xs = 4`; `TextStyleToken` gains `letterSpacing: number`; `SCALE` gains a `button` variant, so `TypographyVariant` becomes `'display' | 'title' | 'heading' | 'body' | 'bodyStrong' | 'button' | 'label' | 'caption'`. `typography(locale)` keeps its signature `(locale: Locale) => Record<TypographyVariant, TextStyleToken>`.

- [ ] **Step 1: Add the 4px radius**

`apps/mobile/src/theme/index.ts:43-48`. The scale has no 4px entry, so the spec's 4px field rule is unreachable without one:

```ts
export const radius = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 18,
  pill: 999,
} as const;
```

- [ ] **Step 2: Write the failing typography spec**

Nothing currently tests `typography()` at all. Create `apps/mobile/src/theme/typography.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { typography } from './index';

describe('typography', () => {
  it('tightens large Latin tiers and opens up small ones', () => {
    const en = typography('en');
    expect(en.display.letterSpacing).toBeLessThan(0);
    expect(en.title.letterSpacing).toBeLessThan(0);
    expect(en.button.letterSpacing).toBeGreaterThan(0);
    expect(en.body.letterSpacing).toBe(0);
  });

  it('never letter-spaces Arabic', () => {
    // Arabic is cursive: letter-spacing forces gaps into the letter joins.
    for (const [variant, token] of Object.entries(typography('ar'))) {
      expect(token.letterSpacing, variant).toBe(0);
    }
  });

  it('gives Arabic more leading at the same size', () => {
    expect(typography('ar').body.fontSize).toBe(typography('en').body.fontSize);
    expect(typography('ar').body.lineHeight).toBeGreaterThan(typography('en').body.lineHeight);
  });

  it('carries a 700-weight button tier for pill labels', () => {
    expect(typography('en').button.fontWeight).toBe('700');
    expect(typography('en').button.fontSize).toBe(16);
  });
});
```

- [ ] **Step 3: Run it to watch it fail**

```bash
pnpm --filter @kitchen/mobile test -- --run src/theme/typography.spec.ts
```

Expected: **FAIL.** Three of the four cases fail because `letterSpacing` is `undefined` on every token, and the fourth fails because there is no `button` variant. Only `gives Arabic more leading` passes.

- [ ] **Step 4: Add Latin-only letter-spacing to the scale**

Replace `TextStyleToken`, `SCALE` and `typography` in `apps/mobile/src/theme/index.ts`:

```ts
export interface TextStyleToken {
  fontSize: number;
  lineHeight: number;
  fontWeight: '400' | '500' | '600' | '700';
  letterSpacing: number;
}

const LATIN_LINE_HEIGHT = 1.35;
const ARABIC_LINE_HEIGHT = 1.7;

/**
 * `letterSpacing` is a Latin-only device and is zeroed for Arabic below, the
 * same way line-height is switched. Arabic is cursive: spacing the letters
 * forces gaps into the joins.
 *
 * `satisfies`, not a type annotation. An annotation of `Record<string, …>`
 * widens `keyof typeof SCALE` to `string`, so `TypographyVariant` stops being
 * a union of the eight names and `Record<TypographyVariant, TextStyleToken>`
 * becomes an index signature — under this repo's `noUncheckedIndexedAccess`
 * every `typography('en').display` in the spec is then `TextStyleToken |
 * undefined` and the file does not compile (10 errors, measured). `satisfies`
 * shape-checks the literal without widening it, which is what the Interfaces
 * section above requires. Note this also tightens `AppText`'s `variant` prop,
 * which was silently `string` before.
 */
const SCALE = {
  display: { fontSize: 28, fontWeight: '700' as const, letterSpacing: -0.22 },
  title: { fontSize: 22, fontWeight: '700' as const, letterSpacing: -0.09 },
  heading: { fontSize: 18, fontWeight: '600' as const, letterSpacing: -0.02 },
  body: { fontSize: 16, fontWeight: '400' as const, letterSpacing: 0 },
  bodyStrong: { fontSize: 16, fontWeight: '600' as const, letterSpacing: 0 },
  button: { fontSize: 16, fontWeight: '700' as const, letterSpacing: 0.2 },
  label: { fontSize: 14, fontWeight: '500' as const, letterSpacing: 0.1 },
  caption: { fontSize: 12, fontWeight: '500' as const, letterSpacing: 0.1 },
} satisfies Record<
  string,
  { fontSize: number; fontWeight: TextStyleToken['fontWeight']; letterSpacing: number }
>;

export type TypographyVariant = keyof typeof SCALE;

export function typography(locale: Locale): Record<TypographyVariant, TextStyleToken> {
  const isArabic = locale === 'ar';
  const factor = isArabic ? ARABIC_LINE_HEIGHT : LATIN_LINE_HEIGHT;
  const out = {} as Record<TypographyVariant, TextStyleToken>;
  for (const key of Object.keys(SCALE) as TypographyVariant[]) {
    const entry = SCALE[key]!;
    out[key] = {
      fontSize: entry.fontSize,
      fontWeight: entry.fontWeight,
      lineHeight: Math.round(entry.fontSize * factor),
      letterSpacing: isArabic ? 0 : entry.letterSpacing,
    };
  }
  return out;
}
```

- [ ] **Step 5: Apply the tracking in the text primitive**

The token alone changes nothing — `AppText` builds its style by hand and never reads `letterSpacing`. In `apps/mobile/src/components/AppText.tsx`, add one line to `base`:

```tsx
  const base: TextStyle = {
    fontSize: token.fontSize,
    lineHeight: token.lineHeight,
    letterSpacing: token.letterSpacing,
    color: resolvedColor,
    fontFamily,
    // The weight-specific Arabic family already encodes the weight; setting
    // fontWeight on top of it makes iOS synthesize a heavier face.
    ...(fontFamily ? null : { fontWeight: token.fontWeight }),
    ...(center ? { textAlign: 'center' } : null),
  };
```

`AppText` is the only text primitive in the app, so this one line delivers tracking everywhere. It cannot be unit-tested here — mobile's Vitest is `node`-environment and cannot parse `.tsx` — which is exactly why the logic lives in `typography()` and is tested there.

- [ ] **Step 6: Run the typography spec to verify it passes**

```bash
pnpm --filter @kitchen/mobile test -- --run src/theme/typography.spec.ts
```

Expected: **PASS**, all four cases.

- [ ] **Step 7: Make the mobile button a pill with a pressed colour**

In `apps/mobile/src/components/Button.tsx`, add a pressed-background map beneath `FG`:

```tsx
/** Only `primary` gets a pressed colour, matching web's hover:bg-primary-press. */
const PRESSED_BG: Partial<Record<ButtonVariant, string>> = {
  primary: colors.primaryPressed,
};
```

then in the `style` callback replace the `borderRadius`, `backgroundColor`, `borderColor` and `opacity` lines:

```tsx
          borderRadius: radius.pill,
          backgroundColor: (pressed && PRESSED_BG[variant]) || BG[variant],
          borderWidth: variant === 'ghost' ? 0 : 1,
          borderColor:
            variant === 'secondary'
              ? colors.border
              : (pressed && PRESSED_BG[variant]) || BG[variant],
          opacity: isDisabled ? 0.5 : pressed && !PRESSED_BG[variant] ? 0.85 : 1,
```

and change the label to the new 700-weight variant:

```tsx
          <AppText variant="button" style={{ color: FG[variant] }}>
```

`primaryPressed` is defined but referenced nowhere today; this makes it live. Variants without a pressed colour keep the existing opacity feedback.

- [ ] **Step 7b: Give cook mode buttons that survive the inversion**

Still in `apps/mobile/src/components/Button.tsx`. Cook mode is the only screen that inverts, and `BG`/`FG` are keyed off a light-mode palette: `primary` `#4A154B` on `surfaceInverse` `#1D1D1D` is **1.20:1**, so the CTA fill vanishes and the ghost "exit" label is unreadable. Extend the variant union rather than adding a prop — every existing call site keeps compiling and the component's API is unchanged:

```tsx
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'primaryInverse' | 'ghostInverse';
```

Add the two entries to each map:

```tsx
const BG: Record<ButtonVariant, string> = {
  primary: colors.primary,
  secondary: colors.surfaceAlt,
  ghost: 'transparent',
  danger: colors.danger,
  primaryInverse: colors.primaryInverse,
  ghostInverse: 'transparent',
};

const FG: Record<ButtonVariant, string> = {
  primary: colors.textInverse,
  secondary: colors.text,
  ghost: colors.primary,
  danger: colors.textInverse,
  // The lifted aubergine is light, so its label is dark: 7.72:1.
  primaryInverse: colors.text,
  ghostInverse: colors.primaryInverse,
};
```

`ghostInverse` must also be borderless, so widen the ghost check in the `style` callback:

```tsx
          borderWidth: variant === 'ghost' || variant === 'ghostInverse' ? 0 : 1,
```

`Record<ButtonVariant, string>` is exhaustive, so typecheck fails if either map misses a variant. That is the gate for this step.

- [ ] **Step 8: Sharpen the mobile field**

`apps/mobile/src/components/Field.tsx:37`:

```tsx
            borderRadius: radius.xs,
```

- [ ] **Step 9: Name cook mode's inversion**

`apps/mobile/src/app/recipe/[id]/cook.tsx` reads surface tokens as text colours, which works only by coincidence and breaks the moment either value moves. Lines 27 and 38:

```tsx
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.surfaceInverse }}>
```

Line 41:

```tsx
          <AppText variant="label" style={{ color: colors.textInverseMuted }}>
```

Line 64:

```tsx
          <AppText variant="display" style={{ color: colors.textInverse, fontSize: 30, lineHeight: 44 }}>
```

Line 69:

```tsx
        <AppText variant="caption" style={{ color: colors.textInverseMuted }} center>
```

Lines 47–52 and 74–94 — the buttons. Swap each to its inverted variant so it survives the dark surface. The exit button:

```tsx
          <Button
            title={t('mobile.recipe.exitCookMode')}
            variant="ghostInverse"
            fullWidth={false}
            onPress={() => router.back()}
          />
```

and both CTAs (`finish` and `next`) take `variant="primaryInverse"`. `prev` stays `secondary` — `surfaceAlt` is 13.9:1 on the inverted surface and already reads.

- [ ] **Step 10: Run the mobile suite, typecheck and lint**

```bash
pnpm --filter @kitchen/mobile test -- --run && pnpm --filter @kitchen/mobile typecheck && pnpm --filter @kitchen/mobile lint
```

Expected: all PASS. Typecheck is the real gate here: `TextStyleToken.letterSpacing` is required, so any other construction of that type would fail to compile. There is only one — `typography()` itself.

- [ ] **Step 11: Commit**

```bash
git add apps/mobile/src
git commit -m "feat(mobile): pill buttons, 4px fields, Latin-only tracking

Adds radius.xs so the 4px field rule is reachable, and a letterSpacing field
that typography() zeroes for Arabic, mirroring how it already switches
line-height. AppText applies it — it is the only text primitive in the app, so
one line delivers tracking everywhere. Nothing tested typography() before;
there is now a spec for it.

Cook mode stops painting its background with colors.text and its text with
colors.surface. That worked by coincidence; it now names surfaceInverse and
textInverseMuted so it survives a palette change."
```

---

### Task 7: Full verification

**Files:** none modified. This task only runs things.

**Interfaces:** consumes everything above.

- [ ] **Step 1: Run the full monorepo gate**

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

Expected: 9 of 9 tasks green. Lint reports exactly **one** warning — the
pre-existing `react-hooks/exhaustive-deps` on `PantryRail.tsx:54`, which
predates this branch and is not ours to fix. The test count rises from 344 by
roughly 40 — the web palette test, the web usage guard, and the mobile palette
and typography specs — and no existing test changes.

Run `pnpm build` **before** starting the dev server in Step 2, never after:
both write to `apps/web/.next`, and a production build under a running dev
server corrupts its chunks and turns every route into a 500. If that happens,
`rm -rf apps/web/.next` and restart the dev server.

- [ ] **Step 2: Start the API and web servers**

```bash
cd apps/api && node --env-file=../../.env dist/main.js
```

In a second shell:

```bash
cd apps/web && WEB_PORT=3100 pnpm start
```

Port 3000 is taken on this machine. Confirm the API answers before sweeping:

```bash
curl -fsS http://localhost:3333/health
```

- [ ] **Step 3: Sweep every route in both languages**

```bash
for path in "" sign-in sign-up setup kitchen kitchen/capture plans recipes shopping settings household; do
  for lang in en ar; do
    code=$(curl -s -o /dev/null -w '%{http_code}' -b "kitchen_locale=$lang" "http://localhost:3100/$path")
    printf '%s %-16s %s\n' "$lang" "${path:-/}" "$code"
  done
done
```

Expected: `200` for all 22 combinations. A `404` means a route name in this loop is wrong, not that the restyle broke — check against `apps/web/src/app` before investigating further. The eleven names above are the app's real routes, taken from `next build`'s own route table; note there is **no `/dashboard`** (the dashboard is `/`, from `app/(app)/page.tsx`) and capture is nested at `/kitchen/capture`.

The locale is driven by the **`kitchen_locale` cookie**, read server-side in `lib/locale.server.ts` and applied to `<html lang dir>` in `app/layout.tsx`. It is *not* content-negotiated, so sweeping with `Accept-Language` silently renders English twice and proves nothing about Arabic. Confirm the header actually took effect rather than trusting the status code:

```bash
curl -s -b 'kitchen_locale=ar' http://localhost:3100/sign-in | grep -o '<html[^>]*>'
```

Expected: `lang="ar" dir="rtl"`. That attribute is what makes `:root:lang(ar)` fire and zero the tracking, so if it says `en` the Arabic half of this task has not been tested at all.

- [ ] **Step 4: Check both themes by eye**

Load `http://localhost:3100/dashboard` and toggle the OS appearance between light and dark. Confirm: the canvas is cream (light) / near-black plum (dark); cards sit clearly above it; sidebar active rows show aubergine text on a soft tint that is readable in **both** themes; badges show a visible 1px status border; buttons are fully round with bold labels. Then switch to Arabic and confirm the layout mirrors and no letter-spacing has crept into Arabic text.

- [ ] **Step 5: Stop the servers**

Use `kill <PID>` with the specific process IDs. Do not use name-based process killers.

- [ ] **Step 6: Commit any fixes the sweep surfaced**

If steps 3 and 4 were clean there is nothing to commit and this task ends here.

---

## Notes for the implementer

- **Do not modify a test to make it pass.** Every test in this repo either predates the restyle or was written in this plan to fail first. A red test is information.
- **`pnpm --filter @kitchen/web test -- --run`** — the `--run` matters; Vitest otherwise sits in watch mode and the step never returns.
- **After editing `packages/i18n/src/*.ts`** run `pnpm --filter @kitchen/i18n build`, or downstream `t()` calls fail typecheck with a key-union error. No task here touches i18n, but the restyle sits next to it.
- **Never pipe a long-running dev server into `head` or `tail`.** The pipe closes, the server spins on EPIPE at ~115% CPU and wedges its own event loop. Redirect to a file instead.
- **macOS:** there is no `timeout` binary, and process termination must use `kill <PID>`.
