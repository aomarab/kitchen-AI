import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(__dirname, '..', '..');
const read = (...parts: string[]) => readFileSync(join(SRC, ...parts), 'utf8');

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
});
