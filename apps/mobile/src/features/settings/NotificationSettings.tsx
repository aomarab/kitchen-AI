import { useCallback, useEffect, useState } from 'react';
import { AppState, Linking, View } from 'react-native';
import { useLocale } from '../../lib/locale';
import { useSettingsStore } from '../../stores/settings';
import { useNotificationStatus } from '../../stores/notification-status';
import { AppText, Button, Icon, ListGroup, ListRow, ToggleRow } from '../../components';
import { spacing } from '../../theme';
import { useTheme } from '../../theme/useTheme';
import {
  currentPermission,
  requestPermission,
  type PermissionState,
} from '../../lib/notification-scheduler';

const LEAD_CHOICES = [1, 2, 3, 5, 7];
const HOUR_CHOICES = [9, 13, 19];

interface ChoiceRowsProps<T extends number> {
  options: readonly T[];
  value: T;
  labelFor: (value: T) => string;
  accessibilityLabelFor?: (value: T) => string;
  selectedLabel: string;
  onChange: (value: T) => void;
}

function ChoiceRows<T extends number>({
  options,
  value,
  labelFor,
  accessibilityLabelFor,
  selectedLabel,
  onChange,
}: ChoiceRowsProps<T>) {
  const { colors } = useTheme();
  return (
    <ListGroup>
      {options.map((option) => {
        const selected = option === value;
        return (
          <ListRow
            key={option}
            title={labelFor(option)}
            value={selected ? selectedLabel : undefined}
            trailing={selected ? <Icon name="check" size={20} color={colors.primaryText} /> : null}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            accessibilityLabel={accessibilityLabelFor?.(option)}
            onPress={() => onChange(option)}
          />
        );
      })}
    </ListGroup>
  );
}

function StatusMessage({
  tone,
  message,
  action,
}: {
  tone?: 'danger';
  message: string;
  action?: React.ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        gap: spacing.sm,
        padding: spacing.md,
        backgroundColor: colors.surfaceAlt,
        borderBottomWidth: 1,
        borderBottomColor: colors.rowline,
      }}
    >
      <AppText variant="caption" color={tone === 'danger' ? 'danger' : undefined} muted={!tone}>
        {message}
      </AppText>
      {action}
    </View>
  );
}

export function NotificationSettings() {
  const { t, locale } = useLocale();
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

  const setPermission = useCallback((value: PermissionState) => {
    setPermissionState(value);
    useNotificationStatus.getState().setPermission(value);
  }, []);

  const refresh = useCallback(() => {
    void currentPermission().then(setPermission);
  }, [setPermission]);

  useEffect(() => {
    refresh();
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

  const anyEnabled =
    notifyExpiry || notifyMeals || notifyExpired || notifyShopping || notifyPlanning;

  const hourLabel = (hour: number) =>
    new Date(2026, 0, 1, hour, 0).toLocaleTimeString(locale, {
      hour: 'numeric',
      minute: '2-digit',
    });

  return (
    <View style={{ gap: spacing.lg }}>
      <AppText variant="body" muted>
        {t('mobile.settings.notificationsHint')}
      </AppText>

      <ListGroup>
        <ToggleRow
          label={t('mobile.settings.notifyExpiry')}
          hint={t('mobile.settings.notifyExpiryHint')}
          value={notifyExpiry}
          onValueChange={(value) => void enable(value, setNotifyExpiry)}
        />
        {notifyExpiry ? (
          <ListRow
            icon="clock"
            title={t('mobile.settings.leadTime')}
            value={t('mobile.settings.leadDays', { count: leadDays })}
          />
        ) : null}

        <ToggleRow
          label={t('mobile.settings.notifyMeals')}
          hint={t('mobile.settings.notifyMealsHint')}
          value={notifyMeals}
          onValueChange={(value) => void enable(value, setNotifyMeals)}
        />
        {anyEnabled ? (
          <ListRow
            icon="clock"
            title={t('mobile.settings.reminderTime')}
            value={hourLabel(reminderHour)}
          />
        ) : null}

        <ToggleRow
          label={t('mobile.settings.notifyExpired')}
          hint={t('mobile.settings.notifyExpiredHint')}
          value={notifyExpired}
          onValueChange={(value) => void enable(value, setNotifyExpired)}
        />
        <ToggleRow
          label={t('mobile.settings.notifyShopping')}
          hint={t('mobile.settings.notifyShoppingHint')}
          value={notifyShopping}
          onValueChange={(value) => void enable(value, setNotifyShopping)}
        />
        <ToggleRow
          label={t('mobile.settings.notifyPlanning')}
          hint={t('mobile.settings.notifyPlanningHint')}
          value={notifyPlanning}
          onValueChange={(value) => void enable(value, setNotifyPlanning)}
        />
        <ToggleRow
          label={t('mobile.settings.notifyTimers')}
          hint={t('mobile.settings.notifyTimersHint')}
          value={notifyTimers}
          onValueChange={(value) => void enable(value, setNotifyTimers)}
        />
      </ListGroup>

      {notifyExpiry ? (
        <ChoiceRows
          options={LEAD_CHOICES}
          value={leadDays}
          labelFor={(days) => t('mobile.settings.leadDays', { count: days })}
          selectedLabel={t('mobile.notifications.timeSelected')}
          onChange={setLeadDays}
        />
      ) : null}

      {anyEnabled ? (
        <ChoiceRows
          options={HOUR_CHOICES}
          value={reminderHour}
          labelFor={hourLabel}
          accessibilityLabelFor={(hour) =>
            `${t('mobile.settings.reminderTime')}: ${hourLabel(hour)}`
          }
          selectedLabel={t('mobile.notifications.timeSelected')}
          onChange={setReminderHour}
        />
      ) : null}

      {permission === 'granted' && scheduledCount !== null && anyEnabled ? (
        <AppText variant="caption" muted>
          {t('mobile.settings.scheduled', { count: scheduledCount })}
        </AppText>
      ) : null}

      {permission === 'denied' && anyEnabled ? (
        <StatusMessage
          tone="danger"
          message={t('mobile.settings.permissionDenied')}
          action={
            <Button
              variant="secondary"
              title={t('mobile.settings.openSettings')}
              onPress={() => void Linking.openSettings()}
            />
          }
        />
      ) : null}

      {permission === 'undetermined' && anyEnabled ? (
        <StatusMessage
          message={t('mobile.settings.permissionNeeded')}
          action={
            <Button
              variant="secondary"
              title={t('mobile.settings.allowNotifications')}
              onPress={() => void requestPermission().then(setPermission)}
            />
          }
        />
      ) : null}

      {permission === 'unavailable' && anyEnabled ? (
        <StatusMessage tone="danger" message={t('mobile.settings.permissionUnavailable')} />
      ) : null}
    </View>
  );
}
