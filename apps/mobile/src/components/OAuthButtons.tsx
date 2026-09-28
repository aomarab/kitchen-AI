import { useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import type { OAuthProvider } from '@kitchen/contracts';
import { AppText } from './AppText';
import { Icon } from './Icon';
import { useFormat } from '../hooks/useFormat';
import { useOAuthSignIn } from '../hooks/auth';
import { errorMessageKey } from '../lib/errors';
import { radius, spacing } from '../theme';
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
        <SocialButton
          provider="apple"
          title={t('auth.continueWithApple')}
          loading={pending === 'apple'}
          disabled={pending !== null}
          onPress={() => go('apple')}
        />
        <SocialButton
          provider="google"
          title={t('auth.continueWithGoogle')}
          loading={pending === 'google'}
          disabled={pending !== null}
          onPress={() => go('google')}
        />
      </View>
    </View>
  );
}

interface SocialButtonProps {
  provider: OAuthProvider;
  title: string;
  loading: boolean;
  disabled: boolean;
  onPress: () => void;
}

function SocialButton({ provider, title, loading, disabled, onPress }: SocialButtonProps) {
  const { colors } = useTheme();
  const apple = provider === 'apple';
  const fill = apple ? colors.inverse : colors.bg;
  const label = apple ? colors.onInverse : colors.text;
  const border = apple ? colors.inverse : colors.border;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled, busy: loading }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 44,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        borderRadius: radius.none,
        borderWidth: 1,
        borderColor: border,
        backgroundColor: fill,
        opacity: disabled && !loading ? 0.5 : pressed ? 0.85 : 1,
      })}
    >
      {loading ? (
        <ActivityIndicator color={label} />
      ) : (
        <>
          <Icon name={provider} size={18} color={label} />
          <AppText variant="buttonSmall" style={{ color: label }}>
            {title}
          </AppText>
        </>
      )}
    </Pressable>
  );
}
