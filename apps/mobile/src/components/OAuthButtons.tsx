import { useState } from 'react';
import { View } from 'react-native';
import type { OAuthProvider } from '@kitchen/contracts';
import { Button } from './Button';
import { AppText } from './AppText';
import { useFormat } from '../hooks/useFormat';
import { useOAuthSignIn } from '../hooks/auth';
import { errorMessageKey } from '../lib/errors';
import { spacing } from '../theme';
import { useTheme } from '../theme/useTheme';

interface OAuthButtonsProps {
  /** Runs only after a session exists — a dismissed provider sheet is a no-op. */
  onSuccess: () => void;
}

/**
 * Apple and Google sign-in, shown on both the sign-in and sign-up screens.
 * App Store review rejects an app that offers third-party sign-in on one of
 * them and withholds Sign in with Apple, so the pair travels together.
 */
export function OAuthButtons({ onSuccess }: OAuthButtonsProps) {
  const { t } = useFormat();
  const { colors } = useTheme();
  const oauth = useOAuthSignIn();
  // One mutation drives both buttons, so its `isPending` alone would spin the
  // wrong one; this records which provider was actually tapped.
  const [pending, setPending] = useState<OAuthProvider | null>(null);

  const go = (provider: OAuthProvider) => {
    setPending(provider);
    oauth.mutate(provider, {
      onSuccess: (session) => {
        if (session) onSuccess();
      },
      onSettled: () => setPending(null),
    });
  };

  return (
    <View>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.sm,
          marginVertical: spacing.md,
        }}
      >
        <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
        <AppText muted variant="caption">
          {t('mobile.auth.orDivider')}
        </AppText>
        <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
      </View>

      {oauth.error ? (
        <AppText color="danger" variant="caption" style={{ marginBottom: spacing.sm }}>
          {t(errorMessageKey(oauth.error))}
        </AppText>
      ) : null}

      <View style={{ gap: spacing.sm }}>
        <Button
          variant="secondary"
          icon="apple"
          title={t('auth.continueWithApple')}
          onPress={() => go('apple')}
          loading={pending === 'apple'}
          disabled={pending !== null}
        />
        <Button
          variant="secondary"
          icon="google"
          title={t('auth.continueWithGoogle')}
          onPress={() => go('google')}
          loading={pending === 'google'}
          disabled={pending !== null}
        />
      </View>
    </View>
  );
}
