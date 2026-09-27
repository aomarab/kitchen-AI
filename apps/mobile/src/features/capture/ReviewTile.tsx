import { Pressable, View } from 'react-native';
import type { StorageLocation } from '@kitchen/contracts';
import { AppText, Chip, FoodIcon, QuantityStepper } from '../../components';
import { useFormat } from '../../hooks/useFormat';
import type { ReviewRow } from '../../lib/capture';
import { expiryPhrase } from '../../lib/review';
import { localizedName, locationLabel, unitLabel } from '../../lib/format';
import { radius, spacing, type Tint } from '../../theme';
import { useTheme } from '../../theme/useTheme';

export interface ReviewTileProps {
  row: ReviewRow;
  tint: Tint;
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

/** A bento review tile whose body and quantity stepper are separate accessibility elements. */
export function ReviewTile({ row, tint, location, onPress, onQuantityChange }: ReviewTileProps) {
  const { t, locale } = useFormat();
  const { colors, isDark, shadow } = useTheme();
  const name = localizedName(locale, row.nameEn, row.nameAr);
  const fallbackLocation = t('mobile.capture.selectLocation');
  const locationText = location ? locationLabel(t, location) : fallbackLocation;
  const expiry = expiryPhrase(row.expiresAt);
  const expiryText = phraseLabel(t, expiry);
  const expiryColor =
    expiry.tone === 'warn'
      ? colors.warn
      : expiry.tone === 'success'
        ? colors.success
        : expiry.tone === 'danger'
          ? colors.danger
          : colors.textMuted;

  return (
    <View
      style={{
        flex: 1,
        minHeight: 140,
        borderRadius: radius.xl,
        borderWidth: 1,
        borderColor: isDark ? colors.border : tint.bg,
        backgroundColor: tint.bg,
        padding: spacing.md,
        gap: spacing.sm,
        ...(isDark ? null : shadow.card),
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
        style={({ pressed }) => [
          { flex: 1, gap: spacing.xs, opacity: pressed ? 0.92 : 1 },
          { transform: [{ scale: pressed ? 0.98 : 1 }] },
        ]}
      >
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm }}>
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: colors.surface,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <FoodIcon item={row} size={32} />
          </View>
          <View style={{ flex: 1 }} />
          <Chip label={locationText} variant="tag" />
        </View>

        <View style={{ flex: 1 }} />
        <AppText variant="bodyStrong" numberOfLines={2}>
          {name}
        </AppText>
        <AppText variant="caption" style={{ color: expiryColor }}>
          {expiryText}
        </AppText>
      </Pressable>

      <QuantityStepper
        value={row.quantity}
        onChange={onQuantityChange}
        unit={unitLabel(t, row.unit)}
        accessibilityLabel={name}
        decrementLabel={t('mobile.common.decrease')}
        incrementLabel={t('mobile.common.increase')}
      />
    </View>
  );
}
