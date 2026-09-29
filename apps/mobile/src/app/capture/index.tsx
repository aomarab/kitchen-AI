import { useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { AppText, IconButton, Screen } from '../../components';
import { PhotoCapture } from '../../features/capture/PhotoCapture';
import { BarcodeCapture } from '../../features/capture/BarcodeCapture';
import { ManualAdd } from '../../features/capture/ManualAdd';
import { CaptureModeTabs, type CaptureMethod } from '../../features/capture/CaptureChrome';
import { useFormat } from '../../hooks/useFormat';
import { spacing } from '../../theme';
import { useTheme } from '../../theme/useTheme';

function isMethod(value: unknown): value is CaptureMethod {
  return value === 'photo' || value === 'barcode' || value === 'receipt' || value === 'manual';
}

function CapturePageHeader({
  method,
  onMethodChange,
  onClose,
}: {
  method: CaptureMethod;
  onMethodChange: (method: CaptureMethod) => void;
  onClose: () => void;
}) {
  const { t } = useFormat();
  return (
    <View style={{ paddingHorizontal: spacing.gutter, paddingTop: spacing.sm }}>
      <View style={{ minHeight: 44, justifyContent: 'center' }}>
        <View style={{ position: 'absolute', start: -spacing.md, top: 0 }}>
          <IconButton
            icon="x"
            tone="plain"
            accessibilityLabel={t('common.close')}
            onPress={onClose}
          />
        </View>
        <AppText variant="bodyStrong" center>
          {t('capture.title')}
        </AppText>
      </View>
      <CaptureModeTabs method={method} onMethodChange={onMethodChange} />
    </View>
  );
}

/** Capture entry point: manual stays themed; media methods use the dark chrome. */
export default function Capture() {
  const { colors } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ method?: string }>();
  const [method, setMethod] = useState<CaptureMethod>(
    isMethod(params.method) ? params.method : 'photo',
  );

  if (method === 'manual') {
    return (
      <Screen padded={false} edges={['top']}>
        <CapturePageHeader
          method={method}
          onMethodChange={setMethod}
          onClose={() => router.back()}
        />
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
