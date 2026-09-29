import { Animated, Pressable } from 'react-native';
import { AppText, Icon } from '../../components';
import { usePressFeedback } from '../../components/press-feedback';
import { useFormat } from '../../hooks/useFormat';
import { useTheme } from '../../theme/useTheme';

export const ASSISTANT_SEARCH_TARGET_HEIGHT = 52;

export function AssistantSearchButton({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors } = useTheme();
  const { t } = useFormat();
  const pressFeedback = usePressFeedback();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      {...pressFeedback.pressHandlers}
      style={{ minHeight: ASSISTANT_SEARCH_TARGET_HEIGHT }}
    >
      <Animated.View
        style={[
          {
            minHeight: ASSISTANT_SEARCH_TARGET_HEIGHT,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            paddingHorizontal: 12,
            backgroundColor: colors.surfaceAlt,
          },
          pressFeedback.animatedStyle,
        ]}
      >
        <Icon name="search" size={20} color={colors.textMuted} />
        <AppText variant="body" color="textMuted" style={{ flex: 1 }}>
          {t('mobile.home.greeting')}
        </AppText>
        <Icon name="mic" size={22} color={colors.text} />
      </Animated.View>
    </Pressable>
  );
}
