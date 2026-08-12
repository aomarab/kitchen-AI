import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Screen } from './Screen';
import { AppText } from './AppText';
import { radius, spacing } from '../theme';
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

  return (
    <Screen
      scroll
      padded={false}
      edges={['top']}
      style={{ backgroundColor: colors.surfaceInverse }}
    >
      <View style={{ padding: spacing.lg, gap: spacing.xs }}>
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
