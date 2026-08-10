'use client';

import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError } from '@kitchen/api-client';
import { useLocale } from '../../lib/locale';
import { useFeedbackStats } from '../../hooks/admin';
import { ErrorState, Spinner } from '../ui/states';

/**
 * Not a security boundary — `StaffGuard` on the API is. This only decides what
 * to paint, by asking the server a question only staff can answer.
 */
export function AdminGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { t } = useLocale();
  const probe = useFeedbackStats();
  const error = probe.error;
  // A transport failure is not an answer. Only the server saying FORBIDDEN
  // means "not staff"; a timeout or a 500 must stay retryable, or a blip
  // becomes an unrecoverable access-denied screen.
  const denied =
    error instanceof ApiError && (error.code === 'FORBIDDEN' || error.code === 'UNAUTHENTICATED');

  useEffect(() => {
    if (!(error instanceof ApiError)) return;
    if (error.code === 'UNAUTHENTICATED') router.replace('/sign-in');
    else if (error.code === 'FORBIDDEN') router.replace('/');
  }, [error, router]);

  if (probe.isSuccess) return <>{children}</>;

  if (probe.isError && !denied) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <ErrorState error={error} onRetry={() => void probe.refetch()} />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center gap-3 text-sm text-muted-foreground">
      {probe.isError ? <p>{t('web.admin.forbidden')}</p> : <Spinner />}
    </div>
  );
}
