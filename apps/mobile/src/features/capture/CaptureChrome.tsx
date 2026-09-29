import type { ReactNode } from 'react';
import { Animated, Pressable, View, type LayoutChangeEvent } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useIsFocused } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText, IconButton } from '../../components';
import { usePressFeedback } from '../../components/press-feedback';
import { useFormat } from '../../hooks/useFormat';
import { spacing } from '../../theme';
import { useTheme } from '../../theme/useTheme';

export type CaptureMethod = 'photo' | 'barcode' | 'receipt' | 'manual';
export type CaptureMediaMethod = Exclude<CaptureMethod, 'manual'>;

export const CAPTURE_METHOD_OPTIONS = [
  { value: 'photo', key: 'capture.photo' },
  { value: 'barcode', key: 'capture.barcode' },
  { value: 'receipt', key: 'capture.receipt' },
  { value: 'manual', key: 'capture.manual' },
] as const;

interface CaptureChromeProps {
  method: CaptureMethod;
  onMethodChange: (method: CaptureMethod) => void;
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

export function CaptureModeTabs({
  method,
  onMethodChange,
  media = false,
}: {
  method: CaptureMethod;
  onMethodChange: (method: CaptureMethod) => void;
  media?: boolean;
}) {
  const { t } = useFormat();
  const { colors } = useTheme();

  return (
    <View
      style={{
        minHeight: 44,
        flexDirection: 'row',
        alignItems: 'flex-end',
        borderBottomWidth: media ? 0 : 1,
        borderBottomColor: colors.rowline,
      }}
    >
      {CAPTURE_METHOD_OPTIONS.map((option) => (
        <CaptureModeTab
          key={option.value}
          label={t(option.key)}
          selected={method === option.value}
          media={media}
          onPress={() => onMethodChange(option.value)}
        />
      ))}
    </View>
  );
}

function CaptureModeTab({
  label,
  selected,
  media,
  onPress,
}: {
  label: string;
  selected: boolean;
  media: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const pressFeedback = usePressFeedback();
  const labelColor = media
    ? selected
      ? colors.textInverse
      : colors.textInverseMuted
    : selected
      ? colors.text
      : colors.textMuted;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      {...pressFeedback.pressHandlers}
      style={{
        minHeight: 44,
        flex: 1,
        alignItems: 'center',
        justifyContent: 'flex-end',
        paddingBottom: spacing.sm,
      }}
    >
      <Animated.View style={!selected ? pressFeedback.animatedStyle : undefined}>
        <AppText variant="buttonSmall" center style={{ color: labelColor }}>
          {label}
        </AppText>
      </Animated.View>
      <View
        style={{
          position: 'absolute',
          bottom: 0,
          width: 20,
          height: selected ? 2 : 0,
          backgroundColor: media ? colors.primaryInverse : colors.text,
        }}
      />
    </Pressable>
  );
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
  const isFocused = useIsFocused();

  return (
    <View style={{ flex: 1, backgroundColor: colors.surfaceInverse }}>
      {isFocused ? <StatusBar style="light" /> : null}
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
          <IconButton
            icon="x"
            size={44}
            tone="media"
            accessibilityLabel={t('common.close')}
            onPress={onClose}
          />
          <View style={{ flex: 1 }} />
          <View style={{ minWidth: 44, alignItems: 'flex-end' }}>{trailing}</View>
        </View>
        <View style={{ paddingHorizontal: spacing.gutter }}>
          <CaptureModeTabs method={method} onMethodChange={onMethodChange} media />
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
