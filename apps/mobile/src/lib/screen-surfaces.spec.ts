import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The kiosk route (`app/screen.tsx`) has no render harness on mobile, so the
 * properties that make it a kiosk rather than another list are asserted
 * against its source — the same approach `reminder-surfaces.spec.ts` and
 * `apps/web/src/lib/token-usage.test.ts` take.
 *
 * Only four properties are swept, and each one is a defect that would ship
 * silently:
 *
 * 1. It leaves the app in portrait. The kiosk is the only screen allowed to
 *    rotate; forgetting the restore hands landscape to every screen pushed
 *    afterwards, none of which was laid out for it.
 * 2. Its one-second tick is gated. This screen holds a wake lock and is left
 *    open for the length of a roast — an ungated tick re-renders it tens of
 *    thousands of times while nothing is counting down.
 * 3. It reads the wellness plan through `lib/screen.ts` rather than off the
 *    settings toggles, so it cannot promise a nudge the firing engine will
 *    never send.
 * 4. It holds the display awake. A screen that sleeps after thirty seconds is
 *    not something you glance at with wet hands.
 */
/**
 * Comments are stripped before anything is swept. Without this, commenting a
 * line out leaves it in the file and every rule below passes over code that no
 * longer runs — which is exactly how the wake-lock rule failed its own fault
 * injection before this existed.
 */
const stripComments = (code: string) =>
  code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const source = stripComments(readFileSync(join(__dirname, '..', 'app', 'screen.tsx'), 'utf8'));

const appJson = JSON.parse(readFileSync(join(__dirname, '..', '..', 'app.json'), 'utf8')) as {
  expo: {
    orientation: string;
    ios: { infoPlist: Record<string, unknown> };
  };
};

describe('the source stripper the sweeps depend on', () => {
  it('removes line and block comments', () => {
    expect(stripComments('useKeepAwake();\n// useKeepAwake();\n')).toBe('useKeepAwake();\n\n');
    expect(stripComments('a;\n/* useKeepAwake();\n   still a comment */\nb;')).toBe('a;\n\nb;');
  });

  it('keeps the paths the sweeps read, which contain slashes', () => {
    expect(stripComments("router.push('/settings/reminders');")).toBe(
      "router.push('/settings/reminders');",
    );
  });
});

/**
 * The manifest and the runtime lock are one mechanism, and getting either half
 * wrong is silent.
 *
 * On iOS `UISupportedInterfaceOrientations` is a ceiling, not a default: with
 * `"orientation": "portrait"` the kiosk's `unlockAsync` compiles, ships, and
 * simply never rotates anything. So the manifest has to permit landscape.
 *
 * The other half — that something locks portrait back at runtime, or every
 * screen inherits a landscape it was never laid out for — is asserted by
 * `store-policy.spec.ts`, which already owns what `app.json` may claim.
 */
describe('orientation policy', () => {
  it('permits landscape on iPhone, or the kiosk can never rotate', () => {
    expect(appJson.expo.orientation).not.toBe('portrait');
    expect(appJson.expo.ios.infoPlist['UISupportedInterfaceOrientations']).toContain(
      'UIInterfaceOrientationLandscapeLeft',
    );
  });
});

describe('mobile kitchen kiosk surface', () => {
  it('restores the portrait lock on the way out', () => {
    const cleanup = source.slice(source.indexOf('unlockAsync'));
    expect(source).toContain('unlockAsync');
    // The restore has to be *after* the unlock and inside the effect's
    // teardown; a lock that runs on mount would defeat the unlock instead.
    expect(cleanup).toContain('return () => {');
    expect(cleanup.slice(cleanup.indexOf('return () => {'))).toContain(
      'OrientationLock.PORTRAIT_UP',
    );
  });

  it('gates the one-second tick on a timer actually running', () => {
    expect(source).toContain('useTimerTick(needsTick(');
  });

  it('derives the plan from the contract-backed helpers, not from the toggles', () => {
    expect(source).toContain('wellnessPlanLines(settings');
    expect(source).toContain('activeNudge(occurrences)');
    // Reading a toggle here would mean the kiosk decides for itself what the
    // engine schedules — the exact drift `lib/screen.ts` exists to prevent.
    for (const field of ['breakEnabled', 'stretchEnabled', 'morningEnabled', 'hydrationEnabled']) {
      expect(source).not.toContain(field);
    }
  });

  it('holds the display awake', () => {
    expect(source).toContain('useKeepAwake()');
  });
});
