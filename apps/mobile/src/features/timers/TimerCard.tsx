import { View } from 'react-native';
import { formatRemaining, type CookingTimer, type UpdateTimerRequest } from '@kitchen/contracts';
import { AppText, Button, Card, IconButton, Progress } from '../../components';
import { useFormat } from '../../hooks/useFormat';
import { formatMinutes } from '../../lib/format';
import { timerCardAccessibilityLabel } from '../../lib/screen-accessibility';
import { timerDurationMinutes, timerProgressValue } from '../../lib/timer-card';
import { spacing } from '../../theme';

export function TimerCard({
  timer,
  busy,
  onAction,
  onRemove,
}: {
  timer: CookingTimer;
  busy: boolean;
  onAction: (body: UpdateTimerRequest) => void;
  onRemove: () => void;
}) {
  const { t, locale, prefs } = useFormat();
  const finished = timer.status === 'done';
  const paused = timer.status === 'paused';
  const remaining = formatRemaining(timer.remainingSec);
  const durationMinutes = timerDurationMinutes(timer);
  const durationLabel = t('mobile.recipe.minutesValue', {
    minutes: formatMinutes(locale, durationMinutes, prefs),
  });
  const caption = paused
    ? `${timer.label} · ${t('mobile.timers.paused')}`
    : `${timer.label} · ${durationLabel}`;
  const primary = finished ? t('mobile.timers.finished') : remaining;
  const progress = timerProgressValue(timer);
  const progressLabel = timerCardAccessibilityLabel({ primary, caption });

  return (
    <Card>
      <View style={{ gap: spacing.md }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: spacing.md,
          }}
        >
          <View
            accessible
            accessibilityLabel={timerCardAccessibilityLabel({
              primary,
              caption,
              action: finished ? t('mobile.timers.remove') : null,
            })}
            style={{ flex: 1, minWidth: 0, gap: spacing.xs }}
          >
            {finished ? (
              <AppText variant="title" color="danger">
                {primary}
              </AppText>
            ) : (
              <AppText variant="numeralSmall">{primary}</AppText>
            )}
            <AppText variant="caption" muted>
              {caption}
            </AppText>
          </View>

          {finished ? (
            <Button
              title={t('mobile.timers.remove')}
              variant="destructive"
              size="S"
              fullWidth={false}
              disabled={busy}
              onPress={onRemove}
            />
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
              <Button
                title={t('mobile.timers.addMinute')}
                variant="secondary"
                size="S"
                fullWidth={false}
                disabled={busy}
                onPress={() => onAction({ action: 'extend', seconds: 60 })}
              />
              <IconButton
                icon={paused ? 'play' : 'pause'}
                tone="surface"
                accessibilityLabel={paused ? t('mobile.timers.resume') : t('mobile.timers.pause')}
                disabled={busy}
                onPress={() => onAction({ action: paused ? 'resume' : 'pause' })}
              />
              <IconButton
                icon="x"
                tone="plain"
                accessibilityLabel={t('mobile.timers.cancel')}
                disabled={busy}
                onPress={() => onAction({ action: 'stop' })}
              />
            </View>
          )}
        </View>

        <Progress
          value={progress}
          tone={paused ? 'paused' : 'active'}
          accessibilityLabel={progressLabel}
        />
      </View>
    </Card>
  );
}
