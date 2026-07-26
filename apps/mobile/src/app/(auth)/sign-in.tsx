import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, AppText, Field, Button } from '../../components';
import { useFormat } from '../../hooks/useFormat';
import { useSignIn, useOAuthSignIn } from '../../hooks/auth';
import { errorMessageKey } from '../../lib/errors';
import { colors, spacing } from '../../theme';

export default function SignIn() {
  const { t } = useFormat();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const signIn = useSignIn();
  const oauth = useOAuthSignIn();

  const goHome = () => router.replace('/');
  const submit = () => signIn.mutate({ email, password }, { onSuccess: goHome });
  const oauthIn = (provider: 'apple' | 'google') =>
    oauth.mutate({ provider, idToken: 'mock-identity-token' }, { onSuccess: goHome });

  const error = signIn.error ?? oauth.error;

  return (
    <Screen scroll>
      <View style={{ gap: spacing.xs, marginTop: spacing.xxl }}>
        <AppText variant="display">{t('common.appName')}</AppText>
        <AppText muted>{t('mobile.auth.welcomeSubtitle')}</AppText>
      </View>

      <View style={{ gap: spacing.md, marginTop: spacing.xl }}>
        <Field
          label={t('auth.email')}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="emailAddress"
        />
        <Field
          label={t('auth.password')}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          textContentType="password"
        />
        {error ? (
          <AppText color="danger" variant="caption">
            {t(errorMessageKey(error))}
          </AppText>
        ) : null}
        <Button title={t('auth.signIn')} onPress={submit} loading={signIn.isPending} />
      </View>

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

      <View style={{ gap: spacing.sm }}>
        <Button
          variant="secondary"
          icon="apple"
          title={t('auth.continueWithApple')}
          onPress={() => oauthIn('apple')}
          loading={oauth.isPending}
        />
        <Button
          variant="secondary"
          icon="google"
          title={t('auth.continueWithGoogle')}
          onPress={() => oauthIn('google')}
        />
      </View>

      <Pressable onPress={() => router.push('/sign-up')} style={{ marginTop: spacing.lg }}>
        <AppText center color="primary">
          {t('mobile.auth.noAccount')}
        </AppText>
      </Pressable>
    </Screen>
  );
}
