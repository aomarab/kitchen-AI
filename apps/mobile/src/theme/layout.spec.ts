import { describe, expect, it } from 'vitest';
import { MAX_CONTENT_WIDTH, TABLET_BREAKPOINT, contentMaxWidth } from './layout';

describe('contentMaxWidth', () => {
  it('runs full bleed on every phone', () => {
    expect(contentMaxWidth(320)).toBeUndefined();
    expect(contentMaxWidth(390)).toBeUndefined();
    expect(contentMaxWidth(440)).toBeUndefined();
  });

  it('caps the measure on a tablet in either orientation', () => {
    expect(contentMaxWidth(834)).toBe(MAX_CONTENT_WIDTH); // iPad portrait
    expect(contentMaxWidth(1194)).toBe(MAX_CONTENT_WIDTH); // iPad landscape
    expect(contentMaxWidth(1032)).toBe(MAX_CONTENT_WIDTH); // 13-inch portrait
  });

  it('treats a narrow split-view pane as a phone', () => {
    // The rule keys off the window, not the device. A 507pt Split View pane on
    // an iPad must render exactly like a phone, and a resized Stage Manager
    // window must re-evaluate as it is dragged.
    expect(contentMaxWidth(507)).toBeUndefined();
  });

  it('pins the breakpoint boundary', () => {
    expect(contentMaxWidth(TABLET_BREAKPOINT - 1)).toBeUndefined();
    expect(contentMaxWidth(TABLET_BREAKPOINT)).toBe(MAX_CONTENT_WIDTH);
  });
});
