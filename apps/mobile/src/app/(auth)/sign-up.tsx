import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  AuthLayout,
  AppText,
  AuthSwitchLink,
  Field,
  Button,
  OAuthButtons,
  Icon,
} from '../../components';
import { useFormat } from '../../hooks/useFormat';
import { useSignUp } from '../../hooks/auth';
import { errorMessageKey } from '../../lib/errors';
import { passwordRuleFailures, passwordSatisfiesClientRules } from '../../lib/password-rules';
import { spacing } from '../../theme';
import { useTheme } from '../../theme/useTheme';

export default function SignUp() {
  const { t, locale } = useFormat();
  const { colors } = useTheme();
  const router = useRouter();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const signUp = useSignUp();
  const passwordFailures = passwordRuleFailures(password);
  const showPasswordRules = (submitAttempted || password.length > 0) && passwordFailures.length > 0;

  const goHome = () => router.replace('/');
  const submit = () => {
    setSubmitAttempted(true);
    if (!passwordSatisfiesClientRules(password)) return;
    signUp.mutate({ displayName, email, password, locale }, { onSuccess: goHome });
  };

  return (
    <AuthLayout
      title={t('mobile.auth.signUpTitle')}
      subtitle={t('mobile.auth.signUpSubtitle')}
      footer={<AuthSwitchLink to="/sign-in" />}
    >
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
          invalid={showPasswordRules}
          hint={showPasswordRules ? undefined : t('auth.passwordRules.tooShort')}
        />
        {showPasswordRules ? (
          <View style={{ gap: spacing.xs }}>
            {passwordFailures.map((key) => (
              <View
                key={key}
                accessible
                accessibilityLabel={`${t(key)}, ${t('mobile.auth.passwordRuleUnmet')}`}
                style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}
              >
                <Icon name="x" size={14} color={colors.danger} />
                <AppText color="danger" variant="caption" style={{ flex: 1 }}>
                  {t(key)}
                </AppText>
              </View>
            ))}
          </View>
        ) : signUp.error ? (
          <AppText color="danger" variant="caption">
            {t(errorMessageKey(signUp.error))}
          </AppText>
        ) : null}
        <Button title={t('auth.signUp')} onPress={submit} loading={signUp.isPending} />
      </View>

      <OAuthButtons onSuccess={goHome} />
    </AuthLayout>
  );
}
