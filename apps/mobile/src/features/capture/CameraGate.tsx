import type { ReactNode } from 'react';
import { Linking, View } from 'react-native';
import { useCameraPermissions } from 'expo-camera';
import { AppText, Button, Card, LoadingState } from '../../components';
import { useFormat } from '../../hooks/useFormat';
import { spacing } from '../../theme';

/**
 * Renders children only once camera permission is granted. Otherwise it shows a
 * graceful prompt using the `mobile.permissions.*` strings, and falls back to
 * "open settings" when the OS will no longer show the system dialog.
 */
export function CameraGate({ children }: { children: ReactNode }) {
  const { t } = useFormat();
  const [permission, requestPermission] = useCameraPermissions();

  if (!permission) return <LoadingState />;

  if (!permission.granted) {
    return (
      <Card style={{ gap: spacing.md, margin: spacing.lg }}>
        <AppText variant="heading">{t('mobile.permissions.cameraTitle')}</AppText>
        <AppText muted>{t('mobile.permissions.cameraBody')}</AppText>
        {!permission.canAskAgain ? (
          <AppText variant="caption" color="danger">
            {t('mobile.permissions.denied')}
          </AppText>
        ) : null}
        <View style={{ gap: spacing.sm }}>
          {permission.canAskAgain ? (
            <Button title={t('mobile.permissions.grant')} onPress={() => void requestPermission()} />
          ) : (
            <Button
              title={t('mobile.permissions.openSettings')}
              onPress={() => void Linking.openSettings()}
            />
          )}
        </View>
      </Card>
    );
  }

  return <>{children}</>;
}
