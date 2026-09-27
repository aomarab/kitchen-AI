import type { ReactNode } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RoundButton, SegmentedControl } from '../../components';
import { useFormat } from '../../hooks/useFormat';
import { spacing } from '../../theme';
import { useTheme } from '../../theme/useTheme';

export type CaptureMediaMethod = 'photo' | 'barcode' | 'receipt';

interface CaptureChromeProps {
  method: CaptureMediaMethod;
  onMethodChange: (method: CaptureMediaMethod) => void;
  onClose: () => void;
  trailing?: ReactNode;
  bottom?: ReactNode;
  children: ReactNode;
  onTopLayout?: (height: number) => void;
  onBottomLayout?: (height: number) => void;
}

function heightFrom(event: LayoutChangeEvent): number {
  return event.nativeEvent.layout.height;
}

/** Shared dark media chrome for photo, barcode and receipt capture. */
export function CaptureChrome({
  method,
  onMethodChange,
  onClose,
  trailing,
  bottom,
  children,
  onTopLayout,
  onBottomLayout,
}: CaptureChromeProps) {
  const { t } = useFormat();
  const { colors } = useTheme();

  return (
    <View style={{ flex: 1, backgroundColor: colors.surfaceInverse }}>
      <View style={{ flex: 1 }}>{children}</View>

      <SafeAreaView
        edges={['top']}
        onLayout={(event) => onTopLayout?.(heightFrom(event))}
        style={{
          position: 'absolute',
          top: 0,
          start: 0,
          end: 0,
          zIndex: 10,
        }}
      >
        <View
          style={{
            minHeight: 56,
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.sm,
            paddingHorizontal: spacing.lg,
            paddingBottom: spacing.sm,
          }}
        >
          <RoundButton
            icon="close"
            size={40}
            tone="media"
            accessibilityLabel={t('common.close')}
            onPress={onClose}
            style={{ opacity: 0.8 }}
          />
          <View style={{ flex: 1 }}>
            <SegmentedControl<CaptureMediaMethod>
              tone="media"
              value={method}
              onChange={onMethodChange}
              options={[
                { value: 'photo', label: t('capture.photo') },
                { value: 'barcode', label: t('capture.barcode') },
                { value: 'receipt', label: t('capture.receipt') },
              ]}
            />
          </View>
          <View style={{ width: 44, alignItems: 'flex-end' }}>{trailing}</View>
        </View>
      </SafeAreaView>

      {bottom ? (
        <SafeAreaView
          edges={['bottom']}
          onLayout={(event) => onBottomLayout?.(heightFrom(event))}
          style={{
            position: 'absolute',
            start: 0,
            end: 0,
            bottom: 0,
            zIndex: 10,
          }}
        >
          {bottom}
        </SafeAreaView>
      ) : null}
    </View>
  );
}
