import { View } from 'react-native';
import type { MealPlanEntry } from '@kitchen/contracts';
import { AppText, Progress, SectionLabel } from '../../components';
import { useFormat } from '../../hooks/useFormat';
import { weekBars } from '../../lib/home-stats';
import { spacing } from '../../theme';
import { WeekStrip } from './WeekStrip';

export function WeekSection({
  plan,
  today,
  progressLabel,
  remainingLabel,
  onOpenPlan,
}: {
  plan: { startsOn: string; entries: MealPlanEntry[] };
  today: string;
  progressLabel: string;
  remainingLabel: string;
  onOpenPlan: () => void;
}) {
  const { t } = useFormat();
  const bars = weekBars(plan.entries, plan.startsOn);
  const cooked = bars.reduce((sum, bar) => sum + bar.cooked, 0);
  const total = bars.reduce((sum, bar) => sum + bar.planned, 0);
  const value = total === 0 ? 0 : cooked / total;

  return (
    <View style={{ gap: spacing.md }}>
      <SectionLabel actionLabel={t('mobile.home.openPlan')} onAction={onOpenPlan}>
        {t('mobile.home.weekTitle')}
      </SectionLabel>
      <View style={{ flexDirection: 'row', gap: spacing.md }}>
        <AppText variant="bodyStrong" style={{ flex: 1 }}>
          {progressLabel}
        </AppText>
        <AppText variant="caption" color="textMuted">
          {remainingLabel}
        </AppText>
      </View>
      <Progress value={value} accessibilityLabel={progressLabel} />
      <WeekStrip bars={bars} today={today} />
    </View>
  );
}
