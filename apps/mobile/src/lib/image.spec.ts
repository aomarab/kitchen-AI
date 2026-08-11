import { beforeEach, describe, expect, it } from 'vitest';
import {
  lastManipulatorActions,
  resetManipulatorCalls,
} from '../mocks/expo-image-manipulator';
import { fitWithin, IMAGE_JPEG_QUALITY, MAX_IMAGE_EDGE_PX, resizeForUpload } from './image';

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

describe('resizeForUpload', () => {
  beforeEach(() => resetManipulatorCalls());

  it('caps the longest edge on a portrait frame (height is the long side)', async () => {
    // 3024×4032 portrait — the old width-only implementation would produce
    // resize({ width: 1024 }) leaving height at ~1365, over the cap.
    await resizeForUpload('file://portrait.jpg', 3024, 4032);
    expect(lastManipulatorActions).toEqual([{ resize: { width: 768, height: 1024 } }]);
  });

  it('caps the longest edge on a landscape frame (width is the long side)', async () => {
    await resizeForUpload('file://landscape.jpg', 4032, 3024);
    expect(lastManipulatorActions).toEqual([{ resize: { width: 1024, height: 768 } }]);
  });

  it('does not upscale a small image', async () => {
    await resizeForUpload('file://small.jpg', 640, 480);
    expect(lastManipulatorActions).toEqual([{ resize: { width: 640, height: 480 } }]);
  });

  it('returns the uri from the manipulator', async () => {
    const uri = await resizeForUpload('file://photo.jpg', 4032, 3024);
    expect(uri).toBe('file://photo.jpg');
  });
  it('falls back to width-only cap when dimensions are zero (OS omitted metadata)', async () => {
    // expo-image-picker documents width/height as possibly 0 when the OS does
    // not provide them. fitWithin(0,0) would return {width:0,height:0} — a
    // corrupt resize. The guard must catch this and use width-only instead.
    await resizeForUpload('file://unknown-dims.jpg', 0, 0);
    expect(lastManipulatorActions).toEqual([{ resize: { width: MAX_IMAGE_EDGE_PX } }]);
  });

  it('falls back to width-only cap for negative or non-finite dimensions', async () => {
    await resizeForUpload('file://bad-dims.jpg', -1, Infinity);
    expect(lastManipulatorActions).toEqual([{ resize: { width: MAX_IMAGE_EDGE_PX } }]);
  });
});
