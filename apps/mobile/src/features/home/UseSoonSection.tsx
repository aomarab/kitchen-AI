import { useMemo } from 'react';
import { View } from 'react-native';
import type { InventoryItem, StorageLocation } from '@kitchen/contracts';
import { AppText, SectionLabel } from '../../components';
import { InventoryItemRow } from '../inventory/InventoryItemRow';
import { useFormat } from '../../hooks/useFormat';
import { itemName } from '../../lib/format';
import {
  inventoryItemRowBadge,
  inventoryItemRowFoodIcon,
  inventoryItemRowMeta,
  inventoryItemRowWhen,
} from '../../lib/inventory-row';
import { spacing } from '../../theme';

export function UseSoonSection({
  items,
  locations,
  accessibilityLabel,
  onSeeAll,
}: {
  items: readonly InventoryItem[];
  locations: readonly StorageLocation[];
  accessibilityLabel: string;
  onSeeAll: () => void;
}) {
  const { t, locale, prefs, dir } = useFormat();
  const byLocation = useMemo(
    () => new Map(locations.map((location) => [location.id, location])),
    [locations],
  );

  return (
    <View style={{ gap: spacing.lg }} accessibilityLabel={accessibilityLabel}>
      <SectionLabel actionLabel={t('mobile.home.seeAll')} onAction={onSeeAll}>
        {t('mobile.home.expiringStrip')}
      </SectionLabel>
      <View key={`use-soon-${dir}`}>
        {items.length === 0 ? (
          <AppText variant="caption" color="textMuted">
            {t('mobile.home.expiringNone')}
          </AppText>
        ) : (
          items.map((item) => {
            const name = itemName(locale, item);
            const location = byLocation.get(item.locationId);
            const meta = inventoryItemRowMeta(t, locale, item, { location, prefs });
            const when = inventoryItemRowWhen(t, locale, item, prefs);
            const badge = inventoryItemRowBadge(t, item);
            return (
              <InventoryItemRow
                key={item.id}
                item={inventoryItemRowFoodIcon(item)}
                name={name}
                meta={meta}
                badgeLabel={badge?.label}
                badgeTone={badge?.tone}
                when={when}
                accessibilityLabel={[name, meta, badge?.label, when].filter(Boolean).join(', ')}
              />
            );
          })
        )}
      </View>
    </View>
  );
}
