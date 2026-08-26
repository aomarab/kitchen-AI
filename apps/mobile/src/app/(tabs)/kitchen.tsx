import { useState } from 'react';
import { FlatList, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { InventoryItem, StorageLocation } from '@kitchen/contracts';
import {
  Screen,
  AppText,
  Field,
  Chip,
  ListRow,
  Badge,
  SegmentedControl,
  FoodIcon,
  EmptyState,
  ErrorState,
  LoadingState,
} from '../../components';
import type { BadgeTone } from '../../components/Badge';
import { useFormat } from '../../hooks/useFormat';
import { useInventory, useLocations } from '../../hooks/inventory';
import { itemName, formatMeasure, formatExpiryLabel, locationLabel } from '../../lib/format';
import { expiryStatus, type ExpiryStatus } from '../../lib/expiry';
import { spacing } from '../../theme';

type Sort = 'expiry' | 'name' | 'recent';

const EXPIRY_TONE: Record<ExpiryStatus, BadgeTone> = {
  expired: 'danger',
  today: 'danger',
  soon: 'warn',
  ok: 'success',
  none: 'neutral',
};

export default function Kitchen() {
  const { t, locale, prefs } = useFormat();
  const router = useRouter();
  // Arriving from the home dashboard's location chart opens this list already
  // filtered; the chips stay live afterwards, so the param is only a seed.
  const params = useLocalSearchParams<{ locationId?: string }>();
  const [search, setSearch] = useState('');
  const [locationId, setLocationId] = useState<string | undefined>(params.locationId);
  const [sort, setSort] = useState<Sort>('expiry');

  const locations = useLocations();
  const inventory = useInventory({ q: search || undefined, locationId, sort });
  const items = inventory.data?.items ?? [];

  const renderItem = ({ item }: { item: InventoryItem }) => {
    const status = expiryStatus(item.expiresAt);
    const expiryLabel = formatExpiryLabel(t, locale, item.expiresAt, prefs);
    return (
      <ListRow
        title={itemName(locale, item)}
        subtitle={formatMeasure(t, locale, item.quantity, item.unit, prefs)}
        onPress={() => router.push(`/item/${item.id}`)}
        showChevron
        leading={
          <FoodIcon
            item={{
              label: item.label,
              nameEn: item.ingredient.canonicalNameEn,
              nameAr: item.ingredient.canonicalNameAr,
              category: item.ingredient.category,
            }}
          />
        }
        trailing={
          expiryLabel ? <Badge tone={EXPIRY_TONE[status]} label={expiryLabel} /> : undefined
        }
      />
    );
  };

  return (
    <Screen padded={false} edges={['top']}>
      <View style={{ padding: spacing.lg, gap: spacing.md }}>
        <AppText variant="title">{t('inventory.title')}</AppText>
        <Field
          value={search}
          onChangeText={setSearch}
          placeholder={t('mobile.kitchen.searchPlaceholder')}
          autoCorrect={false}
        />
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={[null, ...(locations.data ?? [])]}
          keyExtractor={(loc: StorageLocation | null) => loc?.id ?? 'all'}
          contentContainerStyle={{ gap: spacing.sm }}
          renderItem={({ item: loc }) => (
            <Chip
              label={loc ? locationLabel(t, loc) : t('common.all')}
              selected={loc ? locationId === loc.id : locationId === undefined}
              onPress={() => setLocationId(loc?.id)}
            />
          )}
        />
        <SegmentedControl<Sort>
          value={sort}
          onChange={setSort}
          options={[
            { value: 'expiry', label: t('mobile.kitchen.sort.expiry') },
            { value: 'name', label: t('mobile.kitchen.sort.name') },
            { value: 'recent', label: t('mobile.kitchen.sort.recent') },
          ]}
        />
      </View>

      {inventory.isLoading ? (
        <LoadingState />
      ) : inventory.isError ? (
        <ErrorState error={inventory.error} onRetry={() => void inventory.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          icon="kitchen"
          title={t('inventory.emptyLocation')}
          actionLabel={t('inventory.addItem')}
          onAction={() => router.push('/capture')}
        />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={{
            padding: spacing.lg,
            paddingTop: 0,
            gap: spacing.sm,
          }}
          refreshing={inventory.isRefetching}
          onRefresh={() => void inventory.refetch()}
        />
      )}
    </Screen>
  );
}
