import { formatRemaining, type CookingTimer, type UpdateTimerRequest } from '@kitchen/contracts';
import { View } from 'react-native';
import { AppText, Button, IconButton, Progress } from '../../components';
import { useFormat } from '../../hooks/useFormat';
import { cookTimerControls, cookTimerProgressValue } from '../../lib/cook-mode-timer';
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
  onAction,
}: {
  plan: StepTimerPlan;
  projected: CookingTimer | null;
  pending: boolean;
  durationMinutes: number;
  onStart: () => void;
  onAction: (id: string, body: UpdateTimerRequest) => void;
}) {
  const { t, locale, prefs } = useFormat();
  const { colors } = useTheme();

  if (!plan.ok) return null;

  const totalSeconds = Math.max(1, Math.round(durationMinutes * 60));
  const countdownSeconds = projected?.remainingSec ?? totalSeconds;
  const countdown = formatRemaining(countdownSeconds);
  const finished = projected?.status === 'done';
  const controls = cookTimerControls(projected);
  const runningAnnouncement = projected
    ? t('mobile.recipe.stepTimerRunning', {
        remaining: formatRemaining(projected.remainingSec),
      })
    : undefined;
  const statusCaption = projected
    ? finished
      ? t('mobile.recipe.stepTimerDone')
      : projected.label
    : null;
  const statusAccessibilityLabel = finished
    ? (statusCaption ?? undefined)
    : projected?.status === 'paused'
      ? `${projected.label} · ${t('mobile.timers.paused')}`
      : runningAnnouncement;
  const buttonTitle = t('mobile.recipe.startStepTimer', {
    minutes: formatMinutes(locale, durationMinutes, prefs),
  });
  const progress = cookTimerProgressValue(projected);
  const progressLabel = t('mobile.recipe.stepTimerProgress');
  const pauseResumeAction = controls.pauseResumeAction;
  const pauseResumeLabel =
    pauseResumeAction === 'resume' ? t('mobile.timers.resume') : t('mobile.timers.pause');

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
          controls.showStop && controls.pauseResumeIcon && pauseResumeAction ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
              <IconButton
                icon={controls.pauseResumeIcon}
                tone="surface"
                accessibilityLabel={pauseResumeLabel}
                disabled={pending}
                onPress={() =>
                  onAction(projected.id, {
                    action: pauseResumeAction,
                  })
                }
              />
              <IconButton
                icon="x"
                tone="plain"
                accessibilityLabel={t('mobile.timers.stop')}
                disabled={pending}
                onPress={() => onAction(projected.id, { action: 'stop' })}
              />
            </View>
          ) : (
            <IconButton
              icon="check"
              tone="surface"
              accessibilityLabel={statusAccessibilityLabel ?? statusCaption ?? countdown}
              disabled
            />
          )
        ) : null}
      </View>
      <Progress value={progress} tone={controls.progressTone} accessibilityLabel={progressLabel} />
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
