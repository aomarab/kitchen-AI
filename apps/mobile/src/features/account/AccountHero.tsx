import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { AppText, Avatar, DirectionalIcon } from '../../components';
import { usePressFeedback } from '../../components/press-feedback';
import { accountProfileAccessibilityLabel } from '../../lib/settings-accessibility';
import { spacing } from '../../theme';
import { useTheme } from '../../theme/useTheme';

export const ACCOUNT_HERO_MIN_HEIGHT = 80;

export interface AccountHeroProps {
  name: string;
  email?: string | null;
  profileHint?: string;
  onPress: () => void;
}

export function AccountHero({ name, email, profileHint, onPress }: AccountHeroProps) {
  const { colors } = useTheme();
  const pressFeedback = usePressFeedback();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accountProfileAccessibilityLabel({ name, email })}
      accessibilityHint={profileHint}
      onPress={onPress}
      {...pressFeedback.pressHandlers}
    >
      <Animated.View
        style={[
          {
            minHeight: ACCOUNT_HERO_MIN_HEIGHT,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 14,
            paddingVertical: spacing.md,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: colors.rowline,
          },
          pressFeedback.animatedStyle,
        ]}
      >
        <Avatar name={name} size={56} />
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="title">{name}</AppText>
          {email ? (
            <AppText variant="caption" muted>
              {email}
            </AppText>
          ) : null}
        </View>
        <DirectionalIcon name="chevron" size={18} color={colors.control} />
      </Animated.View>
    </Pressable>
  );
}
