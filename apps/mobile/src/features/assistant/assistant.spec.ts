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

  it('opens the standalone assistant route in text mode', () => {
    const source = read('app', 'assistant.tsx');

    expect(source).toContain('initialMode="text"');
  });

  it('renders the demo badge from an isMock value outside mode branches', () => {
    const source = read('features', 'assistant', 'LiveAssistantScreen.tsx');
    const badge = source.indexOf('const demoBadge = isMock ?');
    const firstModeBranch = source.indexOf("mode === 'live' && !cameraReady");
    const render = source.indexOf('{demoBadge}');

    expect(badge, 'demo badge must be derived directly from isMock').toBeGreaterThanOrEqual(0);
    expect(render, 'demo badge must render before the mode content branch').toBeGreaterThan(badge);
    expect(render, 'demo badge must not live inside a mode branch').toBeLessThan(firstModeBranch);
  });

  it('does not render structured recipe replies or starter action chips', () => {
    const source = read('features', 'assistant', 'LiveAssistantScreen.tsx');

    expect(source).not.toContain('RecipeThumb');
    expect(source).not.toContain('Start cooking');
    expect(source).not.toContain('Swap the eggs');
    expect(source).not.toContain('Double it');
    expect(source).not.toContain('Add feta');
  });

  it('uses the shared RoundButton instead of a duplicate local copy', () => {
    const source = read('features', 'assistant', 'LiveAssistantScreen.tsx');

    expect(source).not.toMatch(/function\s+RoundButton\b/);
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
  });

  it('centres the locked voice demo badge with the panel content', () => {
    const header = read('features', 'assistant', 'AssistantHeader.tsx');
    const screen = read('features', 'assistant', 'LiveAssistantScreen.tsx');

    expect(header).toContain("alignSelf: centered ? 'center' : 'flex-start'");
    expect(screen).toContain('centered={lockMode}');
  });
});
