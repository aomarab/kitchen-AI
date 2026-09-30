import type { NormalizedBox, RawVisionBox } from '@kitchen/contracts';

/** How far past the frame a value may sit and still be read as rounding. */
const EDGE_TOLERANCE = 0.05;
/** Narrower than this is not a real localisation — a pin on a speck. */
const MIN_SIDE = 0.02;
/** The model boxed the whole frame, which says nothing about where the item is. */
const MAX_AREA = 0.9;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/**
 * Turns the model's box into one a client can draw, or `null` when it cannot be
 * trusted (vision spec §10.3).
 *
 * A value well outside 0..1 almost certainly means the model answered in
 * another scale — pixels, or 0..1000 — and it is dropped rather than rescaled on
 * a guess: a confident pin on the wrong item is worse than no pin, because the
 * tray still lists every item.
 */
export function sanitizeBox(raw: RawVisionBox | null | undefined): NormalizedBox | null {
  if (!raw) return null;
  const values = [raw.x, raw.y, raw.w, raw.h];
  if (!values.every(Number.isFinite)) return null;
  if (values.some((v) => v < -EDGE_TOLERANCE || v > 1 + EDGE_TOLERANCE)) return null;

  const x = clamp01(raw.x);
  const y = clamp01(raw.y);
  // Shrink by exactly what clamping the origin moved, so a box nudged past the
  // left edge keeps its right edge where the model drew it, then clip to the
  // frame. Written this way, an in-range box comes back bit-for-bit unchanged —
  // recomputing it from its far edge adds float drift (0.30000000000000004).
  const w = Math.min(raw.w - (x - raw.x), 1 - x);
  const h = Math.min(raw.h - (y - raw.y), 1 - y);

  if (w < MIN_SIDE || h < MIN_SIDE) return null;
  if (w * h > MAX_AREA) return null;
  return { x, y, w, h };
}
