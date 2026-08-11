import { directionFor, type Locale } from '@kitchen/i18n';

/** The slice of `I18nManager` this needs, so it can be tested without React Native. */
export interface DirectionManager {
  readonly isRTL: boolean;
  allowRTL: (value: boolean) => void;
  forceRTL: (value: boolean) => void;
}

/**
 * Applies layout direction for a locale, returning `true` when the native flag
 * actually changed (the caller then has to ask the user to restart — RN only
 * picks the new direction up at launch).
 *
 * The subtlety is that `I18nManager.isRTL` is frozen at launch: it keeps
 * reporting the boot value even after `forceRTL` has written a new one. Reading
 * it on every call meant a second change within one session was silently
 * dropped — an Arabic user who switched to English and back again wrote
 * `forceRTL(false)`, then compared `ar` against the *stale* `true` and skipped
 * `forceRTL(true)`, so the next launch came up LTR with Arabic text. Remember
 * what was written instead, and only fall back to `isRTL` before the first write.
 */
export function createDirectionApplier(manager: DirectionManager): (locale: Locale) => boolean {
  let applied: boolean | null = null;

  return (locale: Locale): boolean => {
    const rtl = directionFor(locale) === 'rtl';
    const current = applied ?? manager.isRTL;
    if (current === rtl) return false;
    applied = rtl;
    manager.allowRTL(rtl);
    manager.forceRTL(rtl);
    return true;
  };
}
