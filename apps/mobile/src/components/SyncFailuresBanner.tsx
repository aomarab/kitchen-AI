import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from './AppText';
import { Icon } from './Icon';
import { colors, hitSlop, spacing } from '../theme';
import { useLocale } from '../lib/locale';
import { useConnectivity } from '../stores/connectivity';
import { useOfflineQueue } from '../stores/offline-queue';

/**
 * Surfaces inventory changes the server refused to apply (item deleted,
 * incompatible unit, malformed). These can never succeed on retry, so they are
 * pulled out of the offline queue — but failing loudly here beats silent data
 * loss: the user sees their edit did not stick and can acknowledge it. Rendered
 * as a top overlay by the root layout, below the offline strip.
 */
export function SyncFailuresBanner() {
  const { t } = useLocale();
  const insets = useSafeAreaInsets();
  const online = useConnectivity((state) => state.online);
  const rejected = useOfflineQueue((state) => state.rejected);
  const dismissRejected = useOfflineQueue((state) => state.dismissRejected);
  if (rejected.length === 0) return null;

  const dismissAll = () => {
    for (const item of rejected) dismissRejected(item.event.clientEventId);
  };

  // The offline strip already consumes the top safe-area inset when it is shown.
  const paddingTop = online ? insets.top + spacing.xs : spacing.xs;
  const reasonKeys = rejected.map((item) => t(`mobile.sync.reasons.${item.reason}`));

  return (
    <View
      accessibilityRole="alert"
      accessibilityLabel={reasonKeys.join(' ')}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        backgroundColor: colors.dangerSoft,
        paddingTop,
        paddingBottom: spacing.sm,
        paddingHorizontal: spacing.lg,
      }}
    >
      <Icon name="warning" size={16} color={colors.danger} />
      <AppText variant="caption" style={{ flex: 1, color: colors.danger }}>
        {t('mobile.sync.failedBanner', { count: rejected.length })}
      </AppText>
      <Pressable
        onPress={dismissAll}
        hitSlop={hitSlop}
        accessibilityRole="button"
        accessibilityLabel={t('mobile.sync.dismiss')}
      >
        <AppText variant="bodyStrong" style={{ color: colors.danger }}>
          {t('mobile.sync.dismiss')}
        </AppText>
      </Pressable>
    </View>
  );
}
