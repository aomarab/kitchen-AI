import { View } from 'react-native';
import { AppText, Button, Card, Illustration, LoadingState, Progress } from '../../components';
import { useFormat } from '../../hooks/useFormat';
import { jobErrorKey } from '../../lib/errors';
import type { FailedPlanGeneration } from '../../stores/plan-generation';
import { spacing } from '../../theme';
import { useTheme } from '../../theme/useTheme';

export function GeneratingPlanState({ progress }: { progress: number }) {
  const { t } = useFormat();
  const { colors } = useTheme();

  return (
    <View style={{ gap: spacing.xl }}>
      <Card
        style={{
          backgroundColor: colors.surfaceAlt,
          padding: spacing.gutter,
          gap: spacing.md,
        }}
      >
        <Illustration name="pot" size={64} />
        <AppText variant="heading">{t('mobile.job.buildingPlan')}</AppText>
        <AppText muted>{t('plans.generatingHint')}</AppText>
        <Progress
          value={progress}
          accessibilityLabel={t('mobile.job.buildingPlan')}
          accessibilityValue={{
            min: 0,
            max: 100,
            now: Math.round(progress * 100),
          }}
        />
      </Card>
      <LoadingState rows={3} compact label={t('mobile.job.buildingPlan')} />
    </View>
  );
}

export function PlanGenerationFailedState({
  failure,
  onRetry,
}: {
  failure: FailedPlanGeneration;
  onRetry: () => void;
}) {
  const { t } = useFormat();
  const { colors } = useTheme();

  return (
    <View
      accessibilityRole="alert"
      style={{
        borderWidth: 1,
        borderColor: colors.cardEdge,
        backgroundColor: colors.surfaceAlt,
        padding: spacing.lg,
        gap: spacing.sm,
      }}
    >
      <AppText color="danger">
        {t(jobErrorKey(failure.error, 'mobile.job.generationFailed'))}
      </AppText>
      <Button title={t('common.retry')} variant="secondary" onPress={onRetry} />
    </View>
  );
}
