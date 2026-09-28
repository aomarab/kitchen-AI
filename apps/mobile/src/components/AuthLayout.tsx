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
  leading?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}

export function AuthLayout({
  title,
  titleAccent,
  subtitle,
  leading,
  children,
  footer,
}: AuthLayoutProps) {
  const { t } = useLocale();
  const router = useRouter();
  const canGoBack = router.canGoBack();

  return (
    <Screen
      scroll
      edges={['top', 'bottom']}
      contentStyle={{ flexGrow: 1, gap: spacing.xl, paddingTop: spacing.gutter }}
    >
      {canGoBack ? (
        <IconButton
          accessibilityLabel={t('common.back')}
          icon="chevL"
          directional
          tone="plain"
          onPress={() => router.back()}
          style={{ alignSelf: 'flex-start' }}
        />
      ) : null}

      {leading}

      <View style={{ gap: spacing.sm }}>
        <AppText variant="display" accessibilityRole="header">
          {title}
          {titleAccent ? (
            <>
              {' '}
              <AppText variant="display" color="primaryText">
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
      {footer ? (
        <>
          <View style={{ flexGrow: 1 }} />
          <View style={{ gap: spacing.sm }}>{footer}</View>
        </>
      ) : null}
    </Screen>
  );
}
