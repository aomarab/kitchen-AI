import { useState } from 'react';
import { View, useWindowDimensions } from 'react-native';
import { CameraView, type BarcodeScanningResult } from 'expo-camera';
import { useRouter } from 'expo-router';
import type { RouteResponse, Unit } from '@kitchen/contracts';
import { AppText, Badge, Button, Card, Chip, Field, QuantityStepper } from '../../components';
import { CameraGate, useCameraAccess } from './CameraGate';
import { CaptureChrome, type CaptureMediaMethod, type CaptureMethod } from './CaptureChrome';
import { CaptureTorchButton } from './CaptureTorchButton';
import { useFormat } from '../../hooks/useFormat';
import { useBarcodeLookup } from '../../hooks/capture';
import { useLocations, useBulkCreateInventory } from '../../hooks/inventory';
import { locationLabel, unitLabel } from '../../lib/format';
import { buildBarcodeInput } from '../../lib/capture';
import { spacing } from '../../theme';
import { useTheme } from '../../theme/useTheme';

type Lookup = RouteResponse<'lookupBarcode'>;

interface BarcodeCaptureProps {
  method: CaptureMediaMethod;
  onMethodChange: (method: CaptureMethod) => void;
  onClose: () => void;
}

/** Barcode capture: scan or type a code, look it up, then confirm the single add. */
export function BarcodeCapture({ method, onMethodChange, onClose }: BarcodeCaptureProps) {
  const { t } = useFormat();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const router = useRouter();
  const [cameraPermission, requestCameraPermission] = useCameraAccess();
  const [topHeight, setTopHeight] = useState(0);
  const [bottomHeight, setBottomHeight] = useState(0);
  const [manual, setManual] = useState('');
  const [result, setResult] = useState<Lookup | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [unit, setUnit] = useState<Unit>('piece');
  const [locationId, setLocationId] = useState<string>('');
  const [torch, setTorch] = useState(false);

  const lookup = useBarcodeLookup();
  const locations = useLocations();
  const create = useBulkCreateInventory();

  const runLookup = async (code: string) => {
    if (!/^\d{6,20}$/.test(code)) return;
    const found = await lookup.mutateAsync(code);
    setResult(found);
    setQuantity(found.suggestedQuantity ?? 1);
    setUnit(found.suggestedUnit ?? 'piece');
    setLocationId(locations.data?.[0]?.id ?? '');
  };

  const onScan = (scan: BarcodeScanningResult) => {
    if (result || lookup.isPending) return;
    void runLookup(scan.data);
  };

  const confirm = async () => {
    if (!result) return;
    const input = buildBarcodeInput(result, { quantity, unit, locationId });
    if (!input) return;
    await create.mutateAsync({ items: [input] });
    router.replace('/kitchen');
  };

  const guideSize = Math.min(width * 0.72, 280);

  const trailing = cameraPermission?.granted ? (
    <CaptureTorchButton enabled={torch} onToggle={() => setTorch((value) => !value)} />
  ) : null;

  const bottom = (
    <View style={{ padding: spacing.lg, gap: spacing.sm }}>
      <Card style={{ gap: spacing.sm }}>
        <AppText variant="caption" muted>
          {t('mobile.capture.scanBarcodeHint')}
        </AppText>
        <Field
          label={t('mobile.capture.enterBarcode')}
          value={manual}
          onChangeText={setManual}
          placeholder={t('mobile.capture.barcodeManual')}
          keyboardType="number-pad"
          returnKeyType="search"
          onSubmitEditing={() => void runLookup(manual)}
        />
        <Button
          title={t('common.search')}
          variant="secondary"
          loading={lookup.isPending}
          onPress={() => void runLookup(manual)}
        />
        {result && !result.found ? (
          <AppText muted center>
            {t('capture.barcodeNotFound')}
          </AppText>
        ) : null}
      </Card>

      {result?.found ? (
        <Card style={{ gap: spacing.md }}>
          <View style={{ gap: 2 }}>
            <AppText variant="heading">{result.productName}</AppText>
            {result.brand ? (
              <AppText variant="caption" muted>
                {result.brand}
              </AppText>
            ) : null}
            {result.match ? <Badge tone="primary" label={t('recipe.inStock')} /> : null}
          </View>
          <QuantityStepper
            value={quantity}
            onChange={setQuantity}
            unit={unitLabel(t, unit)}
            accessibilityLabel={t('inventory.quantity')}
            decrementLabel={t('mobile.common.decrease')}
            incrementLabel={t('mobile.common.increase')}
          />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            {(locations.data ?? []).map((loc) => (
              <Chip
                key={loc.id}
                label={locationLabel(t, loc)}
                selected={locationId === loc.id}
                onPress={() => setLocationId(loc.id)}
              />
            ))}
          </View>
          <Button
            title={t('inventory.addItem')}
            leadingIcon="check"
            loading={create.isPending}
            disabled={!locationId}
            onPress={() => void confirm()}
          />
        </Card>
      ) : null}
    </View>
  );

  return (
    <CaptureChrome
      method={method}
      onMethodChange={onMethodChange}
      onClose={onClose}
      trailing={trailing}
      bottom={bottom}
      onTopLayout={setTopHeight}
      onBottomLayout={setBottomHeight}
    >
      <View style={{ flex: 1 }}>
        <CameraGate
          permission={cameraPermission}
          requestPermission={requestCameraPermission}
          promptStyle={{ paddingTop: topHeight, paddingBottom: bottomHeight }}
        >
          <CameraView
            style={{ flex: 1 }}
            enableTorch={torch}
            barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_e', 'code128', 'qr'] }}
            onBarcodeScanned={onScan}
          />
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              alignSelf: 'center',
              top: '26%',
              width: guideSize,
              height: guideSize,
            }}
          >
            {(['top-start', 'top-end', 'bottom-start', 'bottom-end'] as const).map((corner) => {
              const [vertical, horizontal] = corner.split('-') as [
                'top' | 'bottom',
                'start' | 'end',
              ];
              return (
                <View
                  key={corner}
                  style={{
                    position: 'absolute',
                    [vertical]: 0,
                    [horizontal]: 0,
                    width: 28,
                    height: 28,
                  }}
                >
                  <View
                    style={{
                      position: 'absolute',
                      top: vertical === 'top' ? 0 : undefined,
                      bottom: vertical === 'bottom' ? 0 : undefined,
                      start: 0,
                      end: 0,
                      height: 3,
                      backgroundColor: colors.textInverse,
                    }}
                  />
                  <View
                    style={{
                      position: 'absolute',
                      top: 0,
                      bottom: 0,
                      start: horizontal === 'start' ? 0 : undefined,
                      end: horizontal === 'end' ? 0 : undefined,
                      width: 3,
                      backgroundColor: colors.textInverse,
                    }}
                  />
                </View>
              );
            })}
            <View
              style={{
                position: 'absolute',
                start: 44,
                end: 44,
                top: guideSize / 2,
                height: 2,
                backgroundColor: colors.primaryInverse,
              }}
            />
          </View>
        </CameraGate>
      </View>
    </CaptureChrome>
  );
}
