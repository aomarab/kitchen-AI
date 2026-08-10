import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(__dirname, '..');
const APP_JSON = join(SRC, '..', 'app.json');

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
