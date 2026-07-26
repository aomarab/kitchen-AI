import { getLocales } from 'expo-localization';
import { create } from 'zustand';
import {
  createTranslator,
  directionFor,
  type Direction,
  type Locale,
  type Translator,
} from '@kitchen/i18n';
import { readJson, writeJson } from './storage';

const PERSIST_KEY = 'locale';

function deviceLocale(): Locale {
  const tag = getLocales()[0]?.languageCode ?? 'en';
  return tag.startsWith('ar') ? 'ar' : 'en';
}

interface LocaleState {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  hydrate: () => Promise<void>;
}

/**
 * Single source of truth for the active language. Defaults to the device locale
 * and is user-overridable; the choice is persisted so it survives restarts.
 * Screens read `t` from `useLocale()` so no component hard-codes a string.
 */
export const useLocaleStore = create<LocaleState>((set) => ({
  locale: deviceLocale(),
  setLocale: (locale) => {
    set({ locale });
    void writeJson(PERSIST_KEY, { locale });
  },
  hydrate: async () => {
    const saved = await readJson<{ locale: Locale }>(PERSIST_KEY);
    if (saved?.locale === 'ar' || saved?.locale === 'en') set({ locale: saved.locale });
  },
}));

export interface LocaleTools {
  locale: Locale;
  dir: Direction;
  setLocale: (locale: Locale) => void;
  t: Translator;
}

export function useLocale(): LocaleTools {
  const locale = useLocaleStore((state) => state.locale);
  const setLocale = useLocaleStore((state) => state.setLocale);
  return { locale, setLocale, dir: directionFor(locale), t: createTranslator(locale) };
}
