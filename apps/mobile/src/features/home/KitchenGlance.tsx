import { useMemo } from 'react';
import { Pressable, useWindowDimensions, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { StorageLocation } from '@kitchen/contracts';
import { AppText, Card, DirectionalIcon, Ring } from '../../components';
import { useFormat } from '../../hooks/useFormat';
import { locationLabel, formatPercent, formatQty } from '../../lib/format';
import { freshnessCounts, locationSlices, ringTicks, type LocatedItem } from '../../lib/home-stats';
import { CHROME_MAX_FONT_SCALE, colors, radius, spacing, tintFor } from '../../theme';

/** Enough ticks to read as a ring, few enough that a slice is still countable. */
const TICKS = 48;

/**
 * Where the kitchen's stock actually sits, and how much of it is about to go
 * off — the two questions the app exists to answer, as one picture.
 *
 * The donut is deliberately the *smaller* half of this card. A donut is a weak
 * chart: slices are told apart by colour alone, angles are hard to compare, and
 * it collapses entirely past a handful of categories. So it is paired with a
 * legend that repeats every value as text and as a percentage, which is both
 * the accessible fallback and, for most readers, the part they will actually
 * use. The chart earns its place by making the *shape* of the kitchen legible
 * at a glance, not by being the source of the numbers.
 */
export function KitchenGlance({
  items,
  locations,
}: {
  items: readonly LocatedItem[];
  locations: readonly StorageLocation[];
}) {
  const { t, locale, prefs } = useFormat();
  const { fontScale } = useWindowDimensions();
  const stacked = fontScale > 1.3;
  const router = useRouter();

  const slices = useMemo(() => locationSlices(items), [items]);
  const ticks = useMemo(
    () =>
      ringTicks(
        slices.map((slice) => slice.ratio),
        TICKS,
      ),
    [slices],
  );
  const freshness = useMemo(() => freshnessCounts(items), [items]);

  if (items.length === 0) {
    return (
      <Card>
        <AppText variant="heading">{t('mobile.home.glanceTitle')}</AppText>
        <AppText muted>{t('mobile.home.glanceEmpty')}</AppText>
      </Card>
    );
  }

  const byId = new Map(locations.map((location) => [location.id, location]));
  const nameFor = (locationId: string | null) => {
    if (locationId === null) return t('mobile.home.glanceOther');
    const location = byId.get(locationId);
    return location ? locationLabel(t, location) : t('mobile.home.glanceOther');
  };

  // Urgency reuses the tones the Kitchen list already badges items with, so the
  // bar and the rows it summarises cannot disagree. "Expired" and "today" share
  // the danger tone there, so they share a segment here.
  const urgent = freshness.expired + freshness.today;
  const bar = [
    {
      key: 'urgent',
      value: urgent,
      color: colors.danger,
      label: t('mobile.home.freshUrgent'),
    },
    {
      key: 'soon',
      value: freshness.soon,
      color: colors.warn,
      label: t('mobile.home.freshSoon'),
    },
    {
      key: 'ok',
      value: freshness.ok,
      color: colors.success,
      label: t('mobile.home.freshOk'),
    },
    {
      key: 'none',
      value: freshness.none,
      color: colors.border,
      label: t('mobile.home.freshNone'),
    },
  ].filter((segment) => segment.value > 0);

  return (
    <Card>
      <AppText variant="heading">{t('mobile.home.glanceTitle')}</AppText>

      {/* Side by side is the compact reading, but the ring has a floor width and
          the legend rows need room for a place name. Past roughly a third above
          the default text size the two stop both fitting on a phone, so the ring
          moves above the legend and gives it the full width back. */}
      <View
        style={
          stacked
            ? { alignItems: 'center', gap: spacing.md }
            : { flexDirection: 'row', alignItems: 'center', gap: spacing.lg }
        }
      >
        <Ring ticks={ticks.map((index) => (index === null ? null : tintFor(index).fg))}>
          <AppText variant="title" maxFontSizeMultiplier={CHROME_MAX_FONT_SCALE}>
            {formatQty(locale, items.length, prefs)}
          </AppText>
          <AppText variant="caption" muted maxFontSizeMultiplier={CHROME_MAX_FONT_SCALE}>
            {t('mobile.home.glanceItems')}
          </AppText>
        </Ring>

        <View style={stacked ? { alignSelf: 'stretch' } : { flex: 1 }}>
          {slices.map((slice, index) => {
            const name = nameFor(slice.locationId);
            const share = formatPercent(locale, slice.ratio, prefs);
            const count = formatQty(locale, slice.count, prefs);
            return (
              <Pressable
                key={slice.locationId ?? 'other'}
                accessibilityRole="button"
                accessibilityLabel={`${name}, ${count}, ${share}`}
                onPress={() =>
                  router.push(
                    slice.locationId ? `/kitchen?locationId=${slice.locationId}` : '/kitchen',
                  )
                }
                style={({ pressed }) => ({
                  minHeight: 44,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: spacing.sm,
                  opacity: pressed ? 0.6 : 1,
                })}
              >
                <View
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: radius.pill,
                    backgroundColor: tintFor(index).fg,
                  }}
                />
                <AppText variant="caption" numberOfLines={1} style={{ flex: 1 }}>
                  {name}
                </AppText>
                <AppText variant="caption" muted>
                  {count}
                </AppText>
                <AppText variant="label">{share}</AppText>
                <DirectionalIcon name="chevron" size={14} color={colors.textMuted} />
              </Pressable>
            );
          })}
        </View>
      </View>

      <AppText variant="label" muted>
        {t('mobile.home.freshnessTitle')}
      </AppText>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{
          flexDirection: 'row',
          height: 10,
          borderRadius: radius.pill,
          overflow: 'hidden',
          gap: 2,
        }}
      >
        {bar.map((segment) => (
          <View
            key={segment.key}
            style={{
              flexGrow: segment.value,
              minWidth: 6,
              backgroundColor: segment.color,
            }}
          />
        ))}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
        {bar.map((segment) => (
          <View
            key={segment.key}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.xs,
            }}
          >
            <View
              style={{
                width: 8,
                height: 8,
                borderRadius: radius.pill,
                backgroundColor: segment.color,
              }}
            />
            <AppText variant="caption" muted>
              {segment.label} {formatQty(locale, segment.value, prefs)}
            </AppText>
          </View>
        ))}
      </View>
    </Card>
  );
}
