'use client';

import Link from 'next/link';
import { formatNumber } from '@kitchen/i18n';
import type { FeedbackStatus, FeedbackSummary } from '@kitchen/contracts';
import { useLocale } from '../../lib/locale';
import { STATUS_KEY } from '../../lib/feedback-labels';
import { Badge } from '../ui/Badge';
import { Card } from '../ui/Card';
import { EmptyState } from '../ui/states';

const STATUS_TONE: Record<FeedbackStatus, 'info' | 'warning' | 'success' | 'neutral'> = {
  new: 'info',
  triaged: 'warning',
  resolved: 'success',
  wont_fix: 'neutral',
};

export function FeedbackList({ items }: { items: FeedbackSummary[] }) {
  const { t, locale } = useLocale();

  if (items.length === 0) return <EmptyState title={t('web.admin.empty')} />;

  return (
    <ul className="flex flex-col gap-2">
      {items.map((item) => (
        <li key={item.id}>
          <Link href={`/admin/feedback/${item.id}`} className="block">
            <Card className="p-4 transition hover:bg-muted">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  <span className="text-lg" aria-hidden="true">
                    {'\u2605'.repeat(item.rating)}
                  </span>
                  <span className="sr-only">{formatNumber(locale, item.rating)}</span>
                  <Badge tone={STATUS_TONE[item.status]}>{t(STATUS_KEY[item.status])}</Badge>
                </div>
                <span className="text-xs text-muted-foreground">
                  {new Date(item.createdAt).toLocaleDateString(locale)}
                </span>
              </div>
              {/* Feedback is free text in whatever language the user wrote it,
                  rendered in a page whose direction follows the *reader*. Without
                  dir="auto" an English message in the Arabic console has its
                  punctuation thrown to the wrong end. */}
              <p dir="auto" className="mt-2 line-clamp-2 text-sm text-foreground">
                {item.message ?? t('web.admin.noMessage')}
              </p>
            </Card>
          </Link>
        </li>
      ))}
    </ul>
  );
}
