import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const appText = readFileSync(join(__dirname, '..', 'components', 'AppText.tsx'), 'utf8');

/**
 * AppText pulls in React Native, so this guards the invariant at the source
 * level (same approach as `theme/token-usage.spec.ts`).
 *
 * Arabic text alignment is delivered by `writingDirection`, never `textAlign`.
 * iOS resolves the default `textAlign: 'auto'` against the bundle's language,
 * so on an English device Arabic screen titles and card copy left-aligned while
 * everything around them mirrored. The obvious repair — `textAlign: 'right'` —
 * silently does nothing, because `makeRTLFlipLeftAndRightStyles` swaps left and
 * right back under forced RTL. Both behaviours were confirmed in the simulator.
 */
describe('AppText direction', () => {
  it('derives the base writing direction from the locale', () => {
    expect(appText).toMatch(/writingDirection: dir,/);
    expect(appText).toMatch(/const \{ locale, dir \} = useLocale\(\);/);
  });

  it('never sets a physical textAlign from the direction', () => {
    // `textAlign: dir === 'rtl' ? 'right' : 'left'` reads correct and is a
    // no-op: RTL flips it straight back.
    expect(appText).not.toMatch(/textAlign:\s*dir/);
  });

  it('still allows the explicit centre opt-in', () => {
    expect(appText).toMatch(/center \? \{ textAlign: 'center' \}/);
  });
});
