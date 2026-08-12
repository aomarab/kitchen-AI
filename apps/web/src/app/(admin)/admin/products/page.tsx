'use client';

import { useState } from 'react';
import type { ProductFeedbackRow } from '@kitchen/contracts';
import { useLocale } from '../../../../lib/locale';
import { useProductComments, useProductFeedbackList } from '../../../../hooks/admin';
import { VendorList } from '../../../../components/admin/VendorList';
import { VendorComments } from '../../../../components/admin/VendorComments';
import { VendorExportButton } from '../../../../components/admin/VendorExportButton';
import { Button } from '../../../../components/ui/Button';
import { LoadingState, ErrorState } from '../../../../components/ui/states';

/**
 * The vendor report: which products customers are unhappy with, and the words
 * to send the brand that makes them.
 *
 * Worst-rated first, because the report exists to find what to act on rather
 * than to admire an average.
 */
export default function AdminProductsPage() {
  const { t } = useLocale();
  const [poorOnly, setPoorOnly] = useState(false);
  const [selected, setSelected] = useState<ProductFeedbackRow | null>(null);

  const filters = poorOnly ? { maxAverage: 3 } : {};
  const list = useProductFeedbackList(filters);
  const rows = list.data?.pages.flatMap((page) => page.items) ?? [];

  // A vendor export is per-product: `brand` alone would sweep in every other
  // product the same company makes.
  const selectedFilters = selected
    ? { brand: selected.brand ?? undefined, ingredientId: selected.ingredientId }
    : {};
  const comments = useProductComments(selectedFilters);
  const commentRows = comments.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-heading-sm">{t('web.admin.vendorTitle')}</h1>
      <p className="text-sm text-muted-foreground">{t('web.admin.vendorIntro')}</p>

      <div className="flex flex-wrap items-center gap-3">
        <Button variant={poorOnly ? 'primary' : 'secondary'} onClick={() => setPoorOnly(!poorOnly)}>
          {t('web.admin.poorOnly')}
        </Button>
      </div>

      {list.isLoading ? <LoadingState /> : null}
      {list.isError ? <ErrorState error={list.error} onRetry={() => void list.refetch()} /> : null}
      {list.isSuccess ? <VendorList rows={rows} selected={selected} onSelect={setSelected} /> : null}

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

      {selected ? (
        <section className="flex flex-col gap-4 border-t border-border pt-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <h2 className="text-lg font-semibold">
              {t('web.admin.commentsFor', { brand: selected.brand ?? t('web.admin.unbranded') })}
            </h2>
            <VendorExportButton filters={selectedFilters} />
          </div>
          {comments.isLoading ? <LoadingState /> : null}
          {comments.isSuccess ? <VendorComments comments={commentRows} /> : null}
          {comments.hasNextPage ? (
            <div>
              <Button
                variant="secondary"
                disabled={comments.isFetchingNextPage}
                onClick={() => void comments.fetchNextPage()}
              >
                {t('web.admin.loadMore')}
              </Button>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
