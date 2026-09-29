import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { AppText } from './AppText';
import { Button } from './Button';
import { Icon, type IconName } from './Icon';
import { Illustration, type IllustrationName } from './Illustration';
import { OutOfCreditsPanel } from '../features/credits/OutOfCreditsPanel';
import { useFormat } from '../hooks/useFormat';
import { formatQty } from '../lib/format';
import { insufficientCreditsDetails } from '../lib/credits';
import { spacing } from '../theme';
import { useTheme } from '../theme/useTheme';
import { useLocale } from '../lib/locale';
import { errorMessageKey, isInsufficientCredits, isRetryable } from '../lib/errors';

const ILLUSTRATION_BOX_SIZE = 88;
const SKELETON_THUMB_SIZE = 56;
const SKELETON_BAR_HEIGHT = 12;
const SKELETON_SMALL_BAR_HEIGHT = 10;

const CENTER = {
  flex: 1,
  alignItems: 'center',
  justifyContent: 'center',
  gap: 10,
  paddingVertical: 32,
  paddingHorizontal: 24,
} as const;

const COMPACT_CENTER = {
  alignItems: 'center',
  justifyContent: 'center',
  gap: 10,
  paddingVertical: 24,
  paddingHorizontal: 20,
} as const;

export interface LoadingStateProps {
  label?: string;
  compact?: boolean;
  rows?: number;
}

export function LoadingState({
  label,
  compact = false,
  rows = compact ? 2 : 3,
}: LoadingStateProps) {
  const { t } = useLocale();
  const { colors } = useTheme();
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={label ?? t('common.loading')}
      style={
        compact
          ? { gap: spacing.sm }
          : { ...CENTER, alignItems: 'stretch', justifyContent: 'center' }
      }
    >
      {Array.from({ length: rows }).map((_, index) => (
        <View key={index} style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <View
            style={{
              width: SKELETON_THUMB_SIZE,
              height: SKELETON_THUMB_SIZE,
              backgroundColor: colors.surfaceAlt,
            }}
          />
          <View style={{ flex: 1, gap: spacing.sm }}>
            <View
              style={{
                width: index % 2 === 0 ? '72%' : '58%',
                height: SKELETON_BAR_HEIGHT,
                backgroundColor: colors.surfaceAlt,
              }}
            />
            <View
              style={{
                width: index % 2 === 0 ? '46%' : '64%',
                height: SKELETON_SMALL_BAR_HEIGHT,
                backgroundColor: colors.surfaceAlt,
              }}
            />
          </View>
        </View>
      ))}
    </View>
  );
}

export interface EmptyStateProps {
  title: string;
  message?: string;
  illustration?: IllustrationName;
  /** @deprecated J: removed in C16. Use `illustration`; legacy icons render inside the same 88pt box. */
  icon?: IconName;
  actionLabel?: string;
  onAction?: () => void;
  compact?: boolean;
}

export function EmptyState({
  title,
  message,
  illustration,
  icon = illustration ? undefined : 'bag',
  actionLabel,
  onAction,
  compact = false,
}: EmptyStateProps) {
  const { colors } = useTheme();
  const contentStyle = compact ? COMPACT_CENTER : CENTER;
  return (
    <View style={contentStyle}>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{
          width: ILLUSTRATION_BOX_SIZE,
          height: ILLUSTRATION_BOX_SIZE,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {illustration ? (
          <Illustration name={illustration} size={ILLUSTRATION_BOX_SIZE} />
        ) : icon ? (
          <Icon name={icon} size={44} color={colors.textMuted} />
        ) : null}
      </View>
      <AppText variant="title" center accessibilityRole="header">
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
  compact?: boolean;
}

export function ErrorState({ error, onRetry, compact = false }: ErrorStateProps) {
  const { t, locale, prefs } = useFormat();
  const router = useRouter();
  const outOfCredits = isInsufficientCredits(error);
  const retryable = isRetryable(error);
  const action = outOfCredits
    ? { label: t('mobile.credits.getMore'), onPress: () => router.push('/buy-credits') }
    : onRetry
      ? { label: t('common.retry'), onPress: onRetry }
      : undefined;

  if (outOfCredits) {
    const details = insufficientCreditsDetails(error);
    return (
      <View style={compact ? COMPACT_CENTER : { ...CENTER, alignItems: 'stretch' }}>
        <OutOfCreditsPanel
          compact={compact}
          title={t('mobile.credits.outOfCreditsTitle')}
          needed={details.needed !== null ? formatQty(locale, details.needed, prefs) : null}
          cost={details.required !== null ? formatQty(locale, details.required, prefs) : null}
          balance={details.available !== null ? formatQty(locale, details.available, prefs) : null}
          fallbackMessage={t(errorMessageKey(error))}
          onGetMore={() => router.push('/buy-credits')}
        />
      </View>
    );
  }

  return (
    <EmptyState
      compact={compact}
      icon="alert"
      title={t('mobile.common.error')}
      message={t(errorMessageKey(error))}
      actionLabel={action && (outOfCredits || retryable || onRetry) ? action.label : undefined}
      onAction={action?.onPress}
    />
  );
}
