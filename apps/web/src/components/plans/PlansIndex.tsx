'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { formatNumber } from '@kitchen/i18n';
import { useLocale } from '../../lib/locale';
import { scopeKey } from '../../lib/labels';
import { usePlans } from '../../hooks/plans';
import { Card, CardHeader, CardTitle } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { LoadingState, ErrorState, EmptyState } from '../ui/states';
import { LocalizedDate } from '../common/LocalizedDate';
import { PlusIcon } from '../ui/icons';
import { GeneratePlanForm } from './GeneratePlanForm';

export function PlansIndex() {
  const { t, locale } = useLocale();
  const router = useRouter();
  const plansQuery = usePlans();
  const [showForm, setShowForm] = useState(false);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{t('plans.generatingHint')}</p>
        <Button size="sm" onClick={() => setShowForm((v) => !v)}>
          <PlusIcon className="h-4 w-4" />
          {t('web.plans.newPlan')}
        </Button>
      </div>

      {showForm ? <GeneratePlanForm onGenerated={(id) => router.push(`/plans/${id}`)} /> : null}

      {plansQuery.isLoading ? (
        <LoadingState />
      ) : plansQuery.isError ? (
        <ErrorState error={plansQuery.error} onRetry={() => void plansQuery.refetch()} />
      ) : (plansQuery.data?.length ?? 0) === 0 ? (
        <EmptyState title={t('plans.empty')} hint={t('web.plans.generateTitle')} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {plansQuery.data!.map((plan) => (
            <Link key={plan.id} href={`/plans/${plan.id}`} className="block">
              <Card className="h-full transition hover:border-primary-text">
                <CardHeader>
                  <CardTitle className="text-base">{t(scopeKey(plan.scope))}</CardTitle>
                  <Badge tone={plan.status === 'ready' ? 'success' : plan.status === 'failed' ? 'danger' : 'warning'}>
                    {plan.status === 'ready' ? t('plans.planned') : t('plans.generating')}
                  </Badge>
                </CardHeader>
                <p className="text-sm text-muted-foreground">
                  <LocalizedDate value={plan.startsOn} /> — <LocalizedDate value={plan.endsOn} />
                </p>
                <p className="mt-2 text-sm">
                  {t('inventory.itemCount', { count: formatNumber(locale, plan.entries.length) })}
                </p>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
