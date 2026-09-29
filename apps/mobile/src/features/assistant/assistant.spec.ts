import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(__dirname, '..', '..');
const read = (...parts: string[]) => readFileSync(join(SRC, ...parts), 'utf8');

describe('assistant screen guards', () => {
  it('keeps assistant detections on the review-list assistant path', () => {
    const source = read('features', 'assistant', 'LiveAssistantScreen.tsx');

    expect(source).toContain('<ReviewList');
    expect(source).toContain('source="assistant"');
  });

  it('opens the standalone assistant route in the requested mode, text by default', () => {
    const source = read('app', 'assistant.tsx');

    expect(source).toContain('initialMode={assistantModeFromParam(params.mode)}');
  });

  it('renders the demo banner from an isMock value outside mode branches', () => {
    const source = read('features', 'assistant', 'LiveAssistantScreen.tsx');
    const badge = source.indexOf('const demoBanner =');
    const condition = source.indexOf('isMock && !isLiveSurface ?');
    const firstModeBranch = source.indexOf("mode === 'live' && !cameraReady");
    const render = source.indexOf('{demoBanner}');

    expect(badge, 'demo banner must be derived directly from isMock').toBeGreaterThanOrEqual(0);
    expect(condition, 'demo banner must be derived directly from isMock').toBeGreaterThan(badge);
    expect(render, 'demo banner must render before the mode content branch').toBeGreaterThan(badge);
    expect(render, 'demo banner must not live inside a mode branch').toBeLessThan(firstModeBranch);
  });

  it('moves assistant feature files off retired Coral primitives and aliases', () => {
    const files = [
      read('features', 'assistant', 'AssistantHeader.tsx'),
      read('features', 'assistant', 'Bubble.tsx'),
      read('features', 'assistant', 'Composer.tsx'),
      read('features', 'assistant', 'LiveAssistantScreen.tsx'),
      read('features', 'assistant', 'ModeSheet.tsx'),
    ].join('\n');

    expect(files).not.toContain('RoundButton');
    expect(files).not.toContain('OrbMascot');
    expect(files).not.toContain('tintNamed');
    expect(files).not.toContain('radius.pill');
    expect(files).not.toContain('<Chip');
    expect(files).not.toContain('<SegmentedControl');
    expect(files).not.toContain('<ToggleRow');
  });

  it('does not render structured recipe replies or starter action chips', () => {
    const source = read('features', 'assistant', 'LiveAssistantScreen.tsx');

    expect(source).not.toContain('RecipeThumb');
    expect(source).not.toContain('Start cooking');
    expect(source).not.toContain('Swap the eggs');
    expect(source).not.toContain('Double it');
    expect(source).not.toContain('Add feta');
  });

  it('uses Coral assistant rows instead of starter chips', () => {
    const source = read('features', 'assistant', 'LiveAssistantScreen.tsx');

    expect(source).toContain('function AssistantStarterPrompt');
    expect(source).toContain('ASSISTANT_PROMPT_MIN_HEIGHT = 48');
    expect(source).toContain('usePressFeedback()');
    expect(source).toContain('<DirectionalIcon name="arrowR"');
  });

  it('keeps waveform animation behind the Reduce Motion hook', () => {
    const source = read('features', 'assistant', 'Waveform.tsx');

    expect(source).toContain('useReduceMotion');
  });

  it('keeps the composer text input on the shared locale-aware field pattern', () => {
    const source = read('features', 'assistant', 'Composer.tsx');

    expect(source).toContain('resolveFontFamily');
    expect(source).toContain("textAlign: 'auto'");
    expect(source).toContain('writingDirection: dir');
    expect(source).toContain('backgroundColor: colors.surfaceAlt');
    expect(source).toContain('borderTopColor: colors.rowline');
    expect(source).toContain('icon="sliders"');
    expect(source).toContain('tone="coral"');
  });

  it('draws the header as the Coral Mama avatar, demo mark, status and icon buttons', () => {
    const header = read('features', 'assistant', 'AssistantHeader.tsx');

    expect(header).toContain('<Avatar');
    expect(header).toContain('size={40}');
    expect(header).toContain('<IconButton');
    expect(header).toContain('icon="x"');
    expect(header).toContain('icon="more"');
    expect(header).toContain('assistantHeaderAccessibilityLabel');
    expect(header).toContain('demoLabel');
    const closeButton =
      header.match(
        /<IconButton[\s\S]*?icon="x"[\s\S]*?accessibilityLabel=\{backLabel\}[\s\S]*?\/>/,
      )?.[0] ?? '';
    expect(closeButton).not.toContain('directional');
  });

  it('draws text bubbles and waveform to the Coral spec', () => {
    const bubble = read('features', 'assistant', 'Bubble.tsx');
    const waveform = read('features', 'assistant', 'Waveform.tsx');

    expect(bubble).toContain('maxWidth: 290');
    expect(bubble).toContain('paddingVertical: 10');
    expect(bubble).toContain('paddingHorizontal: 14');
    expect(bubble).toContain('backgroundColor: mine ? colors.inverse : colors.surfaceAlt');
    expect(waveform).toContain('WAVEFORM_BAR_WIDTH = 3');
    expect(waveform).toContain('WAVEFORM_BAR_GAP = 3');
    expect(waveform).toContain('highlightTail');
  });

  it('keeps voice, live detections and paused states as Coral assistant surfaces', () => {
    const source = read('features', 'assistant', 'LiveAssistantScreen.tsx');

    expect(source).toContain('function VoiceAssistantPanel');
    expect(source).toContain('function DetectionOverlay');
    expect(source).toContain('function DetectionBox');
    expect(source).toContain('function SessionPausedOverlay');
    expect(source).toContain('DETECTION_CORNER_LENGTH = 18');
    expect(source).toContain('DETECTION_TAG_HEIGHT = 22');
    expect(source).toContain('source="assistant"');
    expect(source).toContain('create.mutate');
    expect(source).not.toContain('useAdjustQuantity');
  });

  it('exposes media toggle state and blocks paused overlay background touches', () => {
    const header = read('features', 'assistant', 'AssistantHeader.tsx');
    const source = read('features', 'assistant', 'LiveAssistantScreen.tsx');

    expect(header).toContain(
      'accessibilityState={active === undefined ? undefined : { selected: active }}',
    );
    expect(source).not.toContain('pointerEvents="box-none"');
    expect(source).toContain('assistantPausedTextAccessibilityLabel');

    const pausedOverlay = source.slice(source.indexOf('function SessionPausedOverlay'));
    const pausedCardOpen =
      pausedOverlay.match(
        /<View\s+style=\{\{\s*backgroundColor: colors\.surface[\s\S]*?\}\}\s*>/,
      )?.[0] ?? '';
    expect(pausedCardOpen).not.toContain('accessible');
    expect(pausedCardOpen).not.toContain('accessibilityLabel');
  });

  it('uses the source-owned assistant accessibility helpers for custom labels', () => {
    const helper = read('lib', 'assistant', 'accessibility.ts');
    const header = read('features', 'assistant', 'AssistantHeader.tsx');
    const mode = read('features', 'assistant', 'ModeSheet.tsx');
    const source = read('features', 'assistant', 'LiveAssistantScreen.tsx');

    expect(helper).toContain('assistantHeaderAccessibilityLabel');
    expect(helper).toContain('assistantModeAccessibilityLabel');
    expect(helper).toContain('assistantDetectionAccessibilityLabel');
    expect(header).toContain('assistantHeaderAccessibilityLabel');
    expect(mode).toContain('assistantModeAccessibilityLabel');
    expect(source).toContain('assistantDetectionAccessibilityLabel');
  });
});
