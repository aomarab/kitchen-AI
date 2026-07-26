'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { createTranslator, directionFor, type Locale, type Translator } from '@kitchen/i18n';
import { LOCALE_COOKIE } from './locale.shared';

interface LocaleContextValue {
  locale: Locale;
  dir: 'ltr' | 'rtl';
  t: Translator;
  setLocale: (next: Locale) => void;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      dir: directionFor(locale),
      t: createTranslator(locale),
      setLocale: (next) => {
        // A full reload is intentional: `dir` and `lang` live on <html>, which is
        // server-rendered, so the document has to be re-requested to mirror.
        document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
        window.location.reload();
      },
    }),
    [locale],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const value = useContext(LocaleContext);
  if (!value) throw new Error('useLocale must be used inside <LocaleProvider>');
  return value;
}
