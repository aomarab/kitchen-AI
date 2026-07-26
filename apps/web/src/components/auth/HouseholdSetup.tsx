'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale } from '../../lib/locale';
import { cn } from '../../lib/cn';
import { useCreateHousehold, useJoinHousehold } from '../../hooks/auth';
import { Button } from '../ui/Button';
import { Input, Field } from '../ui/Input';
import { ErrorState } from '../ui/states';

type Tab = 'create' | 'join';

export function HouseholdSetup() {
  const { t } = useLocale();
  const router = useRouter();
  const create = useCreateHousehold();
  const join = useJoinHousehold();
  const [tab, setTab] = useState<Tab>('create');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');

  const done = () => router.push('/');

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{t('web.auth.householdTitle')}</h1>
        <p className="text-muted-foreground">{t('web.auth.householdSubtitle')}</p>
      </div>

      <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1" role="tablist" aria-label={t('web.auth.householdTitle')}>
        <TabButton active={tab === 'create'} onClick={() => setTab('create')}>
          {t('web.auth.createTab')}
        </TabButton>
        <TabButton active={tab === 'join'} onClick={() => setTab('join')}>
          {t('web.auth.joinTab')}
        </TabButton>
      </div>

      {tab === 'create' ? (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate({ name }, { onSuccess: done });
          }}
        >
          <Field label={t('household.name')} htmlFor="hh-name">
            <Input id="hh-name" value={name} onChange={(e) => setName(e.target.value)} required />
          </Field>
          {create.isError ? <ErrorState error={create.error} /> : null}
          <Button type="submit" block disabled={create.isPending || name.trim().length === 0}>
            {t('web.auth.createCta')}
          </Button>
        </form>
      ) : (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            join.mutate({ inviteCode: code.toUpperCase() }, { onSuccess: done });
          }}
        >
          <Field label={t('household.inviteCode')} htmlFor="hh-code">
            <Input
              id="hh-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder={t('web.auth.inviteCodePlaceholder')}
              maxLength={6}
              className="tracking-[0.3em]"
              required
            />
          </Field>
          {join.isError ? <ErrorState error={join.error} /> : null}
          <Button type="submit" block disabled={join.isPending || code.trim().length !== 6}>
            {t('web.auth.joinCta')}
          </Button>
        </form>
      )}

      <p className="rounded-lg bg-muted/60 px-4 py-3 text-xs text-muted-foreground">{t('web.auth.demoNote')}</p>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        'rounded-md px-3 py-1.5 text-sm font-medium transition',
        active ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground',
      )}
    >
      {children}
    </button>
  );
}
