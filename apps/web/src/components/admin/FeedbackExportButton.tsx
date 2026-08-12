'use client';

import { useState } from 'react';
import type { FeedbackSummary } from '@kitchen/contracts';
import { useLocale } from '../../lib/locale';
import { fetchAllFeedback } from '../../hooks/admin';
import { toCsv, downloadCsv, type CsvColumn } from '../../lib/csv';
import { Button } from '../ui/Button';
import type { FeedbackFilterValue } from './FeedbackFilters';

/**
 * Header names are deliberately English and untranslated: a CSV is opened in a
 * spreadsheet and usually re-imported somewhere, so a column called `rating`
 * must not become `التقييم` when the exporter happens to be reading Arabic.
 */
const COLUMNS: readonly CsvColumn<FeedbackSummary>[] = [
  { header: 'id', value: (r) => r.id },
  { header: 'created_at', value: (r) => r.createdAt },
  { header: 'rating', value: (r) => r.rating },
  { header: 'status', value: (r) => r.status },
  { header: 'platform', value: (r) => r.platform },
  { header: 'app_version', value: (r) => r.appVersion },
  { header: 'locale', value: (r) => r.locale },
  { header: 'message', value: (r) => r.message },
];

export function FeedbackExportButton({ filters }: { filters: FeedbackFilterValue }) {
  const { t } = useLocale();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const run = async () => {
    setBusy(true);
    setFailed(false);
    try {
      const rows = await fetchAllFeedback(filters);
      const stamp = new Date().toISOString().slice(0, 10);
      downloadCsv(`feedback-${stamp}.csv`, toCsv(rows, COLUMNS));
    } catch {
      // The click produces a file or it does not; a silent no-op would read as
      // "there is nothing to export", which is a different and wrong message.
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
