'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLocale } from '../../lib/locale';
import { cn } from '../../lib/cn';
import { ACCOUNT_NAV, PRIMARY_NAV, type NavItem } from './nav';
import { LocaleToggle } from './LocaleToggle';

function isActive(pathname: string, href: string): boolean {
  return href === '/' ? pathname === '/' : pathname.startsWith(href);
}

function NavLink({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  const pathname = usePathname();
  const { t } = useLocale();
  const active = isActive(pathname, item.href);
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition',
        active ? 'bg-primary-soft text-primary-text' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      <Icon className={cn('h-5 w-5', active && 'text-primary-text')} />
      <span>{t(item.labelKey)}</span>
    </Link>
  );
}

export function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useLocale();
  return (
    <div className="flex h-full flex-col gap-6 p-4">
      <div className="flex items-center gap-2 px-2 py-1">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-primary-foreground font-bold">
          K
        </span>
        <div className="leading-tight">
          <p className="font-semibold">{t('common.appName')}</p>
          <p className="text-xs text-muted-foreground">{t('web.brand.tagline')}</p>
        </div>
      </div>

      <nav aria-label={t('web.nav.primary')} className="flex flex-col gap-1">
        {PRIMARY_NAV.map((item) => (
          <NavLink key={item.href} item={item} onNavigate={onNavigate} />
        ))}
      </nav>

      <nav aria-label={t('web.nav.account')} className="mt-auto flex flex-col gap-1">
        {ACCOUNT_NAV.map((item) => (
          <NavLink key={item.href} item={item} onNavigate={onNavigate} />
        ))}
        <div className="mt-2 px-1">
          <LocaleToggle block />
        </div>
      </nav>
    </div>
  );
}

/** Persistent sidebar for md+ screens. Sits at the inline-start edge. */
export function Sidebar() {
  return (
    <aside className="hidden w-64 shrink-0 border-e border-border bg-background md:block">
      <div className="sticky top-0 h-screen overflow-y-auto">
        <SidebarContent />
      </div>
    </aside>
  );
}
