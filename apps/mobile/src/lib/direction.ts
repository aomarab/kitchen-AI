/** The slice of `I18nManager` this needs, so it can be tested without React Native. */
export interface DirectionManager {
  readonly isRTL: boolean;
  allowRTL: (value: boolean) => void;
  forceRTL: (value: boolean) => void;
}

/**
 * Pins the *native* layout direction to LTR, once, at startup.
 *
 * Direction used to be applied with `I18nManager.forceRTL`, which React Native
 * only honours at launch. Switching to Arabic re-rendered every string in
 * Arabic while the layout stayed LTR — rows, chevrons and paddings all still
 * mirrored for English — so the app looked broken and had to ask the user to
 * restart. The entire UI is written in logical properties (`start`/`end`,
 * `marginStart`, `writingDirection`), which is exactly what Yoga's `direction`
 * style resolves, so direction is now a style on the root view and flips live.
 *
 * The native flag still has to be neutralised, because it is persisted: anyone
 * who ran an older build has `forceRTL(true)` baked into their install, and RN
 * would then swap `left`/`right` underneath the explicit style and mirror
 * twice. Returns whether it had to write anything — only ever true once, on
 * the first launch after upgrading.
 */
export function normalizeNativeDirection(manager: DirectionManager): boolean {
  if (!manager.isRTL) return false;
  manager.allowRTL(false);
  manager.forceRTL(false);
  return true;
}
