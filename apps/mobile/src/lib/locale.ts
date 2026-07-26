import { getLocales } from 'expo-localization';
import { create } from 'zustand';
import { createTranslator, type Locale } from '@kitchen/i18n';

function deviceLocale(): Locale {
  const tag = getLocales()[0]?.languageCode ?? 'en';
  return tag.startsWith('ar') ? 'ar' : 'en';
}

interface LocaleState {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

/**
 * Single source of truth for the active language. Screens read `t` from here so
 * no component ever hard-codes a user-facing string.
 */
export const useLocaleStore = create<LocaleState>((set) => ({
  locale: deviceLocale(),
  setLocale: (locale) => set({ locale }),
}));

export function useLocale() {
  const locale = useLocaleStore((state) => state.locale);
  const setLocale = useLocaleStore((state) => state.setLocale);
  return { locale, setLocale, t: createTranslator(locale) };
}
