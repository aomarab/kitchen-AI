import { cookies } from 'next/headers';
import { directionFor, type Locale } from '@kitchen/i18n';
import { LOCALE_COOKIE } from './locale.shared';

export { LOCALE_COOKIE };

function parse(value: string | undefined): Locale {
  return value === 'ar' ? 'ar' : 'en';
}

/** Active locale for the current request, read from the locale cookie. */
export async function getRequestLocale(): Promise<Locale> {
  const store = await cookies();
  return parse(store.get(LOCALE_COOKIE)?.value);
}

export async function getRequestDirection() {
  return directionFor(await getRequestLocale());
}
