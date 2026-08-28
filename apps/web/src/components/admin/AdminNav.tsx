'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLocale } from '../../lib/locale';

const TABS = [
  { href: '/admin', key: 'web.admin.navFeedback' },
  { href: '/admin/products', key: 'web.admin.navProducts' },
  { href: '/admin/credits', key: 'web.admin.navCredits' },
] as const;

/**
 * Two audiences share this console: the app's own feedback, and reviews of the
 * products people buy. Without a way across, the second is reachable only by
 * typing the URL.
 */
export function AdminNav() {
  const { t } = useLocale();
  const pathname = usePathname();

  return (
    <nav className="mx-auto flex w-full max-w-5xl gap-2 pb-4" aria-label={t('web.admin.title')}>
      {TABS.map((tab) => {
        // Exact match: `/admin` is a prefix of every admin route, so
        // `startsWith` would light both tabs on the products page.
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className={`rounded-md px-3 py-2 text-sm transition ${
              active ? 'bg-primary-soft text-primary-text' : 'text-muted-foreground hover:bg-muted'
            }`}
          >
            {t(tab.key)}
          </Link>
        );
      })}
    </nav>
  );
}
