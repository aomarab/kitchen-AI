'use client';

import { formatDate, formatHijriDate } from '@kitchen/i18n';
import { useLocale } from '../../lib/locale';

/**
 * A Gregorian date, with the Hijri date shown alongside in Arabic (spec §7).
 * Both are rendered through `Intl` so numerals and month names localize.
 */
export function LocalizedDate({
  value,
  options,
  className,
}: {
  value: string | Date;
  options?: Intl.DateTimeFormatOptions;
  className?: string;
}) {
  const { locale } = useLocale();
  const gregorian = formatDate(locale, value, options);
  if (locale !== 'ar') return <span className={className}>{gregorian}</span>;
  return (
    <span className={className}>
      {gregorian}
      <span className="text-muted-foreground"> · {formatHijriDate(value)}</span>
    </span>
  );
}
