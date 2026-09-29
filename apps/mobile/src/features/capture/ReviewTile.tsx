import { Animated, Pressable, View } from 'react-native';
import type { StorageLocation } from '@kitchen/contracts';
import { AppText, Badge, FoodIcon, QuantityStepper } from '../../components';
import { usePressFeedback } from '../../components/press-feedback';
import { useFormat } from '../../hooks/useFormat';
import type { ReviewRow } from '../../lib/capture';
import { expiryPhrase } from '../../lib/review';
import { formatMeasure, localizedName, locationLabel, unitLabel } from '../../lib/format';
import { spacing } from '../../theme';
import { useTheme } from '../../theme/useTheme';

export interface ReviewTileProps {
  row: ReviewRow;
  location: StorageLocation | undefined;
  onPress: () => void;
  onQuantityChange: (quantity: number) => void;
}

function phraseLabel(
  t: ReturnType<typeof useFormat>['t'],
  phrase: ReturnType<typeof expiryPhrase>,
) {
  return phrase.count === undefined ? t(phrase.key) : t(phrase.key, { count: phrase.count });
}

function badgeFor(
  t: ReturnType<typeof useFormat>['t'],
  tone: ReturnType<typeof expiryPhrase>['tone'],
) {
  if (tone === 'success') return { label: t('mobile.home.freshOk'), tone: 'success' as const };
  if (tone === 'warn') return { label: t('mobile.home.statExpiring'), tone: 'warn' as const };
  if (tone === 'danger') return { label: t('inventory.expired'), tone: 'danger' as const };
  return { label: t('mobile.capture.noExpiry'), tone: 'muted' as const };
}

/** Flat J review row: item-row rhythm plus the capture-specific quantity stepper. */
export function ReviewTile({ row, location, onPress, onQuantityChange }: ReviewTileProps) {
  const { t, locale, prefs } = useFormat();
  const { colors } = useTheme();
  const pressFeedback = usePressFeedback();
  const name = localizedName(locale, row.nameEn, row.nameAr);
  const fallbackLocation = t('mobile.capture.selectLocation');
  const locationText = location ? locationLabel(t, location) : fallbackLocation;
  const expiry = expiryPhrase(row.expiresAt);
  const expiryText = phraseLabel(t, expiry);
  const badge = badgeFor(t, expiry.tone);
  const meta = `${formatMeasure(t, locale, row.quantity, row.unit, prefs)} · ${locationText}`;

  return (
    <View
      style={{
        paddingVertical: 10,
        gap: spacing.sm,
        borderBottomWidth: 1,
        borderBottomColor: colors.rowline,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('mobile.review.tileLabel', {
          name,
          location: locationText,
          expiry: expiryText,
        })}
        onPress={onPress}
        {...pressFeedback.pressHandlers}
      >
        <Animated.View
          style={[
            {
              minHeight: 76,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 14,
            },
            pressFeedback.animatedStyle,
          ]}
        >
          <FoodIcon item={row} size={56} />
          <View style={{ flex: 1, gap: 2 }}>
            <AppText variant="bodyStrong" numberOfLines={2}>
              {name}
            </AppText>
            <AppText variant="caption" color="textMuted">
              {meta}
            </AppText>
          </View>
          <View style={{ alignItems: 'flex-end', gap: spacing.xs }}>
            <Badge label={badge.label} tone={badge.tone} />
            <AppText variant="small" color="textMuted">
              {expiryText}
            </AppText>
          </View>
        </Animated.View>
      </Pressable>
      <View style={{ paddingStart: 56 + 14 }}>
        <QuantityStepper
          value={row.quantity}
          onChange={onQuantityChange}
          unit={unitLabel(t, row.unit)}
          accessibilityLabel={name}
          decrementLabel={t('mobile.common.decrease')}
          incrementLabel={t('mobile.common.increase')}
        />
      </View>
    </View>
  );
}
