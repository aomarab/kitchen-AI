import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { AuthLayout, AppText, Field, Button, Chip } from '../../components';
import { useFormat } from '../../hooks/useFormat';
import { useCreateHousehold, useJoinHousehold } from '../../hooks/auth';
import { useAuthStore } from '../../stores/auth';
import { errorMessageKey } from '../../lib/errors';
import { spacing } from '../../theme';

type Mode = 'create' | 'join';

const HOUSEHOLD_MODE_OPTIONS = [
  { value: 'create', labelKey: 'mobile.auth.createTab' },
  { value: 'join', labelKey: 'mobile.auth.joinTab' },
] as const satisfies readonly {
  value: Mode;
  labelKey: 'mobile.auth.createTab' | 'mobile.auth.joinTab';
}[];

export default function Onboarding() {
  const { t } = useFormat();
  const router = useRouter();
  const signOut = useAuthStore((state) => state.signOut);
  const [mode, setMode] = useState<Mode>('create');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const create = useCreateHousehold();
  const join = useJoinHousehold();

  const goHome = () => router.replace('/home');
  const submit = () => {
    if (mode === 'create') create.mutate({ name }, { onSuccess: goHome });
    else join.mutate({ inviteCode: code.toUpperCase() }, { onSuccess: goHome });
  };

  const error = mode === 'create' ? create.error : join.error;
  const pending = create.isPending || join.isPending;

  return (
    <AuthLayout
      title={t('mobile.auth.onboardTitle2')}
      titleAccent={t('mobile.auth.onboardAccent')}
      subtitle={t('mobile.auth.onboardSubtitle')}
    >
      <View
        accessibilityRole="radiogroup"
        style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}
      >
        {HOUSEHOLD_MODE_OPTIONS.map((option) => {
          const selected = mode === option.value;
          return (
            <Chip
              key={option.value}
              label={t(option.labelKey)}
              selected={selected}
              onPress={() => setMode(option.value)}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              style={{ minHeight: 56, flexGrow: 1, flexBasis: '45%', alignItems: 'center' }}
            />
          );
        })}
      </View>

      <View style={{ gap: spacing.md }}>
        {mode === 'create' ? (
          <Field label={t('household.name')} value={name} onChangeText={setName} />
        ) : (
          <Field
            label={t('household.inviteCode')}
            value={code}
            onChangeText={setCode}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={6}
          />
        )}
        {error ? (
          <AppText color="danger" variant="caption">
            {t(errorMessageKey(error))}
          </AppText>
        ) : null}
        <Button title={t('mobile.auth.continue')} onPress={submit} loading={pending} />
      </View>

      <Button
        title={t('auth.signOut')}
        variant="ghost"
        onPress={() => {
          void signOut().then(() => router.replace('/sign-in'));
        }}
        style={{ marginTop: spacing.lg }}
      />
    </AuthLayout>
  );
}
