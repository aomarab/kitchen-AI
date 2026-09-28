import { useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import { AppText } from './AppText';
import { IconButton } from './IconButton';
import { spacing } from '../theme';
import { useLocale } from '../lib/locale';

export interface HeaderProps {
  title: string;
  onBack?: () => void;
  /** One trailing control, such as a ghost action or status badge. */
  trailing?: React.ReactNode;
  subtitle?: string;
}

export function Header({ title, onBack, trailing, subtitle }: HeaderProps) {
  const { t } = useLocale();
  const [sideWidths, setSideWidths] = useState({ start: 44, end: 0 });
  const sideInset = Math.max(sideWidths.start, sideWidths.end, 44);
  const measureSide = (side: 'start' | 'end') => (event: LayoutChangeEvent) => {
    const width = Math.ceil(event.nativeEvent.layout.width);
    setSideWidths((current) => (current[side] === width ? current : { ...current, [side]: width }));
  };

  return (
    <View style={{ minHeight: 52, justifyContent: 'center' }}>
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
          minHeight: 52,
        }}
      >
        <View onLayout={measureSide('start')} style={{ minWidth: 44, alignItems: 'flex-start' }}>
          {onBack ? (
            <IconButton
              icon="back"
              tone="plain"
              directional
              accessibilityLabel={t('common.back')}
              onPress={onBack}
            />
          ) : null}
        </View>
        <View onLayout={measureSide('end')} style={{ minWidth: 44, alignItems: 'flex-end' }}>
          {trailing}
        </View>
      </View>
    </View>
  );
}
