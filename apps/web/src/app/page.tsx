'use client';

import { useLocale } from '../lib/locale';

export default function HomePage() {
  const { t, locale, setLocale } = useLocale();

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-start justify-center gap-4 p-8">
      <h1 className="text-3xl font-semibold">{t('common.appName')}</h1>
      <p className="text-muted-foreground">{t('common.loading')}</p>
      <button
        type="button"
        className="rounded-md border border-border px-4 py-2 text-sm"
        onClick={() => setLocale(locale === 'ar' ? 'en' : 'ar')}
      >
        {locale === 'ar' ? 'English' : 'العربية'}
      </button>
    </main>
  );
}
