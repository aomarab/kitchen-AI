/**
 * The floating tab bar's geometry (spec §8.1): a 68pt capsule, 16pt in from
 * each side, 8pt above the home indicator. Pure, so the numbers every tab
 * screen pads by are the numbers the bar is drawn with.
 */
export const TAB_BAR_HEIGHT = 68;
export const TAB_BAR_SIDE_INSET = 16;
export const TAB_BAR_LIFT = 8;
/** Breathing room between the last row of content and the top of the bar. */
const CONTENT_GAP = 16;

/** Distance from the screen's bottom edge to the bottom of the bar. */
export function tabBarBottom(insetBottom: number): number {
  return insetBottom + TAB_BAR_LIFT;
}

/** How far a tab screen pads its scroll content so nothing ends under the bar. */
export function tabBarClearance(insetBottom: number): number {
  return tabBarBottom(insetBottom) + TAB_BAR_HEIGHT + CONTENT_GAP;
}

/** The tabs either side of the centre camera column. */
export function splitTabs<T>(routes: readonly T[]): { leading: T[]; trailing: T[] } {
  const middle = Math.floor(routes.length / 2);
  return { leading: routes.slice(0, middle), trailing: routes.slice(middle) };
}
