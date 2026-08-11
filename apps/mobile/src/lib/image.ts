import * as ImageManipulator from 'expo-image-manipulator';

/**
 * Vision models are billed on image dimensions, not file size, so capturing at
 * `quality: 0.6` saved bandwidth and nothing else. A 1024px long edge is enough
 * to recognise jars and packets on a shelf and costs a fraction of a full frame.
 *
 * Duplicated by whatever builds the web capture upload, which does not exist
 * yet: this is a capture concern and neither app should reach into the other.
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

/**
 * Resize a captured photo before upload and return the new local URI.
 *
 * Passing only the long edge lets the manipulator derive the other side, which
 * keeps the aspect ratio exact. The manipulator also bakes EXIF rotation into
 * the pixels: a sideways shelf recognises worse than an upright one, so an
 * orientation-losing resize would spend the saving back on accuracy.
 */
export async function resizeForUpload(uri: string): Promise<string> {
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: MAX_IMAGE_EDGE_PX } }],
    { compress: IMAGE_JPEG_QUALITY, format: ImageManipulator.SaveFormat.JPEG },
  );
  return result.uri;
}
