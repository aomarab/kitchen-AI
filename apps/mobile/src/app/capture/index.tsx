import { useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Screen, Header } from '../../components';
import { PhotoCapture } from '../../features/capture/PhotoCapture';
import { BarcodeCapture } from '../../features/capture/BarcodeCapture';
import { ManualAdd } from '../../features/capture/ManualAdd';
import type { CaptureMediaMethod } from '../../features/capture/CaptureChrome';
import { useFormat } from '../../hooks/useFormat';
import { spacing } from '../../theme';
import { useTheme } from '../../theme/useTheme';

type Method = CaptureMediaMethod | 'manual';

export const MEDIA_METHOD_OPTIONS = [
  { value: 'photo' },
  { value: 'barcode' },
  { value: 'receipt' },
] as const;

function isMethod(value: unknown): value is Method {
  return value === 'photo' || value === 'barcode' || value === 'receipt' || value === 'manual';
}

/** Capture entry point: manual stays themed; media methods use the dark chrome. */
export default function Capture() {
  const { t } = useFormat();
  const { colors } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ method?: string }>();
  const [method, setMethod] = useState<Method>(isMethod(params.method) ? params.method : 'photo');

  if (method === 'manual') {
    return (
      <Screen padded={false} edges={['top']}>
        <View style={{ padding: spacing.lg, paddingBottom: spacing.sm }}>
          <Header title={t('mobile.capture.manualTitle')} onBack={() => router.back()} />
        </View>
        <ManualAdd />
      </Screen>
    );
  }

  return (
    <Screen
      padded={false}
      edges={[]}
      style={{ backgroundColor: colors.surfaceInverse }}
      contentStyle={{ backgroundColor: colors.surfaceInverse }}
    >
      {method === 'barcode' ? (
        <BarcodeCapture method={method} onMethodChange={setMethod} onClose={() => router.back()} />
      ) : (
        <PhotoCapture
          mode={method === 'receipt' ? 'receipt' : 'photo'}
          method={method}
          onMethodChange={setMethod}
          onClose={() => router.back()}
        />
      )}
    </Screen>
  );
}
