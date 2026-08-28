import { describe, expect, it } from 'vitest';
import { IMAGE_JPEG_QUALITY, MAX_IMAGE_EDGE_PX, fitWithin } from './image';

describe('fitWithin', () => {
  it('caps the longest edge at 1024', () => {
    expect(fitWithin(4000, 2000)).toEqual({ width: 1024, height: 512 });
    expect(fitWithin(2000, 4000)).toEqual({ width: 512, height: 1024 });
  });

  it('preserves aspect ratio', () => {
    const { width, height } = fitWithin(3000, 2000);
    expect(width / height).toBeCloseTo(1.5, 2);
  });

  it('never upscales a small image', () => {
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
  });
});

describe('capture constants', () => {
  it('uses the resize target the model-routing spec mandates', () => {
    expect(MAX_IMAGE_EDGE_PX).toBe(1024);
    expect(IMAGE_JPEG_QUALITY).toBe(0.7);
  });
});
