'use client';

import { useMemo, useState } from 'react';
import type {
  InventorySource,
  RecognizedItem,
  StorageLocation,
  Unit,
} from '@kitchen/contracts';
import { formatNumber } from '@kitchen/i18n';
import { useLocale } from '../../lib/locale';
import { localizedName } from '../../lib/name';
import { locationKey } from '../../lib/labels';
import { useBulkCreateInventory } from '../../hooks/capture';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Input, Select } from '../ui/Input';
import { IconButton } from '../ui/IconButton';
import { CloseIcon } from '../ui/icons';

const LOW_CONFIDENCE = 0.6;

interface ReviewRow {
  tempId: string;
  ingredientId: string | null;
  rawName: string;
  nameEn: string;
  nameAr: string;
  quantity: number;
  unit: Unit;
  locationId: string;
  expiresAt: string | null;
  confidence: number;
  photoKey: string | null;
}

function toRows(items: RecognizedItem[], locations: StorageLocation[]): ReviewRow[] {
  return items.map((it) => {
    const location =
      locations.find((l) => l.type === it.suggestedLocationType) ?? locations[0];
    return {
      tempId: it.tempId,
      ingredientId: it.match.ingredientId,
      rawName: it.nameEn,
      nameEn: it.nameEn,
      nameAr: it.nameAr,
      quantity: it.quantity,
      unit: it.unit,
      locationId: location?.id ?? '',
      expiresAt: it.suggestedExpiresAt,
      confidence: it.confidence,
      photoKey: it.photoKey,
    };
  });
}

/**
 * The AI review list. Recognition output is *never* auto-committed (spec §5.1):
 * rows stay in local state and only reach the inventory when the user presses
 * confirm. Low-confidence rows are flagged for a second look.
 */
export function ReviewList({
  items,
  locations,
  source,
  onDone,
}: {
  items: RecognizedItem[];
  locations: StorageLocation[];
  source: InventorySource;
  onDone: (count: number) => void;
}) {
  const { t, locale } = useLocale();
  const [rows, setRows] = useState<ReviewRow[]>(() => toRows(items, locations));
  const bulkCreate = useBulkCreateInventory();

  const flaggedCount = useMemo(() => rows.filter((r) => r.confidence < LOW_CONFIDENCE).length, [rows]);

  const patch = (tempId: string, changes: Partial<ReviewRow>) =>
    setRows((prev) => prev.map((r) => (r.tempId === tempId ? { ...r, ...changes } : r)));

  const removeRow = (tempId: string) => setRows((prev) => prev.filter((r) => r.tempId !== tempId));

  const confirm = () => {
    bulkCreate.mutate(
      {
        items: rows.map((r) => ({
          ingredientId: r.ingredientId,
          rawName: r.ingredientId ? undefined : r.rawName,
          locationId: r.locationId,
          quantity: r.quantity,
          unit: r.unit,
          expiresAt: r.expiresAt,
          source,
          confidence: r.confidence,
          photoKey: r.photoKey,
        })),
      },
      { onSuccess: (created) => onDone(created.length) },
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">{t('capture.reviewTitle')}</h2>
          <p className="text-sm text-muted-foreground">{t('capture.reviewHint')}</p>
        </div>
        <Badge tone={flaggedCount > 0 ? 'warning' : 'success'}>
          {flaggedCount > 0
            ? t('web.capture.flaggedCount', { count: formatNumber(locale, flaggedCount) })
            : t('web.capture.noneFlagged')}
        </Badge>
      </div>

      <ul className="flex flex-col gap-3">
        {rows.map((row) => {
          const low = row.confidence < LOW_CONFIDENCE;
          return (
            <li key={row.tempId}>
              <Card className={low ? 'border-accent/50 bg-accent/5' : undefined}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium">{localizedName(locale, { en: row.nameEn, ar: row.nameAr })}</p>
                    <p className="text-xs text-muted-foreground">
                      {t('web.kitchen.confidence')}: {formatNumber(locale, Math.round(row.confidence * 100))}%
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {low ? <Badge tone="warning">{t('capture.lowConfidence')}</Badge> : null}
                    <IconButton label={t('web.capture.removeRow')} onClick={() => removeRow(row.tempId)}>
                      <CloseIcon className="h-4 w-4" />
                    </IconButton>
                  </div>
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <label className="flex flex-col gap-1 text-sm">
                    <span className="text-muted-foreground">{t('inventory.quantity')}</span>
                    <Input
                      type="number"
                      inputMode="decimal"
                      value={row.quantity}
                      onChange={(e) => patch(row.tempId, { quantity: Number(e.target.value) })}
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-sm">
                    <span className="text-muted-foreground">{t('inventory.location')}</span>
                    <Select
                      value={row.locationId}
                      onChange={(e) => patch(row.tempId, { locationId: e.target.value })}
                    >
                      {locations.map((l) => (
                        <option key={l.id} value={l.id}>
                          {t(locationKey(l.type))}
                        </option>
                      ))}
                    </Select>
                  </label>
                  <label className="flex flex-col gap-1 text-sm">
                    <span className="text-muted-foreground">{t('inventory.expiryDate')}</span>
                    <Input
                      type="date"
                      value={row.expiresAt ?? ''}
                      onChange={(e) => patch(row.tempId, { expiresAt: e.target.value || null })}
                    />
                  </label>
                </div>
              </Card>
            </li>
          );
        })}
      </ul>

      <div className="flex flex-col gap-2 rounded-xl border border-border bg-muted/40 p-4">
        <p className="text-sm text-muted-foreground">{t('web.capture.confirmReviewNote')}</p>
        <Button onClick={confirm} disabled={bulkCreate.isPending || rows.length === 0} block>
          {t('capture.addAll')}
        </Button>
      </div>
    </div>
  );
}
