'use client';

import { usePathname } from 'next/navigation';
import { useLocale } from '../../lib/locale';
import type { MessageKey } from '@kitchen/i18n';

interface Copy {
  title: MessageKey;
  subtitle: MessageKey;
}

const COPY: Record<string, Copy> = {
  '/sign-in': { title: 'web.auth.signInTitle', subtitle: 'web.auth.signInSubtitle' },
  '/sign-up': { title: 'web.auth.signUpTitle', subtitle: 'web.auth.signUpSubtitle' },
  '/setup': { title: 'web.auth.householdTitle', subtitle: 'web.auth.householdSubtitle' },
};

/**
 * The navy band behind the auth card. The heading lives here rather than in
 * each form so there is exactly one `<h1>` per page and the band, not the
 * card, owns it — the card scrolls its own content underneath.
 */
export function AuthHero() {
  const { t } = useLocale();
  const pathname = usePathname();
  const copy = COPY[pathname];
  if (!copy) return null;

  return (
    <div className="px-4 pb-24 pt-6 sm:px-8">
      <div className="mx-auto max-w-md">
        <h1 className="text-3xl font-bold tracking-heading-lg text-inverse-foreground">{t(copy.title)}</h1>
        <p className="mt-2 text-inverse-muted">{t(copy.subtitle)}</p>
      </div>
    </div>
  );
}
