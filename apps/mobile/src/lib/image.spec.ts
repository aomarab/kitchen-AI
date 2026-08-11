import { describe, expect, it } from 'vitest';
import { fitWithin, IMAGE_JPEG_QUALITY, MAX_IMAGE_EDGE_PX } from './image';

describe('fitWithin', () => {
  it('scales a landscape camera frame down to the long edge', () => {
    // A typical phone camera frame.
    expect(fitWithin(4032, 3024)).toEqual({ width: 1024, height: 768 });
  });

  it('scales a portrait frame down to the long edge', () => {
    expect(fitWithin(3024, 4032)).toEqual({ width: 768, height: 1024 });
  });

  it('never upscales an image that is already small', () => {
    // Upscaling would cost more tokens for no extra detail.
    expect(fitWithin(640, 480)).toEqual({ width: 640, height: 480 });
  });

  it('leaves an image exactly at the ceiling alone', () => {
    expect(fitWithin(1024, 1024)).toEqual({ width: 1024, height: 1024 });
  });

  it('preserves aspect ratio within a pixel', () => {
    const out = fitWithin(4000, 2250);
    expect(out.width / out.height).toBeCloseTo(4000 / 2250, 2);
  });

  it('rounds to whole pixels', () => {
    const out = fitWithin(4032, 3024);
    expect(Number.isInteger(out.width)).toBe(true);
    expect(Number.isInteger(out.height)).toBe(true);
  });

  it('pins the spec values', () => {
    // Pinned so a later change has to be deliberate: these two numbers set the
    // per-call vision cost, and the web capture path will have to match them
    // when it is eventually built.
    expect(MAX_IMAGE_EDGE_PX).toBe(1024);
    expect(IMAGE_JPEG_QUALITY).toBe(0.7);
  });
});
