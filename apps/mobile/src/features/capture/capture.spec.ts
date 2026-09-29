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
  it('keeps the J capture mode tabs in frame order, including Manual', () => {
    const source = read('features', 'capture', 'CaptureChrome.tsx');
    const options = source.match(/const CAPTURE_METHOD_OPTIONS[\s\S]*?\] as const;/)?.[0] ?? '';
    const values = [...options.matchAll(/value: '([^']+)'/g)].map((match) => match[1]);

    expect(values).toEqual(['photo', 'barcode', 'receipt', 'manual']);
    expect(source).toContain('export function CaptureModeTabs');
    expect(source).not.toContain('<SegmentedControl');
    expect(source).not.toContain('RoundButton');
  });

  it('renders method=manual as ManualAdd inside a normal themed Screen', () => {
    const source = read('app', 'capture', 'index.tsx');
    const manualBranch = source.match(
      /if \(method === 'manual'\)[\s\S]*?return \([\s\S]*?\);\n/s,
    )?.[0];

    expect(manualBranch).toContain('<Screen');
    expect(manualBranch).toContain('<CapturePageHeader');
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
    expect(source).toContain('DETECTION_CORNER_LENGTH = 18');
    expect(source).toContain('DETECTION_CORNER_THICKNESS = 3');
    expect(source).toContain('DETECTION_TAG_HEIGHT = 22');
    expect(source).toContain('boxRectForFrame');
    expect(source).toContain('colors.primary');
    expect(source).toContain('colors.textInverseMuted');
    expect(source).not.toMatch(/I18nManager|isRTL/);
    expect(source).not.toContain('PIN_ANCHOR / 2');
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

  it('uses media icon buttons and a four-tab text strip in capture chrome', () => {
    const source = read('features', 'capture', 'CaptureChrome.tsx');

    expect(source).toContain('<IconButton');
    expect(source).toContain('tone="media"');
    expect(source).toContain('<CaptureModeTabs');
    expect(source).toContain('showModeTabs = true');
    expect(source).toContain('showModeTabs ? (');
    expect(source).toContain('colors.primaryInverse');
    expect(source).not.toContain('<RoundButton');
  });

  it('keeps barcode flash in the top trailing media slot without changing scanning', () => {
    const barcode = read('features', 'capture', 'BarcodeCapture.tsx');
    const torch = read('features', 'capture', 'CaptureTorchButton.tsx');

    expect(barcode).toContain('const [torch, setTorch] = useState(false)');
    expect(barcode).toContain('<CaptureTorchButton');
    expect(barcode).toContain('enabled={torch}');
    expect(barcode).toContain('onToggle={() => setTorch((value) => !value)}');
    expect(barcode).toContain('trailing={trailing}');
    expect(barcode).toContain('enableTorch={torch}');
    expect(barcode).toContain('onBarcodeScanned={onScan}');
    expect(torch).toContain("icon={enabled ? 'flashOff' : 'zap'}");
    expect(torch).toContain("t('mobile.capture.flashOff')");
    expect(torch).toContain("t('mobile.capture.flashOn')");
    expect(torch).toContain('tone="media"');
    expect(torch).toContain('size={44}');
  });

  it('hides mode tabs and bottom camera controls after capture states', () => {
    const photo = read('features', 'capture', 'PhotoCapture.tsx');
    const flow = read('lib', 'capture-flow.ts');

    expect(flow).toContain('export function captureFlowShowsModeTabs');
    expect(flow).toContain('return flow ===');
    expect(flow).toContain('export function captureFlowShowsBottomCameraControls');
    expect(flow).toContain("flow !== 'looking'");
    expect(flow).toContain("flow !== 'result'");
    expect(photo).toContain('const showModeTabs = captureFlowShowsModeTabs(flow)');
    expect(photo).toContain(
      'const showBottomCameraControls = captureFlowShowsBottomCameraControls(flow)',
    );
    expect(photo).toContain('bottom={showBottomCameraControls ? bottomCameraControls : undefined}');
    expect(photo).toContain('showModeTabs={showModeTabs}');
  });

  it('moves post-capture-only bottom control actions into the result/progress sheet', () => {
    const source = read('features', 'capture', 'PhotoCapture.tsx');

    expect(source).toContain('renderPostCaptureTrayOpener');
    expect(source).toContain("flow !== 'looking' && flow !== 'result'");
    expect(source).toContain("t('mobile.capture.openTray', { count: photos.length })");
    expect(source).toContain('onPress={() => setTrayOpen(true)}');
    expect(source).toContain('accessory={renderPostCaptureTrayOpener()}');
    expect(source).toContain('renderLookingSheetActions');
    expect(source).toContain("t('mobile.capture.fromLibrary')");
    expect(source).toContain('onPress={() => void pickLibrary()}');
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

  it('draws the only J circle as a 76pt/60pt inverse shutter without press scaling', () => {
    const source = read('features', 'capture', 'Shutter.tsx');

    expect(source).toContain('SHUTTER_RING_SIZE = 76');
    expect(source).toContain('SHUTTER_CORE_SIZE = 60');
    expect(source).toContain('SHUTTER_RING_WIDTH = 3');
    expect(source).toContain('SHUTTER_BUSY_OPACITY = 0.4');
    expect(source).toContain('radius.shutter');
    expect(source).toContain('colors.textInverse');
    expect(source).toContain('usePressFeedback()');
    expect(source).not.toContain('pressScale');
    expect(source).not.toContain('scale: pressed');
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

  it('renders the J question row without the retired orb mascot', () => {
    const source = read('features', 'capture', 'QuestionTile.tsx');

    expect(source).toContain('name="leaf"');
    expect(source).toContain('variant="secondary"');
    expect(source).toContain('variant="inverse"');
    expect(source).not.toContain('OrbMascot');
    expect(source).not.toContain('scale: pressed');
  });

  it('renders a trailing Retake action in the review header', () => {
    const source = read('app', 'capture', 'review.tsx');

    expect(source).toContain('trailing={');
    expect(source).toContain("t('mobile.review.retake')");
  });

  it('respects Reduce Motion when focus-scrolling to a reviewed item', () => {
    const source = read('app', 'capture', 'review.tsx');
    const scrollCall = source.match(/scrollRef\.current\?\.scrollTo\([\s\S]*?\);/)?.[0] ?? '';

    expect(source).toContain('useReduceMotion()');
    expect(scrollCall).toContain('animated: !reduceMotion');
    expect(scrollCall).not.toContain('animated: true');
  });

  it('keeps the review hint under the headline and exposes a sticky-footer split', () => {
    const source = read('features', 'capture', 'ReviewList.tsx');

    expect(source).toContain("footer?: 'inline' | 'none'");
    expect(source).toContain('export function ReviewFooter');
    expect(source).toContain("t('mobile.review.hint')");
    expect(source).toContain("t('mobile.review.addSomething')");
  });

  it('uses flat review rows instead of the old Bento review grid', () => {
    const source = read('features', 'capture', 'ReviewList.tsx');

    expect(source).toContain('orderedReviewRows');
    expect(source).toContain('<ReviewTile');
    expect(source).not.toContain('bentoRows');
    expect(source).not.toContain("from '../../components/tile-layout'");
    expect(source).not.toContain('<Bento');
    expect(source).not.toContain('tintIn');
  });

  it('adds the list offset back to row-local focus positions', () => {
    const source = read('features', 'capture', 'ReviewList.tsx');

    expect(source).toContain('reviewScrollTarget(listY.current, rowY)');
  });

  it('keeps the review row on the J item-row pattern with an inline stepper', () => {
    const source = read('features', 'capture', 'ReviewTile.tsx');

    expect(source).toContain('<FoodIcon');
    expect(source).toContain('<QuantityStepper');
    expect(source).toContain('borderBottomColor: colors.rowline');
    expect(source).toContain('paddingVertical: 10');
    expect(source).toContain('gap: 14');
    expect(source).not.toContain('BentoColumn');
    expect(source).not.toContain('<Tile');
    expect(source).not.toContain('tint=');
  });
});
