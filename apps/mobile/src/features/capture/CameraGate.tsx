import type { ReactNode } from 'react';
import { Linking, View, type StyleProp, type ViewStyle } from 'react-native';
import { useCameraPermissions } from 'expo-camera';
import { AppText, Button, Card, LoadingState } from '../../components';
import { useFormat } from '../../hooks/useFormat';
import { spacing } from '../../theme';

type CameraPermissionTuple = ReturnType<typeof useCameraPermissions>;
type CameraPermission = CameraPermissionTuple[0];
type RequestCameraPermission = CameraPermissionTuple[1];

export function useCameraAccess(): CameraPermissionTuple {
  return useCameraPermissions();
}

interface CameraPermissionPromptProps {
  permission: CameraPermission;
  requestPermission: RequestCameraPermission;
}

function CameraPermissionPrompt({ permission, requestPermission }: CameraPermissionPromptProps) {
  const { t } = useFormat();

  if (!permission) return <LoadingState />;

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

interface CameraGateProps {
  children: ReactNode;
  permission: CameraPermission;
  requestPermission: RequestCameraPermission;
  promptStyle?: StyleProp<ViewStyle>;
}

/**
 * Gates the viewfinder only. Capture chrome stays outside this component so a
 * missing permission never removes close/back navigation.
 */
export function CameraGate({
  children,
  permission,
  requestPermission,
  promptStyle,
}: CameraGateProps) {
  if (!permission?.granted) {
    return (
      <View style={[{ flex: 1, justifyContent: 'center' }, promptStyle]}>
        <CameraPermissionPrompt permission={permission} requestPermission={requestPermission} />
      </View>
    );
  }

  return <>{children}</>;
}
