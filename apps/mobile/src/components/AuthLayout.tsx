import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from './Screen';
import { AppText } from './AppText';
import { DirectionalIcon } from './DirectionalIcon';
import { useLocale } from '../lib/locale';
import { hitSlop, radius, spacing } from '../theme';
import { useTheme } from '../theme/useTheme';

export interface AuthLayoutProps {
  title: string;
  subtitle: string;
  children: ReactNode;
}

/**
 * The auth chrome: a navy band carrying the page title, with the form sheet
 * riding over it. Matches the web `(auth)` layout so the two platforms read as
 * one product. Only the top edge is inset — the sheet runs to the bottom.
 */
export function AuthLayout({ title, subtitle, children }: AuthLayoutProps) {
  const { colors } = useTheme();
  const { t } = useLocale();
  const router = useRouter();
  // Only when there is somewhere to return to. These screens are also the
  // destination after signing out, where the stack is empty and a back arrow
  // would be a dead control.
  const canGoBack = router.canGoBack();

  return (
    <Screen
      scroll
      padded={false}
      edges={['top']}
      style={{ backgroundColor: colors.surfaceInverse }}
    >
      <View style={{ padding: spacing.lg, gap: spacing.xs }}>
        {canGoBack ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('common.back')}
            hitSlop={hitSlop}
            onPress={() => router.back()}
            style={{ alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' }}
          >
            <DirectionalIcon name="back" size={26} color={colors.textInverse} />
          </Pressable>
        ) : null}
        <AppText variant="display" color="textInverse">
          {title}
        </AppText>
        <AppText color="textInverseMuted">{subtitle}</AppText>
      </View>

      <View
        style={{
          flexGrow: 1,
          backgroundColor: colors.bg,
          borderTopStartRadius: radius.lg,
          borderTopEndRadius: radius.lg,
          padding: spacing.lg,
          gap: spacing.md,
        }}
      >
        {children}
      </View>
    </Screen>
  );
}
