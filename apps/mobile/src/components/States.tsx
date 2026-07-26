import { ActivityIndicator, View } from 'react-native';
import { AppText } from './AppText';
import { Button } from './Button';
import { Icon, type IconName } from './Icon';
import { colors, spacing } from '../theme';
import { useLocale } from '../lib/locale';
import { errorMessageKey, isRetryable } from '../lib/errors';

const CENTER = {
  flex: 1,
  alignItems: 'center',
  justifyContent: 'center',
  gap: spacing.md,
  padding: spacing.xl,
} as const;

export function LoadingState({ label }: { label?: string }) {
  const { t } = useLocale();
  return (
    <View style={CENTER}>
      <ActivityIndicator color={colors.primary} size="large" />
      <AppText muted>{label ?? t('common.loading')}</AppText>
    </View>
  );
}

export interface EmptyStateProps {
  title: string;
  message?: string;
  icon?: IconName;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ title, message, icon = 'basket', actionLabel, onAction }: EmptyStateProps) {
  return (
    <View style={CENTER}>
      <Icon name={icon} size={40} />
      <AppText variant="heading" center>
        {title}
      </AppText>
      {message ? (
        <AppText muted center>
          {message}
        </AppText>
      ) : null}
      {actionLabel && onAction ? (
        <Button title={actionLabel} onPress={onAction} fullWidth={false} />
      ) : null}
    </View>
  );
}

export interface ErrorStateProps {
  error: unknown;
  onRetry?: () => void;
}

/**
 * Renders a failed request. The error's `messageKey` is translated through i18n
 * — raw error text is never shown to the user (spec §8).
 */
export function ErrorState({ error, onRetry }: ErrorStateProps) {
  const { t } = useLocale();
  return (
    <View style={CENTER}>
      <Icon name="warning" size={40} />
      <AppText variant="heading" center>
        {t('mobile.common.error')}
      </AppText>
      <AppText muted center>
        {t(errorMessageKey(error))}
      </AppText>
      {onRetry && isRetryable(error) ? (
        <Button title={t('common.retry')} icon="sync" onPress={onRetry} fullWidth={false} />
      ) : onRetry ? (
        <Button title={t('common.retry')} variant="secondary" onPress={onRetry} fullWidth={false} />
      ) : null}
    </View>
  );
}
