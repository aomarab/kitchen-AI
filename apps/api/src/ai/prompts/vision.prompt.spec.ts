import { describe, expect, it } from 'vitest';
import { buildVisionPrompt, VISION_PROMPT_VERSION } from './vision.prompt.js';

describe('vision prompt', () => {
  it('is the version that asks for boxes', () => {
    expect(VISION_PROMPT_VERSION).toBe('vision/v2');
    expect(buildVisionPrompt({ locale: 'en' }).version).toBe('vision/v2');
  });

  it('asks for a box in the output shape and defines its coordinate space', () => {
    const { system } = buildVisionPrompt({ locale: 'en' });
    expect(system).toContain('"box"');
    expect(system).toContain('fractions (0–1)');
    expect(system).toContain('origin top-left');
    expect(system).toContain('Use null if you cannot localise it');
  });

  it('asks for boxes in Arabic sessions too', () => {
    expect(buildVisionPrompt({ locale: 'ar' }).system).toContain('"box"');
  });
});
