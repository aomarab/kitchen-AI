'use client';

import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError } from '@kitchen/api-client';
import { useLocale } from '../../lib/locale';
import { useFeedbackStats } from '../../hooks/admin';
import { Spinner } from '../ui/states';

/**
 * Not a security boundary — `StaffGuard` on the API is. This only decides what
 * to paint, by asking the server a question only staff can answer.
 */
export function AdminGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { t } = useLocale();
  const probe = useFeedbackStats();
  const error = probe.error;

  useEffect(() => {
    if (!(error instanceof ApiError)) return;
    if (error.code === 'UNAUTHENTICATED') router.replace('/sign-in');
    else if (error.code === 'FORBIDDEN') router.replace('/');
  }, [error, router]);

  if (probe.isSuccess) return <>{children}</>;

  return (
    <div className="flex min-h-screen items-center justify-center gap-3 text-sm text-muted-foreground">
      {probe.isError ? <p>{t('web.admin.forbidden')}</p> : <Spinner />}
    </div>
  );
}
