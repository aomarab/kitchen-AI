'use client';

import Link from 'next/link';
import { translateErrorKey } from '@kitchen/i18n';
import { useLocale } from '../../lib/locale';
import { resolveErrorKey, isInsufficientCredits } from '../../lib/errors';
import { cn } from '../../lib/cn';
import { Button, buttonClasses } from './Button';

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      role="status"
      className={cn(
        'inline-block h-5 w-5 animate-spin rounded-full border-2 border-border border-t-primary',
        className,
      )}
    />
  );
}

export function LoadingState({ label }: { label?: string }) {
  const { t } = useLocale();
  return (
    <div className="flex items-center justify-center gap-3 py-12 text-sm text-muted-foreground">
      <Spinner />
      <span>{label ?? t('common.loading')}</span>
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border py-12 text-center">
      <p className="font-medium text-foreground">{title}</p>
      {hint ? <p className="max-w-sm text-sm text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/** Renders the localized message behind an error envelope, with an optional retry. */
export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { t, locale } = useLocale();
  const outOfCredits = isInsufficientCredits(error);
  const message = translateErrorKey(locale, resolveErrorKey(error));
  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-3 rounded-2xl border border-danger bg-danger-soft py-10 text-center"
    >
      <p className="font-medium text-danger">
        {outOfCredits ? t('web.credits.outOfCreditsTitle') : t('web.states.errorTitle')}
      </p>
      <p className="max-w-sm text-sm text-muted-foreground">{message}</p>
      {outOfCredits ? (
        <Link href="/settings" className={buttonClasses({ variant: 'outline', size: 'sm' })}>
          {t('web.credits.getMore')}
        </Link>
      ) : onRetry ? (
        <Button variant="outline" size="sm" onClick={onRetry}>
          {t('common.retry')}
        </Button>
      ) : null}
    </div>
  );
}
