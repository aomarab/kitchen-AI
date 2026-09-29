import { formatRemaining, type CookingTimer } from '@kitchen/contracts';
import { View } from 'react-native';
import { AppText, Button, IconButton, Progress } from '../../components';
import { useFormat } from '../../hooks/useFormat';
import { formatMinutes } from '../../lib/format';
import type { StepTimerPlan } from '../../lib/cook-timers';
import { spacing } from '../../theme';
import { useTheme } from '../../theme/useTheme';

export function CookTimerPanel({
  plan,
  projected,
  pending,
  durationMinutes,
  onStart,
}: {
  plan: StepTimerPlan;
  projected: CookingTimer | null;
  pending: boolean;
  durationMinutes: number;
  onStart: () => void;
}) {
  const { t, locale, prefs } = useFormat();
  const { colors } = useTheme();

  if (!plan.ok) return null;

  const totalSeconds = Math.max(1, Math.round(durationMinutes * 60));
  const countdownSeconds = projected?.remainingSec ?? totalSeconds;
  const countdown = formatRemaining(countdownSeconds);
  const finished = projected?.status === 'done';
  const runningAnnouncement = projected
    ? t('mobile.recipe.stepTimerRunning', {
        remaining: formatRemaining(projected.remainingSec),
      })
    : undefined;
  const statusCaption = projected
    ? finished
      ? t('mobile.recipe.stepTimerDone')
      : t('mobile.recipe.stepTimerRunningStatus')
    : null;
  const statusAccessibilityLabel = finished ? (statusCaption ?? undefined) : runningAnnouncement;
  const buttonTitle = t('mobile.recipe.startStepTimer', {
    minutes: formatMinutes(locale, durationMinutes, prefs),
  });
  const progress = projected ? 1 - countdownSeconds / totalSeconds : 0;

  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: colors.cardEdge,
        backgroundColor: colors.surface,
        padding: spacing.lg,
        gap: spacing.md,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <View style={{ flex: 1, minWidth: 0, gap: spacing.xs }}>
          <AppText variant="numeralSmall">{countdown}</AppText>
          {statusCaption ? (
            <AppText
              variant="caption"
              accessibilityLabel={statusAccessibilityLabel}
              style={{ color: colors.textMuted }}
            >
              {statusCaption}
            </AppText>
          ) : null}
        </View>
        {projected ? (
          <IconButton
            icon={finished ? 'check' : 'timer'}
            tone="surface"
            accessibilityLabel={statusAccessibilityLabel ?? statusCaption ?? countdown}
            disabled
          />
        ) : null}
      </View>
      <Progress value={progress} tone={finished ? 'idle' : 'active'} />
      {projected ? null : (
        <Button
          title={buttonTitle}
          leadingIcon="timer"
          variant="primary"
          disabled={pending}
          onPress={onStart}
        />
      )}
    </View>
  );
}
