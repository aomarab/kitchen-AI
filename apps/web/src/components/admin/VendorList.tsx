'use client';

import { formatNumber } from '@kitchen/i18n';
import type { ProductFeedbackRow } from '@kitchen/contracts';
import { useLocale } from '../../lib/locale';
import { Badge } from '../ui/Badge';
import { Card } from '../ui/Card';
import { EmptyState } from '../ui/states';

/** Below this average a product is a complaint, not a preference. */
const POOR = 2.5;

export function VendorList({
  rows,
  selected,
  onSelect,
}: {
  rows: ProductFeedbackRow[];
  selected: ProductFeedbackRow | null;
  onSelect: (row: ProductFeedbackRow) => void;
}) {
  const { t, locale } = useLocale();

  if (rows.length === 0) return <EmptyState title={t('web.admin.vendorEmpty')} />;

  return (
    <ul className="flex flex-col gap-2">
      {rows.map((row) => {
        const isSelected = selected?.ingredientId === row.ingredientId && selected.brand === row.brand;
        return (
          <li key={`${row.ingredientId}:${row.brand ?? ''}`}>
            <button
              type="button"
              onClick={() => onSelect(row)}
              className="w-full text-start"
              aria-pressed={isSelected}
            >
              <Card className={`p-4 transition hover:bg-muted ${isSelected ? 'bg-muted' : ''}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-col gap-1">
                    <span className="font-medium">
                      {locale === 'ar' ? row.nameAr : row.nameEn}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {row.brand ?? t('web.admin.unbranded')}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge tone={row.averageRating <= POOR ? 'warning' : 'neutral'}>
                      {formatNumber(locale, row.averageRating)}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {t('web.admin.reviewCount', { count: row.count })}
                    </span>
                  </div>
                </div>
              </Card>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
