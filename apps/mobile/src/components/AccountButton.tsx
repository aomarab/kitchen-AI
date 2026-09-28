import { Animated, Pressable, type StyleProp, type ViewStyle } from 'react-native';
import { useRouter } from 'expo-router';
import { Avatar } from './Avatar';
import { usePressFeedback } from './press-feedback';
import { useFormat } from '../hooks/useFormat';
import { useAuthStore } from '../stores/auth';

export interface AccountButtonProps {
  style?: StyleProp<ViewStyle>;
}

export function AccountButton({ style }: AccountButtonProps) {
  const { t } = useFormat();
  const router = useRouter();
  const userName = useAuthStore((state) => state.user?.displayName);
  const pressFeedback = usePressFeedback();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('mobile.account.title')}
      onPress={() => router.push('/account')}
      {...pressFeedback.pressHandlers}
      style={[{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }, style]}
    >
      <Animated.View style={pressFeedback.animatedStyle}>
        <Avatar name={userName} size={32} />
      </Animated.View>
    </Pressable>
  );
}
