'use client';

import { useState } from 'react';
import type { ProductComment } from '@kitchen/contracts';
import { useLocale } from '../../lib/locale';
import { fetchAllProductComments, type ProductFilters } from '../../hooks/admin';
import { toCsv, downloadCsv, type CsvColumn } from '../../lib/csv';
import { Button } from '../ui/Button';

/**
 * What a vendor receives: the product, the rating, and the words.
 *
 * There is no submitter column and there must not be one. The customer agreed
 * to tell us what they thought of a product, not to be introduced to the
 * company they criticised — the API does not return an identity, and this is
 * the file that would leak it if it did.
 *
 * Headers stay English and untranslated: a CSV gets re-imported, so `rating`
 * must not become `التقييم` because the exporter was reading Arabic.
 */
const COLUMNS: readonly CsvColumn<ProductComment>[] = [
  { header: 'created_at', value: (r) => r.createdAt },
  { header: 'brand', value: (r) => r.brand },
  { header: 'product_en', value: (r) => r.nameEn },
  { header: 'product_ar', value: (r) => r.nameAr },
  { header: 'rating', value: (r) => r.rating },
  { header: 'locale', value: (r) => r.locale },
  { header: 'comment', value: (r) => r.message },
];

export function VendorExportButton({ filters }: { filters: ProductFilters }) {
  const { t } = useLocale();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const run = async () => {
    setBusy(true);
    setFailed(false);
    try {
      const rows = await fetchAllProductComments(filters);
      const stamp = new Date().toISOString().slice(0, 10);
      // Naming the file after the vendor matters: these get emailed one brand
      // at a time, and `comments-2026-08-12.csv` twice over is how the wrong
      // company receives the wrong file.
      const who = filters.brand ? filters.brand.replace(/[^\w-]+/g, '-').toLowerCase() : 'all';
      downloadCsv(`product-reviews-${who}-${stamp}.csv`, toCsv(rows, COLUMNS));
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <Button variant="secondary" disabled={busy} onClick={() => void run()}>
        {busy ? t('web.admin.exporting') : t('web.admin.exportCsv')}
      </Button>
      {failed ? (
        <p className="text-sm text-danger" role="alert">
          {t('web.admin.exportFailed')}
        </p>
      ) : null}
    </div>
  );
}
