import { IMAGE_JPEG_QUALITY, fitWithin } from './image';

export type EncodeSource = HTMLVideoElement | Blob;

/**
 * Re-encode a captured frame or a picked file to a 1024px-edge JPEG.
 *
 * A `<video>` frame is already upright. A file picked from disk carries its
 * rotation in EXIF, and a naive canvas draw would emit sideways pixels, so it
 * is read with `imageOrientation: 'from-image'`, baking rotation into the
 * bitmap first. Both paths converge on one canvas encode, so the output is
 * always `image/jpeg`.
 *
 * This touches canvas and `createImageBitmap`, neither of which jsdom
 * implements, so it is exercised by the manual hardware gate, not a unit test —
 * the component injects a stub. The pure `fitWithin` maths it depends on is
 * unit-tested in `image.spec.ts`.
 */
export async function encodeResized(source: EncodeSource): Promise<Blob> {
  let width: number;
  let height: number;
  let draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void;

  if (source instanceof Blob) {
    const bitmap = await createImageBitmap(source, { imageOrientation: 'from-image' });
    width = bitmap.width;
    height = bitmap.height;
    draw = (ctx, w, h) => ctx.drawImage(bitmap, 0, 0, w, h);
  } else {
    width = source.videoWidth;
    height = source.videoHeight;
    draw = (ctx, w, h) => ctx.drawImage(source, 0, 0, w, h);
  }

  const fit = fitWithin(width, height);
  const canvas = document.createElement('canvas');
  canvas.width = fit.width;
  canvas.height = fit.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d context unavailable');
  draw(ctx, fit.width, fit.height);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', IMAGE_JPEG_QUALITY),
  );
  if (!blob) throw new Error('canvas encode produced no blob');
  return blob;
}
