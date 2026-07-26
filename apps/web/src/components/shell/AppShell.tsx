'use client';

import { useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { useLocale } from '../../lib/locale';
import { Sidebar, SidebarContent } from './Sidebar';
import { activeLabel } from './nav';
import { IconButton } from '../ui/IconButton';
import { LocaleToggle } from './LocaleToggle';
import { CloseIcon } from '../ui/icons';

function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
      <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
    </svg>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { t } = useLocale();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-muted/30">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-2 focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
      >
        {t('web.skipToContent')}
      </a>

      <Sidebar />

      {menuOpen ? (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <button
            type="button"
            aria-label={t('common.close')}
            className="absolute inset-0 bg-foreground/40"
            onClick={() => setMenuOpen(false)}
          />
          <div className="relative z-10 h-full w-72 border-e border-border bg-background">
            <div className="flex justify-end p-2">
              <IconButton label={t('common.close')} onClick={() => setMenuOpen(false)}>
                <CloseIcon />
              </IconButton>
            </div>
            <SidebarContent onNavigate={() => setMenuOpen(false)} />
          </div>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-border bg-background/90 px-4 py-3 backdrop-blur md:px-8">
          <IconButton label={t('web.nav.primary')} className="md:hidden" onClick={() => setMenuOpen(true)}>
            <MenuIcon />
          </IconButton>
          <h1 className="text-lg font-semibold">{t(activeLabel(pathname))}</h1>
          <div className="ms-auto md:hidden">
            <LocaleToggle />
          </div>
        </header>

        <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 md:px-8 md:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
