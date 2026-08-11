import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { AuthLayout, AppText, AuthSwitchLink, Field, Button, OAuthButtons } from '../../components';
import { useFormat } from '../../hooks/useFormat';
import { useSignUp } from '../../hooks/auth';
import { errorMessageKey } from '../../lib/errors';
import { spacing } from '../../theme';

export default function SignUp() {
  const { t, locale } = useFormat();
  const router = useRouter();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const signUp = useSignUp();

  const goHome = () => router.replace('/');
  const submit = () =>
    signUp.mutate({ displayName, email, password, locale }, { onSuccess: goHome });

  return (
    <AuthLayout title={t('mobile.auth.signUpTitle')} subtitle={t('mobile.auth.signUpSubtitle')}>
      <View style={{ gap: spacing.md }}>
        <Field
          label={t('auth.displayName')}
          value={displayName}
          onChangeText={setDisplayName}
          textContentType="name"
        />
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
          textContentType="newPassword"
          hint={t('auth.passwordRules.tooShort')}
        />
        {signUp.error ? (
          <AppText color="danger" variant="caption">
            {t(errorMessageKey(signUp.error))}
          </AppText>
        ) : null}
        <Button title={t('auth.signUp')} onPress={submit} loading={signUp.isPending} />
      </View>

      <OAuthButtons onSuccess={goHome} />

      <AuthSwitchLink to="/sign-in" />
    </AuthLayout>
  );
}
