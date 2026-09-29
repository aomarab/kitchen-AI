import { View } from 'react-native';
import { hydrationCupsDrunk, type ReminderSettings } from '@kitchen/contracts';
import { AppText, Button, Card, Icon, Progress } from '../../components';
import { useFormat } from '../../hooks/useFormat';
import { wellnessNudgeAccessibilityLabel } from '../../lib/screen-accessibility';
import { hydrationFraction, minutesSinceFired, type NudgeRow } from '../../lib/wellness';
import { spacing } from '../../theme';
import { useTheme } from '../../theme/useTheme';

export const WELLNESS_ACTION_MIN_HEIGHT = 44;
const HYDRATION_ICON_SIZE = 44;

export function HydrationSummaryCard({
  occurrences,
  settings,
}: {
  occurrences: Parameters<typeof hydrationFraction>[0];
  settings: ReminderSettings;
}) {
  const { t } = useFormat();
  const { colors } = useTheme();
  const fraction = hydrationFraction(occurrences, settings);
  const progressText = t('mobile.wellness.hydrationProgress', {
    count: hydrationCupsDrunk(occurrences),
    goal: settings.hydrationGoalCups,
  });

  return (
    <Card style={{ backgroundColor: colors.surfaceAlt }}>
      <View
        accessible
        accessibilityLabel={`${t('mobile.wellness.hydrationTitle')}, ${progressText}, ${t(
          'mobile.wellness.hydrationHint',
        )}`}
        style={{ gap: spacing.md }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={{
              width: HYDRATION_ICON_SIZE,
              height: HYDRATION_ICON_SIZE,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name="droplet" size={34} color={colors.text} />
          </View>
          <View style={{ flex: 1, minWidth: 0, gap: spacing.xs }}>
            <AppText variant="eyebrow" muted>
              {t('mobile.wellness.hydrationTitle')}
            </AppText>
            <AppText variant="numeralSmall">{progressText}</AppText>
          </View>
        </View>
        <Progress
          value={fraction}
          accessibilityLabel={`${t('mobile.wellness.hydrationTitle')}, ${progressText}`}
        />
        <AppText variant="caption" muted>
          {t('mobile.wellness.hydrationHint')}
        </AppText>
      </View>
    </Card>
  );
}

export function NudgeList({
  rows,
  outstanding,
  busy,
  onAcknowledge,
}: {
  rows: readonly NudgeRow[];
  outstanding: number;
  busy: boolean;
  onAcknowledge: (id: string) => void;
}) {
  const { t } = useFormat();
  const { colors } = useTheme();
  const heading =
    outstanding > 0
      ? t('mobile.wellness.outstanding', { count: outstanding })
      : t('mobile.wellness.allAnswered');

  return (
    <View style={{ gap: spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <View style={{ width: 7, height: 7, backgroundColor: colors.primary }} />
        <AppText variant="title">{heading}</AppText>
      </View>
      <View>
        {rows.map((row) => (
          <NudgeRowItem
            key={row.id}
            row={row}
            busy={busy}
            onAcknowledge={() => onAcknowledge(row.id)}
          />
        ))}
      </View>
    </View>
  );
}

function NudgeRowItem({
  row,
  busy,
  onAcknowledge,
}: {
  row: NudgeRow;
  busy: boolean;
  onAcknowledge: () => void;
}) {
  const { t } = useFormat();
  const { colors } = useTheme();
  const answered = row.acknowledgedAt !== null;
  const minutes = minutesSinceFired(row.firedAt, new Date());
  const time =
    minutes === 0 ? t('mobile.wellness.justNow') : t('mobile.wellness.minutesAgo', { minutes });
  const status = answered ? `${t('mobile.wellness.answered')} · ${time}` : time;
  const body = t(row.messageKey as 'reminders.break.body');

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: spacing.md,
        paddingVertical: spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: colors.rowline,
      }}
    >
      <View
        accessible
        accessibilityLabel={wellnessNudgeAccessibilityLabel({ body, status })}
        style={{ flex: 1, minWidth: 0, gap: spacing.xs }}
      >
        <AppText variant="body" muted={answered}>
          {body}
        </AppText>
        {answered ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
            <Icon name="check" size={14} color={colors.success} />
            <AppText variant="caption" muted>
              {status}
            </AppText>
          </View>
        ) : (
          <AppText variant="caption" color="primaryText">
            {status}
          </AppText>
        )}
      </View>

      {answered ? null : (
        <Button
          title={t('mobile.wellness.acknowledge')}
          variant="inverse"
          size="S"
          fullWidth={false}
          disabled={busy}
          style={{ minHeight: WELLNESS_ACTION_MIN_HEIGHT }}
          onPress={onAcknowledge}
        />
      )}
    </View>
  );
}

export function WellnessSettingsButton({ onPress }: { onPress: () => void }) {
  const { t } = useFormat();
  return (
    <Button
      title={t('mobile.wellness.editSettings')}
      variant="secondary"
      leadingIcon="settings"
      style={{ minHeight: WELLNESS_ACTION_MIN_HEIGHT }}
      onPress={onPress}
    />
  );
}
