'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { translateErrorKey } from '@kitchen/i18n';
import type { HouseholdMember } from '@kitchen/contracts';
import { useLocale } from '../../lib/locale';
import { resolveErrorKey } from '../../lib/errors';
import { deleteConfirmationWord, matchesDeleteConfirmation } from '../../lib/delete-confirmation';
import { useMe, useHouseholds, useDeleteAccount } from '../../hooks/account';
import { Card, CardHeader, CardTitle } from '../ui/Card';
import { Button } from '../ui/Button';
import { Input, Field } from '../ui/Input';
import { LoadingState, ErrorState } from '../ui/states';

/**
 * The surviving member a household is handed over to, or `null` when the user
 * is its only member. Mirrors Task 7's server-side rule exactly — earliest
 * `joinedAt` first, ties broken by the lowest `userId` — so the sentence the
 * user reads matches what deletion will actually do.
 */
export function successorFor(members: HouseholdMember[], currentUserId: string): HouseholdMember | null {
  const survivors = members.filter((member) => member.userId !== currentUserId);
  if (survivors.length === 0) return null;
  const ranked = [...survivors].sort(
    (a, b) =>
      new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime() ||
      (a.userId < b.userId ? -1 : 1),
  );
  const owners = ranked.filter((m) => m.role === 'owner');
  return owners.length > 0 ? owners[0]! : ranked[0]!;
}

export function DeleteAccount() {
  const { t, locale } = useLocale();
  const router = useRouter();
  const meQuery = useMe();
  const householdsQuery = useHouseholds();
  const mutation = useDeleteAccount();

  const [confirmation, setConfirmation] = useState('');
  const [password, setPassword] = useState('');

  if (meQuery.isLoading || householdsQuery.isLoading) return <LoadingState />;
  if (meQuery.isError) return <ErrorState error={meQuery.error} onRetry={() => void meQuery.refetch()} />;
  if (householdsQuery.isError)
    return <ErrorState error={householdsQuery.error} onRetry={() => void householdsQuery.refetch()} />;
  if (!meQuery.data || !householdsQuery.data) return null;

  const user = meQuery.data;
  const households = householdsQuery.data;
  const word = deleteConfirmationWord(locale);
  const confirmed = matchesDeleteConfirmation(confirmation, locale);
  const canSubmit = confirmed && (!user.hasPassword || password.length > 0) && !mutation.isPending;

  const submit = () => {
    if (!canSubmit) return;
    mutation.mutate(
      { password: user.hasPassword ? password : undefined },
      { onSuccess: () => router.replace('/sign-in') },
    );
  };

  return (
    <Card className="flex flex-col gap-5">
      <CardHeader>
        <CardTitle className="text-danger">{t('web.deleteAccount.title')}</CardTitle>
      </CardHeader>

      <p className="text-sm text-muted-foreground">{t('web.deleteAccount.intro')}</p>

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-medium text-foreground">{t('web.deleteAccount.householdsTitle')}</h3>
        <ul className="flex flex-col gap-2">
          {households.map((household) => {
            const successor = successorFor(household.members, user.id);
            return (
              <li
                key={household.id}
                className="rounded-lg border border-danger bg-danger-soft p-3 text-sm text-danger"
              >
                {successor
                  ? t('web.deleteAccount.handover', {
                      household: household.name,
                      successor: successor.displayName,
                    })
                  : t('web.deleteAccount.destroy', { household: household.name })}
              </li>
            );
          })}
        </ul>
      </section>

      <Field label={t('web.deleteAccount.confirmLabel', { word })} htmlFor="delete-confirmation">
        <Input
          id="delete-confirmation"
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          autoComplete="off"
          disabled={mutation.isPending}
        />
      </Field>

      {user.hasPassword ? (
        <Field label={t('web.deleteAccount.passwordLabel')} htmlFor="delete-password">
          <Input
            id="delete-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            disabled={mutation.isPending}
          />
        </Field>
      ) : null}

      {mutation.isError ? (
        <p role="alert" className="text-sm text-danger">
          {translateErrorKey(locale, resolveErrorKey(mutation.error))}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <Button variant="danger" onClick={submit} disabled={!canSubmit}>
          {mutation.isPending ? t('web.deleteAccount.working') : t('web.deleteAccount.submit')}
        </Button>
        <Button variant="ghost" onClick={() => router.replace('/settings')} disabled={mutation.isPending}>
          {t('web.deleteAccount.cancel')}
        </Button>
      </div>
    </Card>
  );
}
