import { useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Screen, Header, SegmentedControl } from '../../components';
import { PhotoCapture } from '../../features/capture/PhotoCapture';
import { BarcodeCapture } from '../../features/capture/BarcodeCapture';
import { ManualAdd } from '../../features/capture/ManualAdd';
import { useFormat } from '../../hooks/useFormat';
import { spacing } from '../../theme';

type Method = 'photo' | 'barcode' | 'receipt' | 'manual';

function isMethod(value: unknown): value is Method {
  return value === 'photo' || value === 'barcode' || value === 'receipt' || value === 'manual';
}

/** Capture entry point: choose a method, then run the matching flow. */
export default function Capture() {
  const { t } = useFormat();
  const router = useRouter();
  const params = useLocalSearchParams<{ method?: string }>();
  const [method, setMethod] = useState<Method>(isMethod(params.method) ? params.method : 'photo');

  return (
    <Screen padded={false} edges={['top']}>
      <View style={{ padding: spacing.lg, gap: spacing.md }}>
        <Header title={t('capture.title')} onBack={() => router.back()} />
        <SegmentedControl<Method>
          value={method}
          onChange={setMethod}
          options={[
            { value: 'photo', label: t('capture.photo') },
            { value: 'barcode', label: t('capture.barcode') },
            { value: 'receipt', label: t('capture.receipt') },
            { value: 'manual', label: t('capture.manual') },
          ]}
        />
      </View>

      <View style={{ flex: 1 }}>
        {method === 'photo' ? (
          <PhotoCapture mode="photo" />
        ) : method === 'receipt' ? (
          <PhotoCapture mode="receipt" />
        ) : method === 'barcode' ? (
          <BarcodeCapture />
        ) : (
          <ManualAdd />
        )}
      </View>
    </Screen>
  );
}
