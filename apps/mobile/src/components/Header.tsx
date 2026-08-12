import { Pressable, View } from 'react-native';
import { AppText } from './AppText';
import { DirectionalIcon } from './DirectionalIcon';
import { hitSlop, spacing } from '../theme';
import { useTheme } from '../theme/useTheme';
import { useLocale } from '../lib/locale';

export interface HeaderProps {
  title: string;
  onBack?: () => void;
  trailing?: React.ReactNode;
  subtitle?: string;
}

/** In-screen header row with an optional back affordance (mirrors in RTL). */
export function Header({ title, onBack, trailing, subtitle }: HeaderProps) {
  const { t } = useLocale();
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 44 }}>
      {onBack ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          hitSlop={hitSlop}
          onPress={onBack}
        >
          <DirectionalIcon name="back" size={26} color={colors.text} />
        </Pressable>
      ) : null}
      <View style={{ flex: 1, gap: 2 }}>
        <AppText variant="title">{title}</AppText>
        {subtitle ? (
          <AppText variant="caption" muted>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {trailing}
    </View>
  );
}
