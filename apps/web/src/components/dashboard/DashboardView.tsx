'use client';

import Link from 'next/link';
import { formatNumber } from '@kitchen/i18n';
import { useLocale } from '../../lib/locale';
import { usePlans } from '../../hooks/plans';
import { useInventory } from '../../hooks/inventory';
import { primaryPlan, tonightMeal, weekProgress } from '../../lib/plan';
import { slotKey } from '../../lib/labels';
import { expiryInfo } from '../../lib/expiry';
import { Card, CardHeader, CardTitle } from '../ui/Card';
import { buttonClasses } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { ProgressBar } from '../ui/ProgressBar';
import { RecipeThumb } from '../ui/RecipeThumb';
import { LoadingState, ErrorState, EmptyState } from '../ui/states';
import { LocalizedDate } from '../common/LocalizedDate';
import { CameraIcon, BarcodeIcon, ReceiptIcon, PlusIcon, ClockIcon, FlameIcon } from '../ui/icons';

export function DashboardView() {
  const { t, locale } = useLocale();
  const plansQuery = usePlans();
  const expiringQuery = useInventory({ limit: 8, sort: 'expiry', expiringWithinDays: 5 });

  if (plansQuery.isLoading) return <LoadingState />;
  if (plansQuery.isError) {
    return <ErrorState error={plansQuery.error} onRetry={() => void plansQuery.refetch()} />;
  }

  const plans = plansQuery.data;
  const plan = primaryPlan(plans);
  const tonight = tonightMeal(plans);
  const progress = weekProgress(plan);
  const expiring = expiringQuery.data?.items ?? [];
  const progressCaption = t('web.dashboard.weekProgressCaption', {
    cooked: formatNumber(locale, progress.cooked),
    total: formatNumber(locale, progress.total),
  });

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h2 className="text-2xl font-semibold tracking-heading-lg">{t('web.dashboard.greeting')}</h2>
        <p className="text-muted-foreground">{t('web.dashboard.subtitle')}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          <LocalizedDate value={new Date()} options={{ weekday: 'long', day: 'numeric', month: 'long' }} />
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t('web.dashboard.tonightTitle')}</CardTitle>
            <FlameIcon className="h-5 w-5 text-primary-text" />
          </CardHeader>
          {tonight ? (
            <div className="flex flex-col gap-4 sm:flex-row">
              <RecipeThumb
                heroImageUrl={tonight.entry.recipe.heroImageUrl}
                title={tonight.entry.recipe.title}
                dishKey={`${tonight.entry.recipe.locale}:${tonight.entry.recipe.title}`}
                className="aspect-video w-full rounded-xl sm:w-56"
              />
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="info">{t(slotKey(tonight.entry.slot))}</Badge>
                  <Badge tone={tonight.entry.fullyCovered ? 'success' : 'warning'}>
                    {tonight.entry.fullyCovered ? t('plans.fullyCovered') : t('recipe.notInStock')}
                  </Badge>
                </div>
                <h3 className="text-lg font-semibold tracking-heading-sm">{tonight.entry.recipe.title}</h3>
                <p className="text-sm text-muted-foreground">
                  {t('recipe.servings', { count: formatNumber(locale, tonight.entry.servings) })} ·{' '}
                  {t('recipe.cookTime', { minutes: formatNumber(locale, tonight.entry.recipe.cookMinutes) })}
                </p>
                <div className="mt-auto flex flex-wrap gap-2 pt-2">
                  <Link className={buttonClasses()} href={`/recipes/${tonight.entry.recipe.id}`}>
                    {t('web.dashboard.viewRecipe')}
                  </Link>
                </div>
              </div>
            </div>
          ) : (
            <EmptyState title={t('web.dashboard.tonightEmpty')} hint={t('plans.empty')} />
          )}
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('web.dashboard.weekProgressTitle')}</CardTitle>
          </CardHeader>
          {plan ? (
            <div className="flex flex-col gap-3">
              <ProgressBar value={progress.total ? progress.cooked / progress.total : 0} label={progressCaption} />
              <p className="text-sm text-muted-foreground">{progressCaption}</p>
              <Link className={buttonClasses({ variant: 'outline', size: 'sm' })} href={`/plans/${plan.id}`}>
                {t('web.dashboard.openPlan')}
              </Link>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">{t('plans.empty')}</p>
              <Link className={buttonClasses({ size: 'sm' })} href="/plans">
                {t('web.dashboard.noPlanCta')}
              </Link>
            </div>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClockIcon className="h-5 w-5 text-warning" />
            {t('web.dashboard.expiringTitle')}
          </CardTitle>
        </CardHeader>
        {expiringQuery.isLoading ? (
          <LoadingState />
        ) : expiringQuery.isError ? (
          // Not the same as "nothing is expiring" — that reassurance would be a
          // lie told by a failed request.
          <ErrorState error={expiringQuery.error} onRetry={() => void expiringQuery.refetch()} />
        ) : expiring.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('web.dashboard.expiringEmpty')}</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {expiring.map((item) => {
              const info = expiryInfo(item.expiresAt, t);
              return (
                <li key={item.id}>
                  <span className="flex items-center gap-2 rounded-full border border-border px-3 py-1.5 text-sm">
                    <span className="font-medium">
                      {locale === 'ar' ? item.ingredient.canonicalNameAr : item.ingredient.canonicalNameEn}
                    </span>
                    <Badge tone={info.tone === 'danger' ? 'danger' : 'warning'}>{info.label}</Badge>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('web.dashboard.quickAddTitle')}</CardTitle>
        </CardHeader>
        <p className="mb-4 text-sm text-muted-foreground">{t('web.dashboard.quickAddHint')}</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <QuickAdd href="/kitchen/capture?method=photo" icon={<CameraIcon />} label={t('capture.photo')} />
          <QuickAdd href="/kitchen/capture?method=barcode" icon={<BarcodeIcon />} label={t('capture.barcode')} />
          <QuickAdd href="/kitchen/capture?method=receipt" icon={<ReceiptIcon />} label={t('capture.receipt')} />
          <QuickAdd href="/kitchen/capture?method=manual" icon={<PlusIcon />} label={t('capture.manual')} />
        </div>
      </Card>
    </div>
  );
}

function QuickAdd({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      href={href}
      className="flex flex-col items-center gap-2 rounded-xl border border-border p-4 text-center text-sm font-medium transition hover:bg-muted"
    >
      <span className="text-primary-text">{icon}</span>
      {label}
    </Link>
  );
}
