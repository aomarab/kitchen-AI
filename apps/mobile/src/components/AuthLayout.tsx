import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from './Screen';
import { AppText } from './AppText';
import { IconButton } from './IconButton';
import { useLocale } from '../lib/locale';
import { spacing } from '../theme';

export interface AuthLayoutProps {
  title: string;
  titleAccent?: string;
  subtitle: string;
  children: ReactNode;
}

export function AuthLayout({ title, titleAccent, subtitle, children }: AuthLayoutProps) {
  const { t } = useLocale();
  const router = useRouter();
  const canGoBack = router.canGoBack();

  return (
    <Screen
      scroll
      edges={['top', 'bottom']}
      contentStyle={{ gap: spacing.gutter, paddingTop: spacing.gutter }}
    >
      {canGoBack ? (
        <IconButton
          accessibilityLabel={t('common.back')}
          icon="back"
          directional
          tone="plain"
          onPress={() => router.back()}
          style={{ alignSelf: 'flex-start' }}
        />
      ) : null}

      <View style={{ gap: spacing.sm }}>
        <AppText variant="hero" accessibilityRole="header">
          {title}
          {titleAccent ? (
            <>
              {' '}
              <AppText variant="hero" color="primaryText">
                {titleAccent}
              </AppText>
            </>
          ) : null}
        </AppText>
        <AppText variant="body" muted>
          {subtitle}
        </AppText>
      </View>

      <View style={{ gap: spacing.md }}>{children}</View>
    </Screen>
  );
}
