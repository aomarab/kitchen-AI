import { useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Pressable,
  ScrollView,
  View,
  type LayoutChangeEvent,
  type TextInput,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { InventoryItem, StorageLocation, StorageLocationType } from '@kitchen/contracts';
import {
  AppText,
  Badge,
  Bento,
  BentoColumn,
  Button,
  Chip,
  EmptyState,
  ErrorState,
  Field,
  FoodIcon,
  Icon,
  ListGroup,
  ListRow,
  LoadingState,
  RoundButton,
  Screen,
  SegmentedControl,
  TabHeader,
  Tile,
  type IconName,
} from '../../components';
import { BENTO_GUTTER } from '../../components/tile-layout';
import { useFormat } from '../../hooks/useFormat';
import { useInventory, useInventorySnapshot, useLocations } from '../../hooks/inventory';
import { expiryStatus, type ExpiryStatus } from '../../lib/expiry';
import {
  formatExpiryLabel,
  formatMeasure,
  formatQty,
  itemName,
  locationLabel,
} from '../../lib/format';
import {
  EXPIRY_TONE,
  countMessage,
  justAdded,
  parseSection,
  parseSort,
  placeAccessibilityLabel,
  placeCaption,
  placeTint,
  rankPlaces,
  useFirst,
  type KitchenSort,
} from '../../lib/kitchen';
import { hitSlop, radius, spacing, type ColorToken } from '../../theme';
import { useTheme } from '../../theme/useTheme';
import { useTabBarClearance } from '../../components/TabBar';

const COMPACT_PLACE_TILE_HEIGHT = 74;
const MINI_CARD_WIDTH = '31.5%';

const LOCATION_ICON: Record<StorageLocationType, IconName> = {
  fridge: 'kitchen',
  freezer: 'snowflake',
  pantry: 'box',
  spice_rack: 'restaurant',
  other: 'box',
};

function HeaderActions({
  searchOpen,
  onSearchPress,
  onAddPress,
  searchLabel,
  addLabel,
}: {
  searchOpen: boolean;
  onSearchPress: () => void;
  onAddPress: () => void;
  searchLabel: string;
  addLabel: string;
}) {
  return (
    <View style={{ flexDirection: 'row', gap: spacing.xs }}>
      <RoundButton
        size={40}
        tone="surface"
        icon={searchOpen ? 'close' : 'search'}
        accessibilityLabel={searchLabel}
        onPress={onSearchPress}
      />
      <RoundButton
        size={40}
        tone="primary"
        icon="plus"
        accessibilityLabel={addLabel}
        onPress={onAddPress}
      />
    </View>
  );
}

function PlaceIcon({ type }: { type: StorageLocationType }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.surface,
      }}
    >
      <Icon name={LOCATION_ICON[type]} size={18} color={colors.text} />
    </View>
  );
}

function CompactPlaceContent({
  location,
  count,
  label,
}: {
  location: StorageLocation;
  count: string;
  label: string;
}) {
  return (
    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
      <PlaceIcon type={location.type} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <AppText variant="numeral">{count}</AppText>
        <AppText variant="caption" muted>
          {label}
        </AppText>
      </View>
    </View>
  );
}

function MiniItemCard({
  item,
  name,
  detail,
  detailColor,
  accessibilityLabel,
  onPress,
}: {
  item: InventoryItem;
  name: string;
  detail: string;
  detailColor?: ColorToken;
  accessibilityLabel: string;
  onPress: () => void;
}) {
  const { colors, isDark, shadow } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      hitSlop={hitSlop}
      style={({ pressed }) => [
        {
          width: MINI_CARD_WIDTH,
          minHeight: 112,
          borderRadius: radius.lg,
          borderWidth: 1,
          borderColor: isDark ? colors.border : colors.surface,
          backgroundColor: colors.surface,
          padding: spacing.md,
          gap: spacing.sm,
          opacity: pressed ? 0.92 : 1,
          transform: [{ scale: pressed ? 0.98 : 1 }],
        },
        isDark ? null : shadow.card,
      ]}
    >
      <FoodIcon item={foodIconItem(item)} size={40} />
      <View style={{ gap: 2 }}>
        <AppText variant="bodyStrong" numberOfLines={2}>
          {name}
        </AppText>
        <AppText variant="caption" color={detailColor} muted={!detailColor} numberOfLines={1}>
          {detail}
        </AppText>
      </View>
    </Pressable>
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

function foodIconItem(item: InventoryItem) {
  return {
    label: item.label,
    nameEn: item.ingredient.canonicalNameEn,
    nameAr: item.ingredient.canonicalNameAr,
    category: item.ingredient.category,
  };
}

function expiryTextColor(status: ExpiryStatus): ColorToken {
  if (status === 'expired' || status === 'today') return 'danger';
  if (status === 'soon') return 'warn';
  return 'textMuted';
}

export default function Kitchen() {
  const { colors } = useTheme();
  const { t, locale, prefs } = useFormat();
  const router = useRouter();
  const clearance = useTabBarClearance();
  const params = useLocalSearchParams<{
    locationId?: string;
    sort?: string;
    section?: string;
  }>();
  const listRef = useRef<FlatList<InventoryItem>>(null);
  const searchRef = useRef<TextInput>(null);
  const now = useMemo(() => new Date(), []);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [locationId, setLocationId] = useState<string | undefined>(params.locationId);
  const [sort, setSort] = useState<KitchenSort>(() => parseSort(params.sort) ?? 'expiry');
  const [allItemsY, setAllItemsY] = useState<number | null>(null);
  const [justAddedY, setJustAddedY] = useState<number | null>(null);

  const locationsQuery = useLocations();
  const snapshotQuery = useInventorySnapshot();
  const inventory = useInventory({ q: query || undefined, locationId, sort });

  const snapshotItems = snapshotQuery.data?.items ?? [];
  const locations = locationsQuery.data ?? [];
  const listItems = inventory.data?.items ?? [];
  const useFirstItems = useFirst(snapshotItems, now);
  const recentItems = justAdded(snapshotItems);
  const places = useMemo(
    () => rankPlaces(snapshotItems, locations, (location) => locationLabel(t, location), now),
    [locations, now, snapshotItems, t],
  );

  useEffect(() => {
    if (!searchOpen) {
      setQuery('');
      return;
    }
    const frame = requestAnimationFrame(() => searchRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [searchOpen]);

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

  const toggleLocation = (id: string) =>
    setLocationId((current) => (current === id ? undefined : id));
  const addItem = () => router.push('/capture?method=manual');
  const seeAllUseFirst = () => {
    setSort('expiry');
    setLocationId(undefined);
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

  const renderPlaceTile = (ranked: (typeof places)[number], rank: number, compact: boolean) => {
    const label = locationLabel(t, ranked.location);
    const caption = placeCaption(t, ranked.location);
    const count = formatQty(locale, ranked.count, prefs);
    const soon = formatQty(locale, ranked.soon, prefs);
    const selected = locationId === ranked.location.id;
    const soonBadge =
      ranked.soon > 0 ? (
        <Badge tone="warn" label={countMessage(t, 'mobile.kitchen.soonCount', ranked.soon, soon)} />
      ) : undefined;

    if (compact) {
      return (
        <Tile
          key={ranked.location.id}
          tint={placeTint(rank)}
          height={COMPACT_PLACE_TILE_HEIGHT}
          accessibilityLabel={placeAccessibilityLabel({
            t,
            caption,
            count: ranked.count,
            formattedCount: count,
            soon: ranked.soon,
            formattedSoon: soon,
          })}
          accessibilityState={selected ? { selected: true } : undefined}
          leading={<CompactPlaceContent location={ranked.location} count={count} label={label} />}
          corner={soonBadge}
          onPress={() => toggleLocation(ranked.location.id)}
        />
      );
    }

    return (
      <Tile
        key={ranked.location.id}
        tint="butter"
        icon={LOCATION_ICON[ranked.location.type]}
        height={COMPACT_PLACE_TILE_HEIGHT * 2 + BENTO_GUTTER}
        count={count}
        caption={caption}
        corner={soonBadge}
        accessibilityLabel={placeAccessibilityLabel({
          t,
          caption,
          count: ranked.count,
          formattedCount: count,
          soon: ranked.soon,
          formattedSoon: soon,
        })}
        accessibilityState={selected ? { selected: true } : undefined}
        onPress={() => toggleLocation(ranked.location.id)}
      />
    );
  };

  const miniGrid = (
    items: readonly InventoryItem[],
    detailFor: (item: InventoryItem) => { text: string; color?: ColorToken },
  ) => (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
      {items.map((item) => {
        const detail = detailFor(item);
        const name = itemName(locale, item);
        return (
          <MiniItemCard
            key={item.id}
            item={item}
            name={name}
            detail={detail.text}
            detailColor={detail.color}
            accessibilityLabel={`${name}, ${detail.text}`}
            onPress={() => router.push(`/item/${item.id}`)}
          />
        );
      })}
    </View>
  );

  const content = (
    <View style={{ padding: spacing.lg, gap: spacing.lg }}>
      <TabHeader
        title={t('inventory.title')}
        action={
          <HeaderActions
            searchOpen={searchOpen}
            searchLabel={t('mobile.kitchen.search')}
            addLabel={t('inventory.addItem')}
            onSearchPress={() => setSearchOpen((open) => !open)}
            onAddPress={addItem}
          />
        }
      />

      {searchOpen ? (
        <Field
          ref={searchRef}
          value={query}
          onChangeText={setQuery}
          placeholder={t('mobile.kitchen.searchPlaceholder')}
          autoCorrect={false}
          style={{ backgroundColor: colors.surfaceAlt }}
        />
      ) : null}

      {places.length > 0 ? (
        <Bento>
          {places[0] ? renderPlaceTile(places[0], 0, false) : null}
          {places[1] || places[2] ? (
            <BentoColumn>
              {places[1] ? renderPlaceTile(places[1], 1, true) : null}
              {places[2] ? renderPlaceTile(places[2], 2, true) : null}
            </BentoColumn>
          ) : null}
          {places.slice(3).map((place, index) => renderPlaceTile(place, index + 3, true))}
        </Bento>
      ) : null}

      {useFirstItems.length > 0 ? (
        <View style={{ gap: spacing.sm }}>
          <SectionHeading
            title={t('mobile.kitchen.useFirst')}
            actionLabel={t('mobile.home.seeAll')}
            onAction={seeAllUseFirst}
          />
          {miniGrid(useFirstItems, (item) => {
            const status = expiryStatus(item.expiresAt, now);
            return {
              text: formatExpiryLabel(t, locale, item.expiresAt, prefs, now) ?? '',
              color: expiryTextColor(status),
            };
          })}
        </View>
      ) : null}

      {recentItems.length > 0 ? (
        <View
          style={{ gap: spacing.sm }}
          onLayout={(event) => setJustAddedY(event.nativeEvent.layout.y)}
        >
          <SectionHeading title={t('mobile.kitchen.justAdded')} />
          {miniGrid(recentItems, (item) => ({
            text: formatMeasure(t, locale, item.quantity, item.unit, prefs),
          }))}
        </View>
      ) : null}

      <View
        style={{ gap: spacing.md }}
        onLayout={(event) => setAllItemsY(event.nativeEvent.layout.y)}
      >
        <SectionHeading title={t('mobile.kitchen.allItems')} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ flexDirection: 'row', gap: spacing.sm, paddingVertical: spacing.xs }}>
            <Chip
              label={t('common.all')}
              selected={locationId === undefined}
              onPress={() => setLocationId(undefined)}
            />
            {locations.map((location) => (
              <Chip
                key={location.id}
                label={locationLabel(t, location)}
                selected={locationId === location.id}
                onPress={() => toggleLocation(location.id)}
              />
            ))}
          </View>
        </ScrollView>
        <SegmentedControl<KitchenSort>
          value={sort}
          onChange={setSort}
          options={[
            { value: 'expiry', label: t('mobile.kitchen.sort.expiry') },
            { value: 'name', label: t('mobile.kitchen.sort.name') },
            { value: 'recent', label: t('mobile.kitchen.sort.recent') },
          ]}
        />

        {inventory.isLoading ? (
          <LoadingState />
        ) : inventory.isError ? (
          <ErrorState error={inventory.error} onRetry={() => void inventory.refetch()} />
        ) : listItems.length === 0 ? (
          <EmptyState
            icon="kitchen"
            title={t('inventory.emptyLocation')}
            actionLabel={t('inventory.addItem')}
            onAction={addItem}
          />
        ) : (
          <ListGroup>
            {listItems.map((item) => {
              const name = itemName(locale, item);
              const expiryLabel = formatExpiryLabel(t, locale, item.expiresAt, prefs, now);
              return (
                <ListRow
                  key={item.id}
                  grouped
                  title={name}
                  subtitle={formatMeasure(t, locale, item.quantity, item.unit, prefs)}
                  accessibilityLabel={name}
                  onPress={() => router.push(`/item/${item.id}`)}
                  showChevron
                  leading={<FoodIcon item={foodIconItem(item)} />}
                  trailing={
                    expiryLabel ? (
                      <Badge
                        tone={EXPIRY_TONE[expiryStatus(item.expiresAt, now)]}
                        label={expiryLabel}
                      />
                    ) : undefined
                  }
                />
              );
            })}
          </ListGroup>
        )}
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
        contentContainerStyle={{ paddingBottom: clearance }}
        refreshing={
          inventory.isRefetching || snapshotQuery.isRefetching || locationsQuery.isRefetching
        }
        onRefresh={refresh}
      />
    </Screen>
  );
}
