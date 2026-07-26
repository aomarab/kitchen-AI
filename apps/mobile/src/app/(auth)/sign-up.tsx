import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, AppText, Field, Button, Header } from '../../components';
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

  const submit = () =>
    signUp.mutate(
      { displayName, email, password, locale },
      { onSuccess: () => router.replace('/') },
    );

  return (
    <Screen scroll>
      <Header title={t('auth.signUp')} onBack={() => router.back()} />
      <View style={{ gap: spacing.md, marginTop: spacing.lg }}>
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

      <Pressable onPress={() => router.replace('/sign-in')} style={{ marginTop: spacing.lg }}>
        <AppText center color="primary">
          {t('mobile.auth.haveAccount')}
        </AppText>
      </Pressable>
    </Screen>
  );
}
