import { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, ScrollView, View, type LayoutChangeEvent } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { InventoryItem } from '@kitchen/contracts';
import {
  AppText,
  Bento,
  Button,
  Chip,
  EmptyState,
  ErrorState,
  Header,
  IconButton,
  ListRow,
  LoadingState,
  Screen,
  SearchField,
  Sheet,
  TabHeader,
  Tile,
} from '../../components';
import { InventoryItemRow } from '../../features/inventory/InventoryItemRow';
import { useFormat } from '../../hooks/useFormat';
import { useInventory, useInventorySnapshot, useLocations } from '../../hooks/inventory';
import { formatExpiryLabel, formatQty, itemName, locationLabel } from '../../lib/format';
import {
  countMessage,
  justAdded,
  kitchenInventoryQuery,
  parseSection,
  parseSort,
  placeAccessibilityLabel,
  placeIllustration,
  rankPlaces,
  useFirst,
  type KitchenSort,
} from '../../lib/kitchen';
import {
  inventoryItemRowBadge,
  inventoryItemRowFoodIcon,
  inventoryItemRowMeta,
  inventoryItemRowWhen,
} from '../../lib/inventory-row';
import { spacing } from '../../theme';
import { useTabBarClearance } from '../../components/TabBar';

const SORT_OPTIONS: readonly KitchenSort[] = ['expiry', 'name', 'recent'];

type RankedPlace = ReturnType<typeof rankPlaces>[number];

function HeaderActions({ onAddPress }: { onAddPress: () => void }) {
  const { t } = useFormat();
  return (
    <IconButton
      icon="plus"
      tone="plain"
      accessibilityLabel={t('inventory.addItem')}
      onPress={onAddPress}
    />
  );
}

function SortAction({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Button title={label} variant="ghost" leadingIcon="sort" fullWidth={false} onPress={onPress} />
  );
}

function SectionHeading({
  title,
  actionLabel,
  onAction,
  onLayout,
}: {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
  onLayout?: (event: LayoutChangeEvent) => void;
}) {
  return (
    <View
      onLayout={onLayout}
      style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}
    >
      <AppText variant="heading" accessibilityRole="header" style={{ flex: 1 }}>
        {title}
      </AppText>
      {actionLabel && onAction ? (
        <Button title={actionLabel} variant="ghost" fullWidth={false} onPress={onAction} />
      ) : null}
    </View>
  );
}

function formattedCountMessage(
  t: ReturnType<typeof useFormat>['t'],
  key: Parameters<typeof countMessage>[1],
  count: number,
  formattedCount: string,
  extra?: Record<string, string | number>,
) {
  return countMessage(t, key, count, formattedCount, extra);
}

function PlaceTile({ ranked, onPress }: { ranked: RankedPlace; onPress: () => void }) {
  const { t, locale, prefs } = useFormat();
  const label = locationLabel(t, ranked.location);
  const count = formatQty(locale, ranked.count, prefs);
  const soon = formatQty(locale, ranked.soon, prefs);
  const countText = formattedCountMessage(t, 'inventory.itemCount', ranked.count, count);
  const soonBadge =
    ranked.soon > 0
      ? formattedCountMessage(t, 'mobile.kitchen.soonCount', ranked.soon, soon)
      : undefined;

  return (
    <Tile
      variant="place"
      illustration={placeIllustration(ranked.location.type)}
      count={label}
      caption={countText}
      badgeLabel={soonBadge}
      accessibilityLabel={placeAccessibilityLabel({
        t,
        caption: label,
        count: ranked.count,
        formattedCount: count,
        soon: ranked.soon,
        formattedSoon: soon,
      })}
      onPress={onPress}
    />
  );
}

function SortSheet({
  visible,
  value,
  onChange,
  onClose,
}: {
  visible: boolean;
  value: KitchenSort;
  onChange: (value: KitchenSort) => void;
  onClose: () => void;
}) {
  const { t } = useFormat();
  return (
    <Sheet visible={visible} onClose={onClose} title={t('mobile.kitchen.sortBy')}>
      <View>
        {SORT_OPTIONS.map((option) => {
          const selected = value === option;
          return (
            <ListRow
              key={option}
              title={t(`mobile.kitchen.sort.${option}`)}
              checked={selected}
              accessibilityState={{ selected }}
              onPress={() => {
                onChange(option);
                onClose();
              }}
            />
          );
        })}
      </View>
    </Sheet>
  );
}

export default function Kitchen() {
  const { t, locale, prefs } = useFormat();
  const router = useRouter();
  const clearance = useTabBarClearance();
  const params = useLocalSearchParams<{
    locationId?: string;
    sort?: string;
    section?: string;
  }>();
  const listRef = useRef<FlatList<InventoryItem>>(null);
  const now = useMemo(() => new Date(), []);
  const [query, setQuery] = useState('');
  const [locationId, setLocationId] = useState<string | undefined>(params.locationId);
  const [sort, setSort] = useState<KitchenSort>(() => parseSort(params.sort) ?? 'expiry');
  const [sortOpen, setSortOpen] = useState(false);
  const [allItemsY, setAllItemsY] = useState<number | null>(null);
  const [justAddedY, setJustAddedY] = useState<number | null>(null);

  const locationsQuery = useLocations();
  const snapshotQuery = useInventorySnapshot();
  const inventory = useInventory(kitchenInventoryQuery({ query, locationId, sort }));

  const snapshotItems = snapshotQuery.data?.items ?? [];
  const locations = locationsQuery.data ?? [];
  const listItems = inventory.data?.items ?? [];
  const byLocation = useMemo(
    () => new Map(locations.map((location) => [location.id, location])),
    [locations],
  );
  const selectedLocation = locationId ? byLocation.get(locationId) : undefined;
  const visibleSnapshotItems = useMemo(
    () =>
      locationId ? snapshotItems.filter((item) => item.locationId === locationId) : snapshotItems,
    [locationId, snapshotItems],
  );
  const useFirstItems = useFirst(visibleSnapshotItems, now);
  const recentItems = justAdded(visibleSnapshotItems);
  const places = useMemo(
    () => rankPlaces(snapshotItems, locations, (location) => locationLabel(t, location), now),
    [locations, now, snapshotItems, t],
  );
  const selectedRank = selectedLocation
    ? places.find((place) => place.location.id === selectedLocation.id)
    : undefined;

  useEffect(() => setLocationId(params.locationId), [params.locationId]);

  const section = parseSection(params.section);
  useEffect(() => {
    if (section !== 'justAdded') return;
    if (recentItems.length === 0) {
      router.setParams({ section: undefined });
      return;
    }
    if (justAddedY === null) return;
    listRef.current?.scrollToOffset({
      offset: Math.max(0, justAddedY - spacing.lg),
      animated: true,
    });
    router.setParams({ section: undefined });
  }, [justAddedY, recentItems.length, router, section]);

  const addItem = () => router.push('/capture?method=manual');
  const openPlace = (id: string) => {
    setLocationId(id);
    router.setParams({ locationId: id });
  };
  const clearPlace = () => {
    setLocationId(undefined);
    router.setParams({ locationId: undefined });
  };
  const seeAllUseFirst = () => {
    setSort('expiry');
    if (locationId) clearPlace();
    if (allItemsY !== null) {
      listRef.current?.scrollToOffset({
        offset: Math.max(0, allItemsY - spacing.lg),
        animated: true,
      });
    }
  };
  const refresh = () => {
    void snapshotQuery.refetch();
    void inventory.refetch();
    void locationsQuery.refetch();
  };

  const renderInventoryItemRow = (item: InventoryItem, includeLocation: boolean) => {
    const name = itemName(locale, item);
    const location = byLocation.get(item.locationId);
    const meta = inventoryItemRowMeta(t, locale, item, {
      location,
      brand: item.brand,
      includeLocation,
      prefs,
    });
    const when = inventoryItemRowWhen(t, locale, item, prefs, now);
    const badge = inventoryItemRowBadge(t, item, now);
    const expiryAccessibility = formatExpiryLabel(t, locale, item.expiresAt, prefs, now);
    return (
      <InventoryItemRow
        key={item.id}
        item={inventoryItemRowFoodIcon(item)}
        name={name}
        meta={meta}
        badgeLabel={badge?.label}
        badgeTone={badge?.tone}
        when={when}
        accessibilityLabel={[name, meta, badge?.label, expiryAccessibility]
          .filter(Boolean)
          .join(', ')}
        onPress={() => router.push(`/item/${item.id}`)}
      />
    );
  };

  const allCount = formatQty(locale, snapshotItems.length, prefs);
  const selectedCount = formatQty(locale, selectedRank?.count ?? 0, prefs);
  const selectedSoon = formatQty(locale, selectedRank?.soon ?? 0, prefs);
  const selectedSummary = selectedRank
    ? [
        formattedCountMessage(t, 'inventory.itemCount', selectedRank.count, selectedCount),
        selectedRank.soon > 0
          ? formattedCountMessage(t, 'mobile.kitchen.placeSoon', selectedRank.soon, selectedSoon)
          : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : null;
  const sortLabel = t(`mobile.kitchen.sort.${sort}`);

  const content = (
    <View style={{ paddingBottom: clearance, gap: spacing.xl }}>
      {selectedLocation ? (
        <Header
          title={locationLabel(t, selectedLocation)}
          onBack={clearPlace}
          trailing={
            <IconButton
              icon="plus"
              tone="plain"
              accessibilityLabel={t('inventory.addItem')}
              onPress={addItem}
            />
          }
        />
      ) : (
        <>
          <TabHeader title={t('inventory.title')} action={<HeaderActions onAddPress={addItem} />} />
          <View style={{ paddingHorizontal: spacing.gutter }}>
            <SearchField
              value={query}
              onChangeText={setQuery}
              placeholder={t('mobile.kitchen.searchPlaceholder')}
              autoCorrect={false}
            />
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View
              style={{
                flexDirection: 'row',
                gap: spacing.sm,
                paddingHorizontal: spacing.gutter,
                paddingVertical: spacing.xs,
              }}
            >
              <Chip
                label={t('common.all')}
                count={snapshotItems.length}
                countAccessibilityLabel={formattedCountMessage(
                  t,
                  'inventory.itemCount',
                  snapshotItems.length,
                  allCount,
                )}
                selected={!locationId}
                onPress={clearPlace}
              />
              {places.map((place) => (
                <Chip
                  key={place.location.id}
                  label={locationLabel(t, place.location)}
                  count={place.count}
                  countAccessibilityLabel={formattedCountMessage(
                    t,
                    'inventory.itemCount',
                    place.count,
                    formatQty(locale, place.count, prefs),
                  )}
                  selected={locationId === place.location.id}
                  onPress={() => openPlace(place.location.id)}
                />
              ))}
            </View>
          </ScrollView>
          {places.length > 0 ? (
            <View style={{ paddingHorizontal: spacing.gutter }}>
              <Bento variant="tiles">
                {places.slice(0, 4).map((ranked) => (
                  <PlaceTile
                    key={ranked.location.id}
                    ranked={ranked}
                    onPress={() => openPlace(ranked.location.id)}
                  />
                ))}
              </Bento>
            </View>
          ) : null}
        </>
      )}

      <View style={{ paddingHorizontal: spacing.gutter, gap: spacing.xl }}>
        {selectedLocation && selectedSummary ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <AppText variant="caption" muted style={{ flex: 1 }}>
              {selectedSummary}
            </AppText>
            <SortAction label={sortLabel} onPress={() => setSortOpen(true)} />
          </View>
        ) : null}

        {useFirstItems.length > 0 ? (
          <View style={{ gap: spacing.sm }}>
            <SectionHeading
              title={t('mobile.kitchen.useFirst')}
              actionLabel={selectedLocation ? undefined : t('mobile.home.seeAll')}
              onAction={selectedLocation ? undefined : seeAllUseFirst}
            />
            <View>
              {useFirstItems.map((item) => renderInventoryItemRow(item, !selectedLocation))}
            </View>
          </View>
        ) : null}

        {!selectedLocation && recentItems.length > 0 ? (
          <View
            style={{ gap: spacing.sm }}
            onLayout={(event) => setJustAddedY(event.nativeEvent.layout.y)}
          >
            <SectionHeading title={t('mobile.kitchen.justAdded')} />
            <View>
              {recentItems.map((item) => renderInventoryItemRow(item, !selectedLocation))}
            </View>
          </View>
        ) : null}

        <View
          style={{ gap: spacing.sm }}
          onLayout={(event) => setAllItemsY(event.nativeEvent.layout.y)}
        >
          <SectionHeading
            title={t('mobile.kitchen.allItems')}
            actionLabel={selectedLocation ? undefined : t('mobile.kitchen.sortBy')}
            onAction={selectedLocation ? undefined : () => setSortOpen(true)}
          />

          {inventory.isLoading ? (
            <LoadingState />
          ) : inventory.isError ? (
            <ErrorState error={inventory.error} onRetry={() => void inventory.refetch()} />
          ) : listItems.length === 0 ? (
            <EmptyState
              illustration="pantry"
              title={t('inventory.emptyLocation')}
              actionLabel={t('inventory.addItem')}
              onAction={addItem}
            />
          ) : (
            <View>{listItems.map((item) => renderInventoryItemRow(item, !selectedLocation))}</View>
          )}
        </View>
      </View>
    </View>
  );

  return (
    <Screen padded={false} edges={['top', 'left', 'right']}>
      <FlatList
        ref={listRef}
        data={[] as InventoryItem[]}
        keyExtractor={(item) => item.id}
        renderItem={() => null}
        ListHeaderComponent={content}
        contentContainerStyle={{ paddingBottom: 0 }}
        refreshing={
          inventory.isRefetching || snapshotQuery.isRefetching || locationsQuery.isRefetching
        }
        onRefresh={refresh}
      />
      <SortSheet
        visible={sortOpen}
        value={sort}
        onChange={setSort}
        onClose={() => setSortOpen(false)}
      />
    </Screen>
  );
}
