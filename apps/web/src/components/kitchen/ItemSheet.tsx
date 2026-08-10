'use client';

import { useState } from 'react';
import type { InventoryItem } from '@kitchen/contracts';
import { formatNumber } from '@kitchen/i18n';
import { useLocale } from '../../lib/locale';
import { localizedName } from '../../lib/name';
import { locationKey, sourceKey } from '../../lib/labels';
import { expiryInfo } from '../../lib/expiry';
import { useDeleteInventoryItem, useUpdateInventoryItem, useLocations } from '../../hooks/inventory';
import { Sheet } from '../ui/Sheet';
import { Button } from '../ui/Button';
import { Input, Field } from '../ui/Input';
import { Badge } from '../ui/Badge';

export function ItemSheet({ item, onClose }: { item: InventoryItem | null; onClose: () => void }) {
  if (!item) return null;
  // Keyed on the item so the draft state below is torn down between items.
  // Without it the sheet is reused: an abandoned edit to one item is still
  // sitting in state when the next one opens, and Save writes it onto that item.
  return <ItemSheetBody key={item.id} item={item} onClose={onClose} />;
}

function ItemSheetBody({ item, onClose }: { item: InventoryItem; onClose: () => void }) {
  const { t, locale } = useLocale();
  const locationsQuery = useLocations();
  const update = useUpdateInventoryItem();
  const remove = useDeleteInventoryItem();
  const [quantity, setQuantity] = useState(String(item.quantity));
  const [expiresAt, setExpiresAt] = useState(item.expiresAt ?? '');
  const [brand, setBrand] = useState(item.brand ?? '');

  const name = localizedName(locale, {
    en: item.ingredient.canonicalNameEn,
    ar: item.ingredient.canonicalNameAr,
  });
  const info = expiryInfo(item.expiresAt, t);
  const location = locationsQuery.data?.find((l) => l.id === item.locationId);

  const parsedQuantity = Number(quantity);
  const quantityValid = quantity.trim() !== '' && Number.isFinite(parsedQuantity) && parsedQuantity >= 0;

  const save = () => {
    if (!quantityValid) return;
    update.mutate(
      {
        id: item.id,
        quantity: parsedQuantity,
        // `null` clears the date; `undefined` would leave the old one in place,
        // making an expiry impossible to remove once set.
        expiresAt: expiresAt === '' ? null : expiresAt,
        // Same reasoning: an empty field clears a brand the lookup got wrong.
        brand: brand.trim() === '' ? null : brand.trim(),
      },
      { onSuccess: onClose },
    );
  };

  return (
    <Sheet open={Boolean(item)} onClose={onClose} title={t('web.kitchen.itemDetail')}>
      <div className="flex flex-col gap-5">
        <div>
          <h3 className="text-xl font-semibold tracking-heading-sm">{name}</h3>
          {item.brand ? (
            // A brand is a proper noun in whatever script it was registered in,
            // so it is not necessarily in the reader's direction.
            <p className="mt-1 text-sm text-muted-foreground" dir="auto">
              {item.brand}
            </p>
          ) : null}
          <div className="mt-2 flex flex-wrap gap-2">
            {location ? <Badge tone="info">{t(locationKey(location.type))}</Badge> : null}
            <Badge tone={info.tone === 'danger' ? 'danger' : info.tone === 'warning' ? 'warning' : 'neutral'}>
              {info.label}
            </Badge>
            <Badge>{t(sourceKey(item.source))}</Badge>
          </div>
        </div>

        {item.confidence !== null ? (
          <p className="text-sm text-muted-foreground">
            {t('web.kitchen.confidence')}: {formatNumber(locale, Math.round(item.confidence * 100))}%
          </p>
        ) : null}

        <Field label={t('inventory.quantity')} htmlFor="item-qty">
          <Input
            id="item-qty"
            type="number"
            inputMode="decimal"
            min={0}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
        </Field>

        <Field label={t('inventory.expiryDate')} htmlFor="item-exp">
          <Input
            id="item-exp"
            type="date"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
          />
        </Field>

        <Field label={t('inventory.brand')} htmlFor="item-brand">
          <Input
            id="item-brand"
            dir="auto"
            maxLength={120}
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
          />
        </Field>

        <div className="flex flex-wrap gap-2">
          <Button onClick={save} disabled={update.isPending || !quantityValid}>
            {t('common.save')}
          </Button>
          <Button
            variant="danger"
            onClick={() => remove.mutate(item.id, { onSuccess: onClose })}
            disabled={remove.isPending}
          >
            {t('inventory.deleteItem')}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
