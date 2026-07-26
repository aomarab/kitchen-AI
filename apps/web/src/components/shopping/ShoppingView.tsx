'use client';

import { useState } from 'react';
import { formatNumber } from '@kitchen/i18n';
import { useLocale } from '../../lib/locale';
import { localizedName } from '../../lib/name';
import { locationKey } from '../../lib/labels';
import { useLocations } from '../../hooks/inventory';
import {
  useCheckoutShopping,
  useShoppingList,
  useToggleShoppingItem,
} from '../../hooks/shopping';
import { Card, CardHeader, CardTitle } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Select } from '../ui/Input';
import { LoadingState, ErrorState, EmptyState } from '../ui/states';

export function ShoppingView() {
  const { t, locale } = useLocale();
  const listQuery = useShoppingList();
  const locationsQuery = useLocations();
  const toggle = useToggleShoppingItem();
  const checkout = useCheckoutShopping();
  const [locationId, setLocationId] = useState('');

  if (listQuery.isLoading) return <LoadingState />;
  if (listQuery.isError) return <ErrorState error={listQuery.error} onRetry={() => void listQuery.refetch()} />;

  const items = listQuery.data ?? [];
  if (items.length === 0) {
    return <EmptyState title={t('shopping.empty')} hint={t('web.shopping.emptyHint')} />;
  }

  const purchased = items.filter((i) => i.purchased);
  const fromPlan = items.filter((i) => i.planId !== null);
  const manual = items.filter((i) => i.planId === null);
  const resolvedLocation = locationId || locationsQuery.data?.[0]?.id || '';

  const doCheckout = () => {
    if (purchased.length === 0 || !resolvedLocation) return;
    checkout.mutate({ itemIds: purchased.map((i) => i.id), locationId: resolvedLocation });
  };

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-medium">
            {t('web.shopping.checkedCount', {
              checked: formatNumber(locale, purchased.length),
              total: formatNumber(locale, items.length),
            })}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">{t('web.shopping.selectLocation')}</span>
              <Select value={resolvedLocation} onChange={(e) => setLocationId(e.target.value)} className="w-auto">
                {locationsQuery.data?.map((l) => (
                  <option key={l.id} value={l.id}>
                    {t(locationKey(l.type))}
                  </option>
                ))}
              </Select>
            </label>
            <Button size="sm" onClick={doCheckout} disabled={purchased.length === 0 || checkout.isPending}>
              {t('shopping.moveToKitchen')}
            </Button>
          </div>
        </div>
      </Card>

      {fromPlan.length > 0 ? (
        <Group title={t('web.shopping.fromPlan')}>
          {fromPlan.map((item) => (
            <ShoppingRow
              key={item.id}
              name={localizedName(locale, { en: item.nameEn, ar: item.nameAr })}
              detail={`${formatNumber(locale, item.quantity)} ${item.unit}`}
              purchased={item.purchased}
              onToggle={() => toggle.mutate({ id: item.id, purchased: !item.purchased })}
            />
          ))}
        </Group>
      ) : null}

      {manual.length > 0 ? (
        <Group title={t('web.shopping.manualItem')}>
          {manual.map((item) => (
            <ShoppingRow
              key={item.id}
              name={localizedName(locale, { en: item.nameEn, ar: item.nameAr })}
              detail={`${formatNumber(locale, item.quantity)} ${item.unit}`}
              purchased={item.purchased}
              onToggle={() => toggle.mutate({ id: item.id, purchased: !item.purchased })}
            />
          ))}
        </Group>
      ) : null}
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="p-0">
      <CardHeader className="px-4 pt-4">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <ul className="divide-y divide-border">{children}</ul>
    </Card>
  );
}

function ShoppingRow({
  name,
  detail,
  purchased,
  onToggle,
}: {
  name: string;
  detail: string;
  purchased: boolean;
  onToggle: () => void;
}) {
  const { t } = useLocale();
  return (
    <li>
      <label className="flex cursor-pointer items-center gap-3 px-4 py-3">
        <input
          type="checkbox"
          checked={purchased}
          onChange={onToggle}
          className="h-5 w-5 rounded border-border text-primary focus-visible:ring-2 focus-visible:ring-primary"
        />
        <span className={purchased ? 'flex-1 text-muted-foreground line-through' : 'flex-1'}>{name}</span>
        <span className="text-sm text-muted-foreground">{detail}</span>
        {purchased ? <Badge tone="success">{t('shopping.purchased')}</Badge> : null}
      </label>
    </li>
  );
}
