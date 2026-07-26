'use client';

import Link from 'next/link';
import { useLocale } from '../../lib/locale';
import { LocaleToggle } from '../shell/LocaleToggle';

export function AuthBrand() {
  const { t } = useLocale();
  return (
    <header className="flex items-center justify-between px-4 py-4 sm:px-8">
      <Link href="/sign-in" className="flex items-center gap-2">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary font-bold text-primary-foreground">
          K
        </span>
        <span className="font-semibold">{t('common.appName')}</span>
      </Link>
      <LocaleToggle />
    </header>
  );
}
