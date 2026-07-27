'use client';

import { useEffect, type ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { useLocale } from '../../lib/locale';
import { IconButton } from './IconButton';
import { CloseIcon } from './icons';

/**
 * Slide-over panel anchored to the inline-end edge, so it opens from the right
 * in English and the left in Arabic automatically (logical `end-0`).
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const { t } = useLocale();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      <button
        type="button"
        aria-label={t('common.close')}
        className="absolute inset-0 bg-foreground/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          'relative z-10 ms-auto flex h-full w-full max-w-lg flex-col border-s border-border bg-background shadow-xl',
        )}
      >
        <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
          <h2 className="text-lg font-semibold tracking-heading-sm">{title}</h2>
          <IconButton label={t('common.close')} onClick={onClose}>
            <CloseIcon />
          </IconButton>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer ? (
          <footer className="border-t border-border px-5 py-4">{footer}</footer>
        ) : null}
      </div>
    </div>
  );
}
