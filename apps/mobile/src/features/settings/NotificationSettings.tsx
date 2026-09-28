import { useCallback, useEffect, useState } from 'react';
import { AppState, Linking, View } from 'react-native';
import { useLocale } from '../../lib/locale';
import { useSettingsStore } from '../../stores/settings';
import { useNotificationStatus } from '../../stores/notification-status';
import {
  AppText,
  Button,
  Card,
  Chip,
  Icon,
  ListGroup,
  ListRow,
  SectionLabel,
  ToggleRow,
} from '../../components';
import { spacing } from '../../theme';
import { useTheme } from '../../theme/useTheme';
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
  const { colors } = useTheme();
  const notifyExpiry = useSettingsStore((state) => state.notifyExpiry);
  const setNotifyExpiry = useSettingsStore((state) => state.setNotifyExpiry);
  const notifyMeals = useSettingsStore((state) => state.notifyMeals);
  const setNotifyMeals = useSettingsStore((state) => state.setNotifyMeals);
  const notifyExpired = useSettingsStore((state) => state.notifyExpired);
  const setNotifyExpired = useSettingsStore((state) => state.setNotifyExpired);
  const notifyShopping = useSettingsStore((state) => state.notifyShopping);
  const setNotifyShopping = useSettingsStore((state) => state.setNotifyShopping);
  const notifyPlanning = useSettingsStore((state) => state.notifyPlanning);
  const setNotifyPlanning = useSettingsStore((state) => state.setNotifyPlanning);
  const notifyTimers = useSettingsStore((state) => state.notifyTimers);
  const setNotifyTimers = useSettingsStore((state) => state.setNotifyTimers);
  const leadDays = useSettingsStore((state) => state.expiryLeadDays);
  const setLeadDays = useSettingsStore((state) => state.setExpiryLeadDays);
  const reminderHour = useSettingsStore((state) => state.reminderHour);
  const setReminderHour = useSettingsStore((state) => state.setReminderHour);

  const [permission, setPermissionState] = useState<PermissionState>('undetermined');
  const scheduledCount = useNotificationStatus((state) => state.scheduledCount);

  // Mirrored into the shared store, which is what the background scheduler
  // watches: granting permission here changes nothing about the kitchen, so
  // without that signal the reminders would not be armed until the next
  // foreground.
  const setPermission = useCallback((value: PermissionState) => {
    setPermissionState(value);
    useNotificationStatus.getState().setPermission(value);
  }, []);

  const refresh = useCallback(() => {
    void currentPermission().then(setPermission);
  }, [setPermission]);

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

  // Every control below the toggles is shared, so it appears as soon as any
  // one reminder is on rather than only the two the screen started with.
  //
  // Timers are deliberately not counted. What this gates is the daily
  // reminder hour, and a timer alert fires when the timer ends — offering an
  // hour picker to someone who has only timers on would be a control that
  // does nothing.
  const anyEnabled =
    notifyExpiry || notifyMeals || notifyExpired || notifyShopping || notifyPlanning;

  const hourLabel = (hour: number) =>
    new Date(2026, 0, 1, hour, 0).toLocaleTimeString(locale, {
      hour: 'numeric',
      minute: '2-digit',
    });

  return (
    <View style={{ gap: spacing.lg }}>
      {/*
        No section title: this is the whole screen now, and the navigation bar
        above it already says "Notifications".
      */}
      <Card>
        <AppText variant="caption" muted>
          {t('mobile.settings.notificationsHint')}
        </AppText>
      </Card>

      <ListGroup>
        <ToggleRow
          grouped
          label={t('mobile.settings.notifyExpiry')}
          hint={t('mobile.settings.notifyExpiryHint')}
          value={notifyExpiry}
          onValueChange={(value) => void enable(value, setNotifyExpiry)}
        />

        <ToggleRow
          grouped
          label={t('mobile.settings.notifyMeals')}
          hint={t('mobile.settings.notifyMealsHint')}
          value={notifyMeals}
          onValueChange={(value) => void enable(value, setNotifyMeals)}
        />

        <ToggleRow
          grouped
          label={t('mobile.settings.notifyExpired')}
          hint={t('mobile.settings.notifyExpiredHint')}
          value={notifyExpired}
          onValueChange={(value) => void enable(value, setNotifyExpired)}
        />

        <ToggleRow
          grouped
          label={t('mobile.settings.notifyShopping')}
          hint={t('mobile.settings.notifyShoppingHint')}
          value={notifyShopping}
          onValueChange={(value) => void enable(value, setNotifyShopping)}
        />

        <ToggleRow
          grouped
          label={t('mobile.settings.notifyPlanning')}
          hint={t('mobile.settings.notifyPlanningHint')}
          value={notifyPlanning}
          onValueChange={(value) => void enable(value, setNotifyPlanning)}
        />

        <ToggleRow
          grouped
          label={t('mobile.settings.notifyTimers')}
          hint={t('mobile.settings.notifyTimersHint')}
          value={notifyTimers}
          onValueChange={(value) => void enable(value, setNotifyTimers)}
        />
      </ListGroup>

      {notifyExpiry ? (
        <Card style={{ gap: spacing.xs }}>
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
        </Card>
      ) : null}

      {anyEnabled ? (
        <View style={{ gap: spacing.sm }}>
          <SectionLabel>{t('mobile.settings.reminderTime')}</SectionLabel>
          <ListGroup>
            {HOUR_CHOICES.map((hour) => (
              <ListRow
                key={hour}
                grouped
                icon="clock"
                title={hourLabel(hour)}
                value={reminderHour === hour ? t('mobile.assistant.personaSelected') : undefined}
                trailing={
                  reminderHour === hour ? (
                    <Icon name="check" size={20} color={colors.primaryText} />
                  ) : null
                }
                accessibilityRole="radio"
                accessibilityState={{ checked: reminderHour === hour }}
                accessibilityLabel={`${t('mobile.settings.reminderTime')}: ${hourLabel(hour)}`}
                onPress={() => setReminderHour(hour)}
              />
            ))}
          </ListGroup>
        </View>
      ) : null}

      {/*
        Proof the reminders are actually armed. Without it, "on" and "silently
        broken" look identical until the day something is wasted.
      */}
      {permission === 'granted' && scheduledCount !== null && anyEnabled ? (
        <Card>
          <AppText variant="caption" muted>
            {t('mobile.settings.scheduled', { count: scheduledCount })}
          </AppText>
        </Card>
      ) : null}

      {/*
        Shown only when the OS has refused, because that is the one state the
        toggles above cannot fix — leaving them on while nothing ever arrives
        is the confusing failure this replaces.
      */}
      {permission === 'denied' && anyEnabled ? (
        <Card style={{ gap: spacing.sm }}>
          <AppText variant="caption" color="danger">
            {t('mobile.settings.permissionDenied')}
          </AppText>
          <Button
            variant="secondary"
            title={t('mobile.settings.openSettings')}
            onPress={() => void Linking.openSettings()}
          />
        </Card>
      ) : null}

      {/*
        The state a fresh install sits in: reminders are on by default, but iOS
        has never been asked, so nothing can arrive. Without this the toggles
        read as working while the phone holds nothing — the only way out was to
        turn a toggle off and on again to trigger the prompt.
      */}
      {permission === 'undetermined' && anyEnabled ? (
        <Card style={{ gap: spacing.sm }}>
          <AppText variant="caption" muted>
            {t('mobile.settings.permissionNeeded')}
          </AppText>
          <Button
            variant="secondary"
            title={t('mobile.settings.allowNotifications')}
            onPress={() => void requestPermission().then(setPermission)}
          />
        </Card>
      ) : null}

      {/*
        The JS is newer than the binary it is running inside, so the native
        notification module simply isn't there. Nothing in the OS Settings app
        can fix that, so this state deliberately offers no button.
      */}
      {permission === 'unavailable' && anyEnabled ? (
        <Card>
          <AppText variant="caption" color="danger">
            {t('mobile.settings.permissionUnavailable')}
          </AppText>
        </Card>
      ) : null}
    </View>
  );
}
