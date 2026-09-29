import { Animated, Pressable, View } from 'react-native';
import type { MealPlan, PlanCoverage } from '@kitchen/contracts';
import { AppText, Icon, Stat } from '../../components';
import { usePressFeedback } from '../../components/press-feedback';
import { useFormat } from '../../hooks/useFormat';
import { formatPercent, formatQty } from '../../lib/format';
import { planCookedStatValue, planProgress } from '../../lib/plans';
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
  const cookedValue = planCookedStatValue(cooked, total, t('mobile.plans.ofConnector'));
  const cookedLabel = t('mobile.plans.cookedOf', { done: cooked, total });
  const cookedCaption = t('mobile.plans.cookedCaption');
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
      <Stat
        value={cookedValue}
        label={coverageLabel ? `${cookedCaption} · ${coverageLabel}` : cookedCaption}
        accessibilityLabel={coverageLabel ? `${cookedLabel}, ${coverageLabel}` : cookedLabel}
      />
      <Stat
        value={toBuyCount ?? formatQty(locale, 0, prefs)}
        label={t('mobile.plans.toBuyCaption')}
        accessibilityLabel={t('mobile.plans.toBuy', {
          count: formatQty(locale, progress.toBuy ?? 0, prefs),
        })}
        onPress={progress.toBuy === null ? undefined : onOpenShopping}
      />
    </View>
  );
}
