import { Pressable, View } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { AppText } from './AppText';
import { useFormat } from '../hooks/useFormat';
import { colors, radius, spacing } from '../theme';

const TABS = [
  { path: '/sign-in', label: 'auth.signIn' },
  { path: '/sign-up', label: 'auth.signUp' },
] as const;

/**
 * Sign in and create account read as one panel with two tabs. They stay
 * separate routes so deep links keep working, and switching uses `replace` so
 * the pair never stacks up in history — there is no "back" between two halves
 * of the same screen.
 */
export function AuthTabs() {
  const { t } = useFormat();
  const router = useRouter();
  const pathname = usePathname();

  return (
    <View
      style={{
        flexDirection: 'row',
        backgroundColor: colors.surfaceAlt,
        borderRadius: radius.pill,
        padding: spacing.xs,
        gap: spacing.xs,
      }}
    >
      {TABS.map((tab) => {
        const active = pathname === tab.path;
        return (
          <Pressable
            key={tab.path}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => {
              if (!active) router.replace(tab.path);
            }}
            style={{
              flex: 1,
              paddingVertical: spacing.sm,
              borderRadius: radius.pill,
              backgroundColor: active ? colors.surface : 'transparent',
            }}
          >
            <AppText variant="label" center style={{ color: active ? colors.text : colors.textMuted }}>
              {t(tab.label)}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}
