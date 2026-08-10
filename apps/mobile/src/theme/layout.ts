/**
 * Screen-size adaptation.
 *
 * Every decision here keys off the live window width rather than the device,
 * so iPad portrait, iPad landscape, Split View, Slide Over and Stage Manager
 * resizing are all the same case — a window narrower than the breakpoint
 * renders exactly like a phone, with no device checks anywhere.
 */

/** Below this the app is phone-shaped and runs full bleed. */
export const TABLET_BREAKPOINT = 700;

/** A comfortable measure. Wider than this and the eye loses the line. */
export const MAX_CONTENT_WIDTH = 640;

/**
 * The cap to apply to a screen's content, or `undefined` for full bleed.
 */
export function contentMaxWidth(width: number): number | undefined {
  return width >= TABLET_BREAKPOINT ? MAX_CONTENT_WIDTH : undefined;
}
