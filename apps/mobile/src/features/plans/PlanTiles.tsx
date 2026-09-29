import { Animated, Pressable, StyleSheet, View } from 'react-native';
import type { MealPlan, PlanCoverage } from '@kitchen/contracts';
import { AppText, Icon } from '../../components';
import { usePressFeedback } from '../../components/press-feedback';
import { useFormat } from '../../hooks/useFormat';
import { formatPercent, formatQty } from '../../lib/format';
import { planProgress } from '../../lib/plans';
import { spacing } from '../../theme';
import { useTheme } from '../../theme/useTheme';

export type PlanTilesVariant = 'summary' | 'shortfall';

export interface PlanTilesProps {
  plan: MealPlan;
  coverage?: PlanCoverage | null;
  onOpenShopping: () => void;
  showCoverageCaption?: boolean;
  variant?: PlanTilesVariant;
}

function PlanSummaryBlock({
  value,
  caption,
  accessibilityLabel,
}: {
  value: string;
  caption: string;
  accessibilityLabel: string;
}) {
  const { colors, shadow } = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={accessibilityLabel}
      style={{
        flex: 1,
        minHeight: 86,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.cardEdge,
        backgroundColor: colors.surface,
        padding: spacing.lg,
        justifyContent: 'center',
        gap: spacing.xs,
        ...shadow.card,
      }}
    >
      <AppText variant="numeralSmall">{value}</AppText>
      <AppText variant="caption" muted>
        {caption}
      </AppText>
    </View>
  );
}

function PlanShortfallLine({
  count,
  onOpenShopping,
}: {
  count: number;
  onOpenShopping: () => void;
}) {
  const { t, locale, prefs } = useFormat();
  const { colors } = useTheme();
  const pressFeedback = usePressFeedback();
  const formattedCount = formatQty(locale, count, prefs);
  const missingLabel = t('plans.missingItems', { count }).replace(String(count), formattedCount);

  if (count <= 0) return null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${missingLabel}, ${t('mobile.plans.addToList')}`}
      onPress={onOpenShopping}
      {...pressFeedback.pressHandlers}
    >
      <Animated.View
        style={[
          {
            minHeight: 46,
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.sm,
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.sm,
            backgroundColor: colors.surfaceAlt,
          },
          pressFeedback.animatedStyle,
        ]}
      >
        <Icon name="alert" size={18} color={colors.warn} />
        <AppText variant="bodyStrong" style={{ flex: 1 }}>
          {missingLabel}
        </AppText>
        <AppText variant="buttonSmall" color="primaryText">
          {t('mobile.plans.addToList')}
        </AppText>
      </Animated.View>
    </Pressable>
  );
}

function PlanShoppingSummaryBlock({
  value,
  caption,
  accessibilityLabel,
  disabled,
  onPress,
}: {
  value: string;
  caption: string;
  accessibilityLabel: string;
  disabled: boolean;
  onPress: () => void;
}) {
  const { colors, shadow } = useTheme();
  const pressFeedback = usePressFeedback();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      {...pressFeedback.pressHandlers}
      style={{ flex: 1 }}
    >
      <Animated.View
        style={[
          {
            minHeight: 86,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: colors.cardEdge,
            backgroundColor: colors.surface,
            padding: spacing.lg,
            justifyContent: 'center',
            gap: spacing.xs,
            ...shadow.card,
          },
          disabled ? null : pressFeedback.animatedStyle,
        ]}
      >
        <AppText variant="numeralSmall">{value}</AppText>
        <AppText variant="caption" muted>
          {caption}
        </AppText>
      </Animated.View>
    </Pressable>
  );
}

export function PlanTiles({
  plan,
  coverage,
  onOpenShopping,
  showCoverageCaption = false,
  variant = 'summary',
}: PlanTilesProps) {
  const { t, locale, prefs } = useFormat();
  const progress = planProgress(plan, coverage);
  const cooked = formatQty(locale, progress.cooked, prefs);
  const total = formatQty(locale, progress.total, prefs);
  const cookedValue = `${cooked} ${t('mobile.plans.ofConnector')} ${total}`;
  const cookedLabel = t('mobile.plans.cookedOf', { done: cooked, total });
  const cookedCaption = t('mobile.plans.cookedCaption', { total });
  const coverageLabel =
    showCoverageCaption && progress.coverageRatio !== null
      ? `${t('plans.coverage')} ${formatPercent(locale, progress.coverageRatio, prefs)}`
      : null;
  const toBuyCount = progress.toBuy === null ? null : formatQty(locale, progress.toBuy, prefs);

  if (variant === 'shortfall') {
    return <PlanShortfallLine count={progress.toBuy ?? 0} onOpenShopping={onOpenShopping} />;
  }

  return (
    <View style={{ flexDirection: 'row', gap: spacing.lg }}>
      <PlanSummaryBlock
        value={cookedValue}
        caption={coverageLabel ? `${cookedCaption} · ${coverageLabel}` : cookedCaption}
        accessibilityLabel={coverageLabel ? `${cookedLabel}, ${coverageLabel}` : cookedLabel}
      />
      <PlanShoppingSummaryBlock
        value={toBuyCount ?? formatQty(locale, 0, prefs)}
        caption={t('mobile.plans.toBuyCaption')}
        accessibilityLabel={t('mobile.plans.toBuy', {
          count: formatQty(locale, progress.toBuy ?? 0, prefs),
        })}
        disabled={progress.toBuy === null}
        onPress={onOpenShopping}
      />
    </View>
  );
}
