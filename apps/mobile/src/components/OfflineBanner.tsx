import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from './AppText';
import { Icon } from './Icon';
import { colors, spacing } from '../theme';
import { useLocale } from '../lib/locale';
import { useConnectivity } from '../stores/connectivity';
import { useOfflineQueue } from '../stores/offline-queue';

/**
 * Persistent strip shown while the device is offline (spec §6.3). Also surfaces
 * the number of inventory events queued for replay so the user knows their
 * changes are safe. Rendered as a top overlay by the root layout, so it fills
 * behind the status bar via the top safe-area inset.
 */
export function OfflineBanner() {
  const { t } = useLocale();
  const insets = useSafeAreaInsets();
  const online = useConnectivity((state) => state.online);
  const pending = useOfflineQueue((state) => state.events.length);
  if (online) return null;
  return (
    <View
      accessibilityRole="alert"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        backgroundColor: colors.warnSoft,
        paddingTop: insets.top + spacing.xs,
        paddingBottom: spacing.sm,
        paddingHorizontal: spacing.lg,
      }}
    >
      <Icon name="offline" size={16} color={colors.warn} />
      <AppText variant="caption" style={{ flex: 1, color: colors.warn }}>
        {t('mobile.sync.offlineBanner')}
      </AppText>
      {pending > 0 ? (
        <AppText variant="caption" style={{ color: colors.warn }}>
          {t('mobile.sync.pendingSync', { count: pending })}
        </AppText>
      ) : null}
    </View>
  );
}
