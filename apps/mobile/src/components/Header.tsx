import { View } from 'react-native';
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
 * The pushed-screen header (spec §8.6): back, a centred `bodyStrong` title and
 * an optional trailing control. Both sides take equal flex, so the title stays
 * centred when only one of them is filled. Tab screens use `TabHeader`.
 */
export function Header({ title, onBack, trailing, subtitle }: HeaderProps) {
  const { t } = useLocale();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 44 }}>
      <View style={{ flex: 1, alignItems: 'flex-start' }}>
        {onBack ? (
          <RoundButton
            icon="back"
            directional
            accessibilityLabel={t('common.back')}
            onPress={onBack}
          />
        ) : null}
      </View>
      <View style={{ flex: 2, alignItems: 'center', gap: 2 }}>
        <AppText variant="bodyStrong" center numberOfLines={1} accessibilityRole="header">
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="caption" muted center numberOfLines={1}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      <View style={{ flex: 1, alignItems: 'flex-end' }}>{trailing}</View>
    </View>
  );
}
