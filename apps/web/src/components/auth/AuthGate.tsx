'use client';

import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale } from '../../lib/locale';
import { api } from '../../lib/api';
import { useMocksReady } from '../../mocks/provider';
import { useSession } from '../../stores/session';
import { Spinner } from '../ui/states';

/**
 * Resolves the persisted session exactly once. A stored token is rehydrated by
 * fetching the user and their households; anything else — no token, an expired
 * token — resolves to unauthenticated. There is no default household, so a
 * fresh visitor is genuinely signed out.
 */
function useResolveSession() {
  const ready = useMocksReady();
  const status = useSession((s) => s.status);

  useEffect(() => {
    if (!ready || status !== 'loading') return;
    let cancelled = false;

    void (async () => {
      const tokens = await api.tokenStore.get();
      if (!tokens) {
        if (!cancelled) useSession.getState().markUnauthenticated();
        return;
      }
      try {
        const [user, households] = await Promise.all([
          api.call('getMe'),
          api.call('listHouseholds'),
        ]);
        if (!cancelled) useSession.getState().hydrate(user, households.map((h) => h.id));
      } catch {
        if (cancelled) return;
        await api.tokenStore.set(null);
        useSession.getState().clear();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [ready, status]);
}

function GateFallback({ label }: { label: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center gap-3 text-sm text-muted-foreground">
      <Spinner />
      <span>{label}</span>
    </div>
  );
}

/**
 * Guards the authenticated shell in a single place (spec §6.1): no session
 * redirects to sign-in; a session without a household redirects to the
 * create-or-join setup screen. Only renders children once both hold.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const { t } = useLocale();
  const router = useRouter();
  const status = useSession((s) => s.status);
  const householdId = useSession((s) => s.householdId);
  useResolveSession();

  const needsHousehold = status === 'authenticated' && householdId === null;

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/sign-in');
    else if (needsHousehold) router.replace('/setup');
  }, [status, needsHousehold, router]);

  if (status === 'unauthenticated' || needsHousehold) {
    return <GateFallback label={t('common.loading')} />;
  }

  return <>{children}</>;
}
