import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const layout = readFileSync(join(__dirname, '..', 'app', '_layout.tsx'), 'utf8');

/**
 * `_layout.tsx` pulls in expo-router, so it cannot be imported in the node test
 * environment. This guards the invariant at the source level instead, in the
 * same spirit as `theme/token-usage.spec.ts`.
 *
 * It lives in `lib/` rather than next to the file it checks because expo-router
 * turns every module under `src/app/` into a route — a spec there gets bundled
 * into the app and its `node:fs` import fails to resolve at runtime.
 *
 * The locale store starts on the *device* locale and only learns the user's
 * saved choice when `useBootstrap` finishes hydrating. Applying direction
 * before then made an Arabic user on an English device alternate between RTL
 * and LTR on every single launch: the pre-hydration `en` forced LTR, the
 * hydrated `ar` forced RTL, and each launch undid the last one.
 */
describe('layout direction', () => {
  it('applies direction only after the persisted locale has hydrated', () => {
    const calls = [...layout.matchAll(/applyDirection\(locale\)/g)];
    expect(calls).toHaveLength(1);
    expect(layout).toMatch(/if \(ready\) applyDirection\(locale\);/);
  });

  it('builds the applier once, outside the component', () => {
    // A per-render applier forgets what it wrote, which is the whole point of
    // `createDirectionApplier` (see lib/direction.ts).
    expect(layout).toMatch(/^const applyDirection = createDirectionApplier\(I18nManager\);$/m);
  });

  it('does not force direction during render', () => {
    // A bare call in the component body runs on every render, before hydration.
    expect(layout).not.toMatch(/^ {2}applyDirection\(/m);
  });

  it('re-runs when either readiness or the locale changes', () => {
    expect(layout).toMatch(/\}, \[ready, locale\]\);/);
  });
});
