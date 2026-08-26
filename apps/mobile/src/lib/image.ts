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
 * `fitWithin` caps the longest edge, but only the **longer** fitted edge is
 * handed to the manipulator — the library derives the other to preserve the
 * true aspect ratio (`expo-image-manipulator` ResizeOptions: "If you specify
 * only one value, the other will be calculated automatically to preserve image
 * ratio."). This matters because the manipulator bakes EXIF rotation into the
 * pixels: if it rotates before resizing and we had pinned *both* pre-rotation
 * axes, the output would be forced onto the wrong dimensions and stretched. An
 * upright-but-distorted image would still pass the manual "is it upright?" gate,
 * so we make distortion structurally impossible rather than relying on the gate.
 *
 * Guard: if either dimension is unknown (zero, negative, or not finite — which
 * expo-image-picker documents as possible when the OS omits metadata), fall back
 * to width-only capping. That still shrinks a full camera frame by roughly an
 * order of magnitude and keeps the upload under the server's 2 MB ceiling.
 * The trade-off: a portrait frame in this case lands at a ~1365px long edge
 * rather than the ideal 1024px. This is a deliberate degradation; it is not a
 * reappearance of the orientation bug fixed previously.
 */
export async function resizeForUpload(uri: string, width: number, height: number): Promise<string> {
  const knownDims =
    Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0;
  let resize: { width?: number; height?: number };
  if (knownDims) {
    const fitted = fitWithin(width, height);
    // Specify only the longer fitted edge; the manipulator preserves the ratio
    // whichever way it rotates the pixels, so the image is never stretched.
    resize = fitted.width >= fitted.height ? { width: fitted.width } : { height: fitted.height };
  } else {
    resize = { width: MAX_IMAGE_EDGE_PX };
  }
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize }],
    { compress: IMAGE_JPEG_QUALITY, format: ImageManipulator.SaveFormat.JPEG },
  );
  return result.uri;
}
