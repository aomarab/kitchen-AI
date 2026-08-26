'use client';

import { CREDIT_COSTS } from '@kitchen/contracts';
import { formatNumber } from '@kitchen/i18n';
import { useLocale } from '../../lib/locale';
import { Card, CardHeader, CardTitle } from '../ui/Card';

/**
 * Cheapest whole-month plan. A balance that cannot cover it is worth flagging,
 * because monthly planning is the action most likely to run a household short.
 */
const MONTHLY_PLAN_COST = CREDIT_COSTS['plan.monthly'];

/**
 * Presentational credit balance — pure, so its total and low-balance logic can
 * be tested without the query layer (mirrors `PantryRailView`). Web only shows
 * the balance and points at the mobile app; it never sells credits (spec §9).
 */
export function CreditBalanceView({
  freeBalance,
  paidBalance,
  freeGrant,
}: {
  freeBalance: number;
  paidBalance: number;
  freeGrant: number;
}) {
  const { t, locale } = useLocale();
  const total = freeBalance + paidBalance;
  const coversMonthly = total >= MONTHLY_PLAN_COST;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('web.credits.title')}</CardTitle>
      </CardHeader>
      <p className="text-sm text-muted-foreground">{t('web.credits.subtitle')}</p>

      <p className="mt-3 text-3xl font-semibold text-primary-text">{formatNumber(locale, total)}</p>
      <p className="text-sm text-muted-foreground">{t('web.credits.available')}</p>

      <dl className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-lg bg-muted p-3 text-start">
          <dt className="text-xs text-muted-foreground">{t('web.credits.free')}</dt>
          <dd className="mt-1 text-lg font-medium text-foreground">
            {formatNumber(locale, freeBalance)}
          </dd>
        </div>
        <div className="rounded-lg bg-muted p-3 text-start">
          <dt className="text-xs text-muted-foreground">{t('web.credits.paid')}</dt>
          <dd className="mt-1 text-lg font-medium text-foreground">
            {formatNumber(locale, paidBalance)}
          </dd>
        </div>
      </dl>

      <p className="mt-3 text-sm text-muted-foreground">
        {t('web.credits.resets', { grant: formatNumber(locale, freeGrant) })}
      </p>

      {!coversMonthly ? (
        <p role="status" className="mt-3 rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning">
          {t('web.credits.belowMonthly', { needed: formatNumber(locale, MONTHLY_PLAN_COST) })}
        </p>
      ) : null}

      <p className="mt-3 text-sm text-muted-foreground">{t('web.credits.buyOnMobile')}</p>
    </Card>
  );
}
