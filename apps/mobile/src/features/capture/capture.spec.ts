import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(__dirname, '..', '..');
const read = (...parts: string[]) => readFileSync(join(SRC, ...parts), 'utf8');

function sourceFiles(dir = SRC): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.tsx?$/.test(entry) && !/\.spec\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

function executableSource(file: string): string {
  return readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
}

describe('capture screen source contract (G3b)', () => {
  it('keeps the media segmented control to Photo, Barcode and Receipt only', () => {
    const source = read('app', 'capture', 'index.tsx');
    const options = source.match(/const MEDIA_METHOD_OPTIONS[\s\S]*?\] as const;/)?.[0] ?? '';
    const values = [...options.matchAll(/value: '([^']+)'/g)].map((match) => match[1]);

    expect(values).toEqual(['photo', 'barcode', 'receipt']);
    expect(options).not.toContain("'manual'");
  });

  it('renders method=manual as ManualAdd inside a normal themed Screen', () => {
    const source = read('app', 'capture', 'index.tsx');
    const manualBranch = source.match(
      /if \(method === 'manual'\)[\s\S]*?return \([\s\S]*?\);\n/s,
    )?.[0];

    expect(manualBranch).toContain('<Screen');
    expect(manualBranch).toContain('<Header');
    expect(manualBranch).toContain("t('mobile.capture.manualTitle')");
    expect(manualBranch).toContain('<ManualAdd />');
    expect(manualBranch).not.toContain('<CaptureChrome');
  });

  it('checks nothing-found before mapping other capture errors', () => {
    const source = read('features', 'capture', 'PhotoCapture.tsx');

    expect(source.indexOf('isNothingFound(error)')).toBeGreaterThanOrEqual(0);
    expect(source.indexOf('isNothingFound(error)')).toBeLessThan(
      source.indexOf('captureErrorKey(error)'),
    );
  });

  it('offers Add all only through the canAddAll gate and Review-equivalent payload', () => {
    const source = read('features', 'capture', 'PhotoCapture.tsx');

    expect(source).toContain('canAddAll(session, locations.data ?? [])');
    expect(source).toContain(
      "buildInventoryInputs(initialReviewRows(session, locations.data ?? []), 'photo')",
    );
  });

  it('stores photo sessions with photos and receipt sessions without them', () => {
    const source = read('features', 'capture', 'PhotoCapture.tsx');

    expect(source).toContain("setSession(session, 'photo', zipPhotos(photos, keys))");
    expect(source).toContain("setSession(session, 'receipt')");
  });

  it('positions AR pins in LTR image space and never flips coordinates in RTL', () => {
    const path = join(SRC, 'features', 'capture', 'ArPins.tsx');
    const source = existsSync(path) ? readFileSync(path, 'utf8') : '';

    expect(source).toContain("direction: 'ltr'");
    expect(source).not.toMatch(/I18nManager|isRTL/);
  });

  it('keeps CameraGate inside CaptureChrome so permission prompts cannot remove navigation', () => {
    for (const file of ['PhotoCapture.tsx', 'BarcodeCapture.tsx']) {
      const source = read('features', 'capture', file);
      expect(source, `${file} should render the chrome`).toContain('<CaptureChrome');
      expect(source, `${file} must not wrap the chrome in CameraGate`).not.toMatch(
        /return\s*\(\s*<CameraGate[\s\S]*?<CaptureChrome/,
      );
    }
  });

  it('puts the measured media scrim behind inverse hint text', () => {
    const source = read('features', 'capture', 'PhotoCapture.tsx');

    expect(source).toContain('scrimGradient(scrim)');
    expect(source.indexOf('renderHintScrim()')).toBeLessThan(source.indexOf('renderHint()'));
  });

  it('lets the top trailing slot grow for the Retake text pill', () => {
    const source = read('features', 'capture', 'CaptureChrome.tsx');

    expect(source).toContain('minWidth: 44');
    expect(source).not.toContain('width: 44, alignItems');
  });

  it('focus-gates light status bar content on the dark media surface', () => {
    const source = read('features', 'capture', 'CaptureChrome.tsx');

    expect(source).toContain("from 'expo-router'");
    expect(source).toContain('useIsFocused()');
    expect(source).toContain("from 'expo-status-bar'");
    expect(source).toContain('{isFocused ? <StatusBar style="light" /> : null}');
    expect(source).not.toMatch(
      /<StatusBar style="light" \/>\s*<View style=\{\{ flex: 1 \}\}>\{children\}<\/View>/,
    );
  });
});

describe('review screen source contract (G4)', () => {
  it('keeps inventory writes behind ReviewList confirm and PhotoCapture add-all only', () => {
    const callers = sourceFiles()
      .filter((file) => !file.endsWith(join('lib', 'capture.ts')))
      .filter((file) => executableSource(file).includes('buildInventoryInputs('))
      .map((file) => relative(SRC, file).replaceAll('\\', '/'))
      .sort();

    expect(callers).toEqual([
      'features/capture/PhotoCapture.tsx',
      'features/capture/ReviewList.tsx',
    ]);

    const review = read('features', 'capture', 'ReviewList.tsx');
    expect(review).toContain('const confirm = useCallback');
    expect(review).toContain('onConfirm(buildInventoryInputs(rows, source))');
  });

  it('keeps the question tile free of the coral primary colour', () => {
    const source = read('features', 'capture', 'QuestionTile.tsx');

    expect(source).not.toContain('colors.primary');
    expect(source).not.toContain('variant="primary"');
  });

  it('renders a trailing Retake action in the review header', () => {
    const source = read('app', 'capture', 'review.tsx');

    expect(source).toContain('trailing={');
    expect(source).toContain("t('mobile.review.retake')");
  });

  it('drops the old review hint and exposes a sticky-footer split', () => {
    const source = read('features', 'capture', 'ReviewList.tsx');

    expect(source).toContain("footer?: 'inline' | 'none'");
    expect(source).toContain('export function ReviewFooter');
    expect(source).not.toContain("t('mobile.review.hint')");
  });

  it('uses the shared Bento primitive instead of forking bento layout', () => {
    const source = read('features', 'capture', 'ReviewList.tsx');

    expect(source).toContain('<Bento');
    expect(source).not.toContain('bentoRows');
    expect(source).not.toContain("from '../../components/tile-layout'");
  });

  it('adds the Bento offset back to row-local focus positions', () => {
    const source = read('features', 'capture', 'ReviewList.tsx');

    expect(source).toContain('reviewScrollTarget(bentoY.current, rowY)');
  });

  it('keeps the review stepper visually inside the shared tile frame', () => {
    const source = read('features', 'capture', 'ReviewTile.tsx');

    expect(source).toContain('<Tile');
    expect(source).toContain("position: 'absolute'");
    expect(source).toContain('start: spacing.md');
    expect(source).toContain('bottom: spacing.xs');
    expect(source).not.toContain('BentoColumn');
  });
});
