/**
 * The J tab bar geometry (spec §8): a flat bar pinned to the bottom edge with
 * top padding, horizontal gutters and the device home-indicator inset inside
 * the bar itself. Pure helpers keep screen clearance aligned with the drawn bar.
 */
export const TAB_BAR_HEIGHT = 50;
export const TAB_BAR_SIDE_INSET = 0;
export const TAB_BAR_LIFT = 0;
export const TAB_BAR_HORIZONTAL_PADDING = 8;
export const TAB_BAR_TOP_PADDING = 6;
/** Breathing room between the last row of content and the top of the bar. */
const CONTENT_GAP = 16;

/** Distance from the screen's bottom edge to the bottom of the bar. */
export function tabBarBottom(_insetBottom: number): number {
  return 0;
}

/** How far a tab screen pads its scroll content so nothing ends under the bar. */
export function tabBarClearance(insetBottom: number): number {
  return insetBottom + TAB_BAR_HEIGHT + CONTENT_GAP;
}

/** The tabs either side of the centre scan column. */
export function splitTabs<T>(routes: readonly T[]): { leading: T[]; trailing: T[] } {
  const middle = Math.floor(routes.length / 2);
  return { leading: routes.slice(0, middle), trailing: routes.slice(middle) };
}
