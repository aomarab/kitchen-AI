import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { AuthLayout, AppText, AuthTabs, Field, Button, OAuthButtons } from '../../components';
import { useFormat } from '../../hooks/useFormat';
import { useSignIn } from '../../hooks/auth';
import { errorMessageKey } from '../../lib/errors';
import { spacing } from '../../theme';

export default function SignIn() {
  const { t } = useFormat();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const signIn = useSignIn();

  const goHome = () => router.replace('/');
  const submit = () => signIn.mutate({ email, password }, { onSuccess: goHome });

  return (
    <AuthLayout title={t('mobile.auth.welcomeTitle')} subtitle={t('mobile.auth.welcomeSubtitle')}>
      <AuthTabs />

      <View style={{ gap: spacing.md }}>
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
        {signIn.error ? (
          <AppText color="danger" variant="caption">
            {t(errorMessageKey(signIn.error))}
          </AppText>
        ) : null}
        <Button title={t('auth.signIn')} onPress={submit} loading={signIn.isPending} />
      </View>

      <OAuthButtons onSuccess={goHome} />
    </AuthLayout>
  );
}
