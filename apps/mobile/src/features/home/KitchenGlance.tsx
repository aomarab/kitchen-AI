import { useMemo } from 'react';
import { View } from 'react-native';
import type { InventoryItem, StorageLocation } from '@kitchen/contracts';
import type { MessageKey, Translator } from '@kitchen/i18n';
import { AppText, Bento, SectionLabel, Tile } from '../../components';
import { useFormat } from '../../hooks/useFormat';
import { formatQty, locationLabel } from '../../lib/format';
import { placeAccessibilityLabel, placeIllustration, rankPlaces } from '../../lib/kitchen';
import { spacing } from '../../theme';

function countMessage(
  t: Translator,
  key: MessageKey,
  count: number,
  formattedCount: string,
): string {
  const raw = t(key, { count });
  return raw.replace(String(count), formattedCount);
}

function PlaceTile({
  place,
  onPress,
}: {
  place: ReturnType<typeof rankPlaces>[number];
  onPress: () => void;
}) {
  const { t, locale, prefs } = useFormat();
  const label = locationLabel(t, place.location);
  const count = formatQty(locale, place.count, prefs);
  const soon = formatQty(locale, place.soon, prefs);
  const countText = `${count} ${t('mobile.home.glanceItems')}`;
  const soonBadge =
    place.soon > 0 ? countMessage(t, 'mobile.kitchen.soonCount', place.soon, soon) : undefined;

  return (
    <Tile
      variant="place"
      illustration={placeIllustration(place.location.type)}
      count={label}
      caption={countText}
      badgeLabel={soonBadge}
      accessibilityLabel={placeAccessibilityLabel({
        t,
        caption: label,
        count: place.count,
        formattedCount: count,
        soon: place.soon,
        formattedSoon: soon,
      })}
      onPress={onPress}
    />
  );
}

export function KitchenGlanceSection({
  items,
  locations,
  now,
  onSeeAll,
  onPlacePress,
}: {
  items: readonly InventoryItem[];
  locations: readonly StorageLocation[];
  now: Date;
  onSeeAll: () => void;
  onPlacePress: (locationId: string) => void;
}) {
  const { t } = useFormat();
  const places = useMemo(
    () => rankPlaces(items, locations, (location) => locationLabel(t, location), now).slice(0, 4),
    [items, locations, now, t],
  );

  return (
    <View style={{ gap: spacing.lg }}>
      <SectionLabel actionLabel={t('mobile.home.seeAll')} onAction={onSeeAll}>
        {t('mobile.home.glanceTitle')}
      </SectionLabel>
      {places.length === 0 ? (
        <AppText variant="caption" color="textMuted">
          {t('mobile.home.glanceEmpty')}
        </AppText>
      ) : (
        <Bento>
          {places.map((place) => (
            <PlaceTile
              key={place.location.id}
              place={place}
              onPress={() => onPlacePress(place.location.id)}
            />
          ))}
        </Bento>
      )}
    </View>
  );
}
