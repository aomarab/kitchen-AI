/**
 * Vision models are billed on image dimensions, not file size, and the API
 * rejects a capture-purpose presign over 2 MB. A 1024px long edge recognises
 * jars and packets on a shelf and lands well under both limits.
 *
 * Duplicated from `apps/mobile/src/lib/image.ts` on purpose: capture is a
 * per-app concern (canvas here, expo-image-manipulator there) and neither app
 * reaches into the other. `image.spec.ts` guards these values against the
 * model-routing spec so the copies cannot drift.
 */
export const MAX_IMAGE_EDGE_PX = 1024;
export const IMAGE_JPEG_QUALITY = 0.7;

/** Fit within a square of `maxEdge`, preserving aspect ratio. Never upscales. */
export function fitWithin(
  width: number,
  height: number,
  maxEdge: number = MAX_IMAGE_EDGE_PX,
): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width, height };
  const scale = maxEdge / longest;
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}
