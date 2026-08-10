'use client';

import { formatNumber } from '@kitchen/i18n';
import type { FeedbackStats as Stats } from '@kitchen/contracts';
import { useLocale } from '../../lib/locale';
import { STATUS_KEY } from '../../lib/feedback-labels';
import { Card } from '../ui/Card';

const STATUSES = ['new', 'triaged', 'resolved', 'wont_fix'] as const;

export function FeedbackStats({ stats }: { stats: Stats }) {
  const { t, locale } = useLocale();

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      <Card className="p-4">
        <p className="text-xs text-muted-foreground">{t('web.admin.total')}</p>
        <p className="text-2xl font-semibold">{formatNumber(locale, stats.total)}</p>
      </Card>
      <Card className="p-4">
        <p className="text-xs text-muted-foreground">{t('web.admin.average')}</p>
        <p className="text-2xl font-semibold">
          {stats.averageRating === null
            ? t('web.admin.noAverage')
            : formatNumber(locale, stats.averageRating)}
        </p>
      </Card>
      {STATUSES.map((status) => (
        <Card key={status} className="p-4">
          <p className="text-xs text-muted-foreground">{t(STATUS_KEY[status])}</p>
          <p className="text-2xl font-semibold">
            {formatNumber(locale, stats.byStatus[status] ?? 0)}
          </p>
        </Card>
      ))}
    </div>
  );
}
