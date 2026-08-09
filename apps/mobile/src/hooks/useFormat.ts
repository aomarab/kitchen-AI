import { useLocale, type LocaleTools } from '../lib/locale';
import { useSettingsStore } from '../stores/settings';
import type { NumeralPrefs } from '../lib/format';

export interface FormatTools extends LocaleTools {
  prefs: NumeralPrefs;
  showHijri: boolean;
}

/**
 * One hook for everything a screen needs to render localised content: the
 * translator, direction, numeral preference and the Hijri toggle. Keeps screens
 * from reaching into multiple stores.
 */
export function useFormat(): FormatTools {
  const base = useLocale();
  const easternNumerals = useSettingsStore((state) => state.easternNumerals);
  const showHijri = useSettingsStore((state) => state.showHijri);
  return { ...base, prefs: { easternNumerals }, showHijri };
}
