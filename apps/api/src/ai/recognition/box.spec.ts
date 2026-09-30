import { describe, expect, it } from 'vitest';
import { normalizedBoxSchema } from '@kitchen/contracts';
import { sanitizeBox } from './box.js';

describe('sanitizeBox', () => {
  it('passes a clean box through unchanged', () => {
    expect(sanitizeBox({ x: 0.1, y: 0.2, w: 0.3, h: 0.4 })).toEqual({
      x: 0.1,
      y: 0.2,
      w: 0.3,
      h: 0.4,
    });
  });

  it('returns null for no box', () => {
    expect(sanitizeBox(null)).toBeNull();
    expect(sanitizeBox(undefined)).toBeNull();
  });

  it('rejects non-finite values', () => {
    expect(sanitizeBox({ x: Number.NaN, y: 0.2, w: 0.3, h: 0.4 })).toBeNull();
    expect(sanitizeBox({ x: 0.1, y: 0.2, w: Number.POSITIVE_INFINITY, h: 0.4 })).toBeNull();
  });

  it('never rescales a box written in another scale', () => {
    // 0..1000 is the most common wrong answer from vision models.
    expect(sanitizeBox({ x: 120, y: 80, w: 300, h: 240 })).toBeNull();
    expect(sanitizeBox({ x: 0.1, y: 0.2, w: 1.2, h: 0.4 })).toBeNull();
    expect(sanitizeBox({ x: -0.2, y: 0.2, w: 0.3, h: 0.4 })).toBeNull();
  });

  it('clamps a slightly negative origin, keeping the far edge where the model drew it', () => {
    const box = sanitizeBox({ x: -0.03, y: 0.1, w: 0.33, h: 0.2 })!;
    expect(box.x).toBe(0);
    expect(box.w).toBeCloseTo(0.3, 10);
  });

  it('clips a box that runs just past the right and bottom edges', () => {
    const box = sanitizeBox({ x: 0.8, y: 0.9, w: 0.24, h: 0.14 })!;
    expect(box.w).toBeCloseTo(0.2, 10);
    expect(box.h).toBeCloseTo(0.1, 10);
  });

  it('rejects a box too thin to point at anything', () => {
    expect(sanitizeBox({ x: 0.5, y: 0.5, w: 0.01, h: 0.3 })).toBeNull();
    // Clipping can make a box thin too: this one is almost wholly off-frame.
    expect(sanitizeBox({ x: 0.99, y: 0.5, w: 0.05, h: 0.3 })).toBeNull();
  });

  it('rejects a box that covers the whole frame', () => {
    expect(sanitizeBox({ x: 0, y: 0, w: 1, h: 0.95 })).toBeNull();
  });

  it('always returns something the client contract accepts', () => {
    const inputs = [
      { x: 0.8, y: 0.9, w: 0.24, h: 0.14 },
      { x: -0.05, y: -0.05, w: 1.05, h: 0.5 },
      { x: 0.3333333, y: 0.6666667, w: 0.6666667, h: 0.3333333 },
    ];
    for (const raw of inputs) {
      const box = sanitizeBox(raw);
      if (box) expect(normalizedBoxSchema.safeParse(box).success, JSON.stringify(raw)).toBe(true);
    }
  });
});
