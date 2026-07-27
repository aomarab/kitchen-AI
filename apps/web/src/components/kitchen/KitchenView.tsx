'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { InventoryItem, ListInventoryQuery } from '@kitchen/contracts';
import { formatNumber } from '@kitchen/i18n';
import { useLocale } from '../../lib/locale';
import { localizedName } from '../../lib/name';
import { locationKey, unitKey } from '../../lib/labels';
import { cn } from '../../lib/cn';
import { expiryInfo } from '../../lib/expiry';
import { useInventory, useLocations } from '../../hooks/inventory';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Input, Select } from '../ui/Input';
import { buttonClasses } from '../ui/Button';
import { LoadingState, ErrorState, EmptyState } from '../ui/states';
import { SearchIcon, PlusIcon } from '../ui/icons';
import { ItemSheet } from './ItemSheet';
import { useDebounced } from '../../hooks/useDebounced';

type Sort = NonNullable<ListInventoryQuery['sort']>;

export function KitchenView() {
  const { t, locale } = useLocale();
  const [locationId, setLocationId] = useState<string | undefined>();
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<Sort>('expiry');
  const [selected, setSelected] = useState<InventoryItem | null>(null);

  // `q` drives a query key, so it is debounced: typing "tomato" used to fire
  // six requests and blank the list six times.
  const debouncedQ = useDebounced(q);

  const locationsQuery = useLocations();
  const inventoryQuery = useInventory({
    limit: 100,
    sort,
    locationId,
    q: debouncedQ || undefined,
  });

  const items = inventoryQuery.data?.items ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {t('inventory.itemCount', { count: formatNumber(locale, items.length) })}
        </p>
        <Link className={buttonClasses({ size: 'sm' })} href="/kitchen/capture">
          <PlusIcon className="h-4 w-4" />
          {t('capture.title')}
        </Link>
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label={t('web.kitchen.locationsTitle')}>
        <LocationChip active={!locationId} onClick={() => setLocationId(undefined)}>
          {t('web.kitchen.allLocations')}
        </LocationChip>
        {locationsQuery.data?.map((loc) => (
          <LocationChip key={loc.id} active={locationId === loc.id} onClick={() => setLocationId(loc.id)}>
            {t(locationKey(loc.type))}
          </LocationChip>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="relative flex-1">
          <span className="sr-only">{t('web.kitchen.searchPlaceholder')}</span>
          <SearchIcon className="pointer-events-none absolute inset-y-0 start-3 my-auto h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('web.kitchen.searchPlaceholder')}
            className="ps-9"
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">{t('web.kitchen.sortLabel')}</span>
          <Select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="w-auto">
            <option value="expiry">{t('web.kitchen.sortExpiry')}</option>
            <option value="name">{t('web.kitchen.sortName')}</option>
            <option value="recent">{t('web.kitchen.sortRecent')}</option>
          </Select>
        </label>
      </div>

      {inventoryQuery.isLoading ? (
        <LoadingState />
      ) : inventoryQuery.isError ? (
        <ErrorState error={inventoryQuery.error} onRetry={() => void inventoryQuery.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState title={t('inventory.emptyLocation')} hint={t('web.dashboard.quickAddHint')} />
      ) : (
        <Card className="p-0">
          <ul className="divide-y divide-border">
            {items.map((item) => (
              <li key={item.id}>
                <ItemRow item={item} onClick={() => setSelected(item)} />
              </li>
            ))}
          </ul>
        </Card>
      )}

      <ItemSheet item={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function LocationChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'rounded-full border px-3 py-1.5 text-sm font-medium transition',
        active ? 'border-primary-text bg-primary-soft text-primary-text' : 'border-border text-muted-foreground hover:bg-muted',
      )}
    >
      {children}
    </button>
  );
}

function ItemRow({ item, onClick }: { item: InventoryItem; onClick: () => void }) {
  const { t, locale } = useLocale();
  const info = expiryInfo(item.expiresAt, t);
  const lowConfidence = item.confidence !== null && item.confidence < 0.6;
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 px-4 py-3 text-start transition hover:bg-muted"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">
          {localizedName(locale, { en: item.ingredient.canonicalNameEn, ar: item.ingredient.canonicalNameAr })}
        </p>
        <p className="text-sm text-muted-foreground">
          {formatNumber(locale, item.quantity)} {t(unitKey(item.unit))}
        </p>
      </div>
      {lowConfidence ? <Badge tone="warning">{t('capture.lowConfidence')}</Badge> : null}
      <Badge tone={info.tone === 'danger' ? 'danger' : info.tone === 'warning' ? 'warning' : 'neutral'}>
        {info.label}
      </Badge>
    </button>
  );
}
