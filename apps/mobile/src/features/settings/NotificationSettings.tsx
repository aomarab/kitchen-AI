import { useCallback, useEffect, useState } from 'react';
import { AppState, Linking, View } from 'react-native';
import { useLocale } from '../../lib/locale';
import { useSettingsStore } from '../../stores/settings';
import { AppText, Button, Card, Chip, ToggleRow } from '../../components';
import { spacing } from '../../theme';
import {
  currentPermission,
  requestPermission,
  type PermissionState,
} from '../../lib/notification-scheduler';

/** Warn 1, 2, 3, 5 or 7 days ahead. */
const LEAD_CHOICES = [1, 2, 3, 5, 7];

/** Morning, midday, evening. Anything finer is a picker nobody adjusts. */
const HOUR_CHOICES = [9, 13, 19];

/**
 * The notification controls, and the one place the app asks for permission.
 *
 * iOS grants a single system prompt per install; once it is spent the only way
 * back is the Settings app. Asking here — after the user has deliberately
 * turned a reminder on — means the prompt arrives when the answer is obviously
 * yes, rather than on a launch screen where it is reflexively no.
 */
export function NotificationSettings() {
  const { t, locale } = useLocale();
  const notifyExpiry = useSettingsStore((state) => state.notifyExpiry);
  const setNotifyExpiry = useSettingsStore((state) => state.setNotifyExpiry);
  const notifyMeals = useSettingsStore((state) => state.notifyMeals);
  const setNotifyMeals = useSettingsStore((state) => state.setNotifyMeals);
  const leadDays = useSettingsStore((state) => state.expiryLeadDays);
  const setLeadDays = useSettingsStore((state) => state.setExpiryLeadDays);
  const reminderHour = useSettingsStore((state) => state.reminderHour);
  const setReminderHour = useSettingsStore((state) => state.setReminderHour);

  const [permission, setPermission] = useState<PermissionState>('undetermined');

  const refresh = useCallback(() => {
    void currentPermission().then(setPermission);
  }, []);

  useEffect(() => {
    refresh();
    // Permission is changed in the OS Settings app, so the only signal that it
    // changed is coming back to the foreground.
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => subscription.remove();
  }, [refresh]);

  const enable = async (turnOn: boolean, apply: (value: boolean) => void) => {
    apply(turnOn);
    if (!turnOn) return;
    if (permission === 'granted') return;
    setPermission(await requestPermission());
  };

  const hourLabel = (hour: number) =>
    new Date(2026, 0, 1, hour, 0).toLocaleTimeString(locale, {
      hour: 'numeric',
      minute: '2-digit',
    });

  return (
    <Card style={{ gap: spacing.lg }}>
      <View style={{ gap: spacing.xs }}>
        <AppText variant="label" muted>
          {t('mobile.settings.notifications')}
        </AppText>
        <AppText variant="caption" muted>
          {t('mobile.settings.notificationsHint')}
        </AppText>
      </View>

      <ToggleRow
        label={t('mobile.settings.notifyExpiry')}
        hint={t('mobile.settings.notifyExpiryHint')}
        value={notifyExpiry}
        onValueChange={(value) => void enable(value, setNotifyExpiry)}
      />

      {notifyExpiry ? (
        <View style={{ gap: spacing.xs }}>
          <AppText variant="label" muted>
            {t('mobile.settings.leadTime')}
          </AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            {LEAD_CHOICES.map((days) => (
              <Chip
                key={days}
                label={t('mobile.settings.leadDays', { count: days })}
                selected={leadDays === days}
                onPress={() => setLeadDays(days)}
              />
            ))}
          </View>
        </View>
      ) : null}

      <ToggleRow
        label={t('mobile.settings.notifyMeals')}
        hint={t('mobile.settings.notifyMealsHint')}
        value={notifyMeals}
        onValueChange={(value) => void enable(value, setNotifyMeals)}
      />

      {notifyExpiry || notifyMeals ? (
        <View style={{ gap: spacing.xs }}>
          <AppText variant="label" muted>
            {t('mobile.settings.reminderTime')}
          </AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            {HOUR_CHOICES.map((hour) => (
              <Chip
                key={hour}
                label={hourLabel(hour)}
                selected={reminderHour === hour}
                onPress={() => setReminderHour(hour)}
              />
            ))}
          </View>
        </View>
      ) : null}

      {/*
        Shown only when the OS has refused, because that is the one state the
        toggles above cannot fix — leaving them on while nothing ever arrives
        is the confusing failure this replaces.
      */}
      {permission === 'denied' && (notifyExpiry || notifyMeals) ? (
        <View style={{ gap: spacing.sm }}>
          <AppText variant="caption" color="danger">
            {t('mobile.settings.permissionDenied')}
          </AppText>
          <Button
            variant="secondary"
            title={t('mobile.settings.openSettings')}
            onPress={() => void Linking.openSettings()}
          />
        </View>
      ) : null}
    </Card>
  );
}
