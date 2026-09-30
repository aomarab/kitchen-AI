import { formatNumber, type Locale } from '@kitchen/i18n';
import type { NumeralPrefs } from './format';

function formatPart(
  locale: Locale,
  value: number,
  prefs: NumeralPrefs,
  minimumIntegerDigits = 1,
): string {
  return formatNumber(locale, value, {
    minimumIntegerDigits,
    maximumFractionDigits: 0,
    useGrouping: false,
    easternNumerals: prefs.easternNumerals,
  });
}

export function formatRecipeVideoDuration(
  locale: Locale,
  durationSeconds: number,
  prefs: NumeralPrefs = {},
): string {
  const totalSeconds = Math.max(0, Math.floor(durationSeconds));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const twoDigits = (value: number) => formatPart(locale, value, prefs, 2);

  if (hours > 0) {
    return `${formatPart(locale, hours, prefs)}:${twoDigits(minutes)}:${twoDigits(seconds)}`;
  }

  return `${formatPart(locale, minutes, prefs)}:${twoDigits(seconds)}`;
}
