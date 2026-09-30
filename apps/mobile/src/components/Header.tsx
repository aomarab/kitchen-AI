import { useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import { AppText } from './AppText';
import { RoundButton } from './RoundButton';
import { spacing } from '../theme';
import { useLocale } from '../lib/locale';

export interface HeaderProps {
  title: string;
  onBack?: () => void;
  /** One trailing control, such as F4's ghost "Retake" or a status badge. */
  trailing?: React.ReactNode;
  subtitle?: string;
}

/**
 * The pushed-screen header (spec §8.6): back, a screen-centred `bodyStrong`
 * title and an optional trailing control. Side controls keep their intrinsic
 * width while the title gets symmetric padding from the wider side, so text
 * actions do not wrap and the title still sits on the screen centreline. Tab
 * screens use `TabHeader`.
 */
export function Header({ title, onBack, trailing, subtitle }: HeaderProps) {
  const { t } = useLocale();
  const [sideWidths, setSideWidths] = useState({ start: 44, end: 0 });
  const sideInset = Math.max(sideWidths.start, sideWidths.end, 44);
  const measureSide = (side: 'start' | 'end') => (event: LayoutChangeEvent) => {
    const width = Math.ceil(event.nativeEvent.layout.width);
    setSideWidths((current) => (current[side] === width ? current : { ...current, [side]: width }));
  };

  return (
    <View style={{ minHeight: 44, justifyContent: 'center' }}>
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          start: 0,
          end: 0,
          top: 0,
          bottom: 0,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: sideInset + spacing.sm,
          gap: 2,
        }}
      >
        <AppText variant="bodyStrong" center numberOfLines={1} accessibilityRole="header">
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="caption" muted center numberOfLines={1}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: spacing.sm,
          minHeight: 44,
        }}
      >
        <View onLayout={measureSide('start')} style={{ minWidth: 44, alignItems: 'flex-start' }}>
          {onBack ? (
            <RoundButton
              icon="back"
              directional
              accessibilityLabel={t('common.back')}
              onPress={onBack}
            />
          ) : null}
        </View>
        <View onLayout={measureSide('end')} style={{ alignItems: 'flex-end' }}>
          {trailing}
        </View>
      </View>
    </View>
  );
}
