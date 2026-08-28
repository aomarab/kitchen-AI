'use client';

import { useState } from 'react';
import { formatDate, formatNumber } from '@kitchen/i18n';
import type { CreditCalibrationRow, CreditCalibrationStatus } from '@kitchen/contracts';
import { useLocale } from '../../lib/locale';
import { useCreditCalibration, type CalibrationWindow } from '../../hooks/admin';
import { Badge } from '../ui/Badge';
import { Card } from '../ui/Card';
import { LoadingState, ErrorState, EmptyState } from '../ui/states';

const WINDOWS: readonly CalibrationWindow[] = [7, 30, 90];

/** The label key for each action, so the table reads in the active language. */
const ACTION_KEY = {
  'pantry.scan': 'web.admin.credits.action.pantryScan',
  'receipt.scan': 'web.admin.credits.action.receiptScan',
  'plan.daily': 'web.admin.credits.action.planDaily',
  'plan.weekly': 'web.admin.credits.action.planWeekly',
  'plan.monthly': 'web.admin.credits.action.planMonthly',
  'plan.regenerateEntry': 'web.admin.credits.action.planRegenerate',
  'assistant.session': 'web.admin.credits.action.assistantSession',
} as const satisfies Record<CreditCalibrationRow['action'], string>;

const STATUS = {
  covered: { tone: 'success', key: 'web.admin.credits.statusCovered' },
  underpriced: { tone: 'danger', key: 'web.admin.credits.statusUnderpriced' },
  unmeasured: { tone: 'warning', key: 'web.admin.credits.statusUnmeasured' },
  unused: { tone: 'neutral', key: 'web.admin.credits.statusUnused' },
} as const satisfies Record<
  CreditCalibrationStatus,
  { tone: 'success' | 'danger' | 'warning' | 'neutral'; key: string }
>;

/**
 * "Are we covering costs?" — the listed price of every credit action against
 * the vendor cost measured from the ledgers. Underpriced actions are surfaced
 * first and in red; `assistant.session` is flagged unmeasurable rather than
 * shown as free.
 */
export function CreditCalibrationView() {
  const { t, locale } = useLocale();
  const [days, setDays] = useState<CalibrationWindow>(30);
  const query = useCreditCalibration(days);

  const usd = (value: number, maxDigits = 2) =>
    formatNumber(locale, value, {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: maxDigits,
    });
  const credits = (value: number) => formatNumber(locale, value, { maximumFractionDigits: 2 });

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-heading-sm">
          {t('web.admin.credits.title')}
        </h1>
        <p className="text-sm text-muted-foreground">{t('web.admin.credits.intro')}</p>
      </div>

      <div
        className="flex flex-wrap items-center gap-2"
        role="group"
        aria-label={t('web.admin.credits.window')}
      >
        {WINDOWS.map((w) => {
          const active = w === days;
          return (
            <button
              key={w}
              type="button"
              onClick={() => setDays(w)}
              aria-pressed={active}
              className={`rounded-md px-3 py-2 text-sm transition ${
                active
                  ? 'bg-primary-soft text-primary-text'
                  : 'text-muted-foreground hover:bg-muted'
              }`}
            >
              {t('web.admin.credits.windowDays', { days: w })}
            </button>
          );
        })}
      </div>

      {query.isLoading ? <LoadingState /> : null}
      {query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : null}

      {query.isSuccess ? (
        <>
          <Card className="flex flex-wrap items-center gap-x-8 gap-y-2 p-4 text-sm">
            <div className="flex flex-col">
              <span className="text-xs text-muted-foreground">
                {t('web.admin.credits.costBasis')}
              </span>
              <span className="font-medium">
                {t('web.admin.credits.perCredit', { usd: usd(query.data.costBasisUsd, 4) })}
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-xs text-muted-foreground">
                {t('web.admin.credits.creditValue')}
              </span>
              <span className="font-medium">
                {t('web.admin.credits.perCredit', { usd: usd(query.data.creditValueUsd, 4) })}
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-xs text-muted-foreground">{t('web.admin.credits.window')}</span>
              <span className="font-medium">
                {t('web.admin.credits.since', {
                  date: formatDate(locale, query.data.since),
                })}
              </span>
            </div>
          </Card>

          {query.data.rows.length === 0 ? (
            <EmptyState title={t('web.admin.credits.empty')} />
          ) : (
            <Card className="overflow-x-auto p-0">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th className="p-3 text-start font-medium">
                      {t('web.admin.credits.colAction')}
                    </th>
                    <th className="p-3 text-end font-medium">{t('web.admin.credits.colListed')}</th>
                    <th className="p-3 text-end font-medium">
                      {t('web.admin.credits.colMeasured')}
                    </th>
                    <th className="p-3 text-end font-medium">
                      {t('web.admin.credits.colCharges')}
                    </th>
                    <th className="p-3 text-end font-medium">{t('web.admin.credits.colCalls')}</th>
                    <th className="p-3 text-end font-medium">{t('web.admin.credits.colStatus')}</th>
                  </tr>
                </thead>
                <tbody>
                  {query.data.rows.map((row) => {
                    const status = STATUS[row.status];
                    return (
                      <tr key={row.action} className="border-b border-border last:border-b-0">
                        <td className="p-3">
                          <div className="flex flex-col gap-0.5">
                            <span className="font-medium">{t(ACTION_KEY[row.action])}</span>
                            {!row.measurable ? (
                              <span className="text-xs text-muted-foreground">
                                {t('web.admin.credits.unmeasurableNote')}
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td className="p-3 text-end tabular-nums">{credits(row.listedCredits)}</td>
                        <td className="p-3 text-end tabular-nums">
                          {row.measuredCreditsPerCharge === null ? (
                            <span className="text-muted-foreground">
                              {t('web.admin.credits.notMeasured')}
                            </span>
                          ) : (
                            <div className="flex flex-col items-end gap-0.5">
                              <span
                                className={
                                  row.status === 'underpriced' ? 'font-semibold text-danger' : ''
                                }
                              >
                                {credits(row.measuredCreditsPerCharge)}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {usd(row.measuredCostUsd, 4)}
                              </span>
                            </div>
                          )}
                        </td>
                        <td className="p-3 text-end tabular-nums">
                          <div className="flex flex-col items-end gap-0.5">
                            <span>{formatNumber(locale, row.chargedCount)}</span>
                            {row.measurable && row.chargedCount > 0 ? (
                              <span className="text-xs text-muted-foreground">
                                {t('web.admin.credits.chargedNote', {
                                  measured: formatNumber(locale, row.measuredCount),
                                  charged: formatNumber(locale, row.chargedCount),
                                })}
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td className="p-3 text-end tabular-nums">
                          {formatNumber(locale, row.callCount)}
                        </td>
                        <td className="p-3 text-end">
                          <Badge tone={status.tone}>{t(status.key)}</Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>
          )}
        </>
      ) : null}
    </div>
  );
}
