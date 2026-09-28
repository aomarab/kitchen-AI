import { View } from 'react-native';
import type { MealPlan, PlanCoverage } from '@kitchen/contracts';
import { AppText, Bento, Icon, Tile } from '../../components';
import { useFormat } from '../../hooks/useFormat';
import { formatPercent, formatQty } from '../../lib/format';
import { planProgress } from '../../lib/plans';
import { spacing } from '../../theme';
import { useTheme } from '../../theme/useTheme';

const PLAN_TILE_HEIGHT = 150;

export interface PlanTilesProps {
  plan: MealPlan;
  coverage?: PlanCoverage | null;
  onOpenShopping: () => void;
  showCoverageCaption?: boolean;
}

export function PlanTiles({
  plan,
  coverage,
  onOpenShopping,
  showCoverageCaption = false,
}: PlanTilesProps) {
  const { t, locale, prefs } = useFormat();
  const { colors } = useTheme();
  const progress = planProgress(plan, coverage);
  const cooked = formatQty(locale, progress.cooked, prefs);
  const total = formatQty(locale, progress.total, prefs);
  const cookedLabel = t('mobile.plans.cookedOf', { done: cooked, total });
  const coverageLabel =
    showCoverageCaption && progress.coverageRatio !== null
      ? `${t('plans.coverage')} ${formatPercent(locale, progress.coverageRatio, prefs)}`
      : null;

  return (
    <Bento>
      <Tile
        span={progress.cookedTileSpan}
        tint="butter"
        height={PLAN_TILE_HEIGHT}
        icon="plans"
        count={cooked}
        caption={coverageLabel ? `${cookedLabel} · ${coverageLabel}` : cookedLabel}
        accessibilityLabel={coverageLabel ? `${cookedLabel}, ${coverageLabel}` : cookedLabel}
      />

      {progress.toBuy !== null ? (
        <Tile
          span={1}
          tint="plain"
          height={PLAN_TILE_HEIGHT}
          icon="basket"
          accessibilityLabel={t('mobile.plans.toBuy', {
            count: formatQty(locale, progress.toBuy, prefs),
          })}
          onPress={onOpenShopping}
        >
          <View style={{ gap: spacing.xs }}>
            <Icon name="warning" size={22} color={colors.warn} />
            <AppText variant="numeral" color="warn">
              {formatQty(locale, progress.toBuy, prefs)}
            </AppText>
            <AppText variant="caption" muted>
              {t('mobile.plans.toBuy', { count: formatQty(locale, progress.toBuy, prefs) })}
            </AppText>
          </View>
        </Tile>
      ) : null}
    </Bento>
  );
}
