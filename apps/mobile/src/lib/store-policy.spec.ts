import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { routes } from '@kitchen/contracts';

const SRC = join(__dirname, '..');
const APP_JSON = join(SRC, '..', 'app.json');
const REPO_ROOT = join(SRC, '..', '..', '..');
const WEB_DELETE_ACCOUNT_ROUTE = join(
  REPO_ROOT,
  'apps',
  'web',
  'src',
  'app',
  '(app)',
  'settings',
  'delete-account',
  'page.tsx',
);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return entry === 'mocks' ? [] : sourceFiles(full);
    return /\.(ts|tsx)$/.test(entry) && !/\.spec\.tsx?$/.test(entry) ? [full] : [];
  });
}

/**
 * Apple Guideline 1.1.7 and Google's In-App Review policy both forbid using a
 * collected sentiment to decide who is shown the native store-review prompt.
 * Now that the app collects a star rating, wiring it to `StoreReview` is a
 * plausible-looking one-line change that would make the app rejectable.
 *
 * This is a grep, not a type check, on purpose: the violation is the presence
 * of the capability near the rating, and no type system expresses that.
 */
describe('store review policy', () => {
  const files = sourceFiles(SRC);

  it('finds source files to check, or this test proves nothing', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it('never imports a store-review API', () => {
    const offenders = files.filter((file) => {
      const source = readFileSync(file, 'utf8');
      return /expo-store-review|StoreReview|requestReview/.test(source);
    });

    expect(offenders).toEqual([]);
  });
});

/**
 * The privacy manifest is asserted against `app.json`, NOT against
 * `ios/KitchenAI/PrivacyInfo.xcprivacy`. That file is prebuild output and is
 * gitignored, so editing it directly is erased by the next `expo prebuild`.
 * `expo.ios.privacyManifests` is the tracked source; Expo merges it into the
 * generated manifest, preserving the required-reason API entries the pods add.
 *
 * An inaccurate manifest is a rejection found at submission time, so the set is
 * pinned here: adding a new kind of collected data must fail this test until
 * `docs/store-listing/data-safety.md` and the console answers are updated too.
 */
describe('iOS privacy manifest', () => {
  const config = JSON.parse(readFileSync(APP_JSON, 'utf8')) as {
    expo: {
      ios?: {
        privacyManifests?: {
          NSPrivacyTracking?: boolean;
          NSPrivacyCollectedDataTypes?: {
            NSPrivacyCollectedDataType: string;
            NSPrivacyCollectedDataTypeLinked: boolean;
            NSPrivacyCollectedDataTypeTracking: boolean;
            NSPrivacyCollectedDataTypePurposes: string[];
          }[];
        };
      };
    };
  };
  const manifest = config.expo.ios?.privacyManifests;

  it('declares exactly the data the app collects', () => {
    expect(manifest?.NSPrivacyCollectedDataTypes?.map((d) => d.NSPrivacyCollectedDataType)).toEqual([
      'NSPrivacyCollectedDataTypeEmailAddress',
      'NSPrivacyCollectedDataTypeName',
      'NSPrivacyCollectedDataTypePhotosorVideos',
      'NSPrivacyCollectedDataTypeOtherUserContent',
      'NSPrivacyCollectedDataTypeProductInteraction',
    ]);
  });

  it('claims no tracking anywhere, which is what avoids an ATT prompt', () => {
    expect(manifest?.NSPrivacyTracking).toBe(false);
    for (const entry of manifest?.NSPrivacyCollectedDataTypes ?? []) {
      expect(entry.NSPrivacyCollectedDataTypeTracking).toBe(false);
    }
  });

  it('marks every collected type as linked to the user', () => {
    // Feedback carries user_id and the admin console shows the submitter's
    // email, so none of this can honestly be declared unlinked.
    for (const entry of manifest?.NSPrivacyCollectedDataTypes ?? []) {
      expect(entry.NSPrivacyCollectedDataTypeLinked).toBe(true);
      expect(entry.NSPrivacyCollectedDataTypePurposes).toEqual([
        'NSPrivacyCollectedDataTypePurposeAppFunctionality',
      ]);
    }
  });
});

/**
 * App Store Guideline 5.1.1(v) and Google Play's data-deletion policy both
 * require in-app account deletion. Removing the route would pass typecheck
 * and every feature test while making the app rejectable, so it is asserted
 * here alongside the other store rules.
 */
describe('account deletion policy', () => {
  it('exposes an authenticated account-deletion route', () => {
    expect(routes.deleteMe).toBeDefined();
    expect(routes.deleteMe.method).toBe('DELETE');
    expect(routes.deleteMe.auth).toBe(true);
  });

  it('is not household-scoped, so a user whose only kitchen is gone can still delete', () => {
    expect(routes.deleteMe.household).toBe(false);
  });

  it('ships a screen that reaches it', () => {
    const screen = readFileSync(join(SRC, 'app', 'settings', 'delete-account.tsx'), 'utf8');
    expect(screen).toContain('useDeleteAccount');
  });

  it('ships the web route behind the declared Google deletion URL', () => {
    // Google Play's data-deletion policy requires a publicly reachable deletion
    // URL, and docs/store-listing/data-safety.md declares it as the web route
    // /settings/delete-account. That URL is backed by this file; deleting or
    // renaming it 404s the declared URL and silently makes the submission
    // false, and no typecheck or feature test would catch it — so its existence
    // and its wiring to the deletion UI are pinned here.
    const reason =
      'apps/web/src/app/(app)/settings/delete-account/page.tsx backs the Google ' +
      'Play account-deletion URL /settings/delete-account declared in ' +
      'docs/store-listing/data-safety.md; if it is removed or stops rendering ' +
      '<DeleteAccount /> that URL breaks and the store paperwork becomes false.';
    expect(existsSync(WEB_DELETE_ACCOUNT_ROUTE), reason).toBe(true);
    const route = readFileSync(WEB_DELETE_ACCOUNT_ROUTE, 'utf8');
    expect(route, reason).toContain('<DeleteAccount');
  });

  it('keeps test files out of the Expo Router routes directory', () => {
    // Expo Router turns every file under src/app into a route, so Metro bundles
    // them into the shipped app. A .spec.ts there drags vitest into the runtime
    // bundle and the app dies on launch with "Vitest failed to access its
    // internal state" — a crash no unit test can see, because under vitest the
    // same file is a perfectly ordinary passing test. Specs live beside the
    // module they cover (src/lib/foo.spec.ts), never under src/app.
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
          walk(full);
        } else if (/\.(spec|test)\.[jt]sx?$/.test(entry)) {
          offenders.push(full.slice(SRC.length + 1));
        }
      }
    };
    walk(join(SRC, 'app'));
    expect(
      offenders,
      `Expo Router bundles everything under src/app into the app, so these test ` +
        `files would ship inside it and crash the app at launch by importing ` +
        `vitest at runtime. Move them next to the module they test (e.g. ` +
        `src/lib/<module>.spec.ts): ${offenders.join(', ')}`,
    ).toEqual([]);
  });
});

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
