import type { ReactNode } from 'react';
import { useRouter } from 'expo-router';
import { View } from 'react-native';
import { Screen } from './Screen';
import { AppText } from './AppText';
import { OrbMascot } from './OrbMascot';
import { RoundButton } from './RoundButton';
import { useLocale } from '../lib/locale';
import { spacing } from '../theme';

export interface AuthLayoutProps {
  title: string;
  titleAccent?: string;
  subtitle: string;
  children: ReactNode;
}

/**
 * The auth chrome: a themed page with Mama, a hero title and keyboard-aware
 * scrolling around the form.
 */
export function AuthLayout({ title, titleAccent, subtitle, children }: AuthLayoutProps) {
  const { t } = useLocale();
  const router = useRouter();
  // Only when there is somewhere to return to. These screens are also the
  // destination after signing out, where the stack is empty and a back arrow
  // would be a dead control.
  const canGoBack = router.canGoBack();

  return (
    <Screen scroll edges={['top', 'bottom']} contentStyle={{ gap: spacing.md }}>
      {canGoBack ? (
        <RoundButton
          accessibilityLabel={t('common.back')}
          icon="back"
          directional
          size={40}
          tone="surface"
          onPress={() => router.back()}
          style={{ alignSelf: 'flex-start' }}
        />
      ) : null}

      <OrbMascot size={72} state="idle" accessible={false} style={{ alignSelf: 'flex-start' }} />

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

      <View style={{ gap: spacing.md }}>{children}</View>
    </Screen>
  );
}
