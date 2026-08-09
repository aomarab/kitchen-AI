'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLocale } from '../../lib/locale';
import { cn } from '../../lib/cn';

const TABS = [
  { href: '/sign-in', label: 'auth.signIn' },
  { href: '/sign-up', label: 'auth.signUp' },
] as const;

/**
 * Sign in and create account are one panel with two tabs. They stay separate
 * routes so the URLs remain linkable and `AuthGate`'s redirect to `/sign-in`
 * keeps working — `Link` navigates client-side, so the card never reloads and
 * the pair reads as a single page. Links carry `aria-current`, not `role="tab"`:
 * the ARIA tab pattern promises a `tabpanel` in the same document, and these
 * navigate instead.
 */
export function AuthTabs() {
  const { t } = useLocale();
  const pathname = usePathname();

  return (
    <nav aria-label={t('web.auth.tabsLabel')} className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
      {TABS.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'rounded-md px-3 py-1.5 text-center text-sm font-medium transition',
              active ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {t(tab.label)}
          </Link>
        );
      })}
    </nav>
  );
}
