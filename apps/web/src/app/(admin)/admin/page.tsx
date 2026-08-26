'use client';

import { useState } from 'react';
import { useLocale } from '../../../lib/locale';
import { useFeedbackList, useFeedbackStats } from '../../../hooks/admin';
import { FeedbackFilters, type FeedbackFilterValue } from '../../../components/admin/FeedbackFilters';
import { FeedbackList } from '../../../components/admin/FeedbackList';
import { FeedbackStats } from '../../../components/admin/FeedbackStats';
import { FeedbackExportButton } from '../../../components/admin/FeedbackExportButton';
import { Button } from '../../../components/ui/Button';
import { LoadingState, ErrorState } from '../../../components/ui/states';

export default function AdminPage() {
  const { t } = useLocale();
  const [filters, setFilters] = useState<FeedbackFilterValue>({});
  const stats = useFeedbackStats();
  const list = useFeedbackList(filters);

  const items = list.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-heading-sm">{t('web.admin.feedbackTitle')}</h1>

      {stats.data ? <FeedbackStats stats={stats.data} /> : null}

      <div className="flex flex-wrap items-end justify-between gap-4">
        <FeedbackFilters value={filters} onChange={setFilters} />
        {/* Exports what the filters currently select, not just the loaded pages. */}
        <FeedbackExportButton filters={filters} />
      </div>

      {list.isLoading ? <LoadingState /> : null}
      {list.isError ? <ErrorState error={list.error} onRetry={() => void list.refetch()} /> : null}
      {list.isSuccess ? <FeedbackList items={items} /> : null}

      {list.hasNextPage ? (
        <div>
          <Button
            variant="secondary"
            disabled={list.isFetchingNextPage}
            onClick={() => void list.fetchNextPage()}
          >
            {t('web.admin.loadMore')}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
