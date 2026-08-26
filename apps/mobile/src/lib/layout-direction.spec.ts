import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const src = (...parts: string[]) => readFileSync(join(__dirname, '..', ...parts), 'utf8');
const layout = src('app', '_layout.tsx');
/** Prose explains the old mechanism; only real code should be asserted against. */
const stripComments = (text: string) =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const layoutCode = stripComments(layout);
const sheet = src('components', 'Sheet.tsx');
const settings = src('app', 'settings', 'index.tsx');

/**
 * These files pull in expo-router and React Native, so they cannot be imported
 * in the node test environment. The invariant is guarded at the source level
 * instead, in the same spirit as `theme/token-usage.spec.ts`.
 *
 * Layout direction used to be applied with `I18nManager.forceRTL`, which React
 * Native only honours at launch. Switching to Arabic therefore translated every
 * string immediately while the layout stayed English — rows, chevrons and
 * padding all mirrored the wrong way — and the app had to ask the user to
 * restart before it looked right. Direction is now a Yoga `direction` style on
 * the root view, which the whole tree inherits on the very next render.
 *
 * It only works because the UI is written entirely in logical properties
 * (`start`/`end`, `marginStart`, `writingDirection`); the ESLint rule in
 * `packages/config/eslint.base.mjs` is what keeps that true.
 */
describe('layout direction', () => {
  it('mirrors the tree with a direction style on the root view', () => {
    expect(layout).toMatch(/<GestureHandlerRootView style=\{\{ flex: 1, direction: dir \}\}>/);
  });

  it('never forces the native flag from the locale', () => {
    // The bug: any locale-driven forceRTL needs a relaunch to take effect.
    expect(layoutCode).not.toMatch(/applyDirection/);
    expect(layoutCode).not.toMatch(/forceRTL\(/);
  });

  it('neutralises the persisted native flag once, at startup only', () => {
    // An install upgraded from a build that wrote forceRTL(true) would
    // otherwise mirror twice: once natively, once from the style.
    expect(layout).toMatch(/normalizeNativeDirection\(I18nManager\);\n {2}\}, \[\]\);/);
  });

  it('sends screens in the direction they are read', () => {
    expect(layout).toMatch(/animation: dir === 'rtl' \? 'slide_from_left' : 'slide_from_right'/);
  });

  it('gives modals their own direction', () => {
    // A Modal is hosted outside the root view and inherits nothing from it.
    expect(sheet).toMatch(/direction: dir/);
  });

  it('leaves no restart prompt behind in settings', () => {
    // The prompt only existed to work around the native flag.
    expect(settings).not.toMatch(/rtlRestart|restartLater/);
  });
});
