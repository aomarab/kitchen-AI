import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { AuthLayout, AppText, Field, Button, Icon, SegmentedControl } from '../../components';
import { useFormat } from '../../hooks/useFormat';
import { useCreateHousehold, useJoinHousehold } from '../../hooks/auth';
import { useAuthStore } from '../../stores/auth';
import { resetToSignIn } from '../../lib/entry-route';
import { errorMessageKey } from '../../lib/errors';
import { spacing } from '../../theme';
import { useTheme } from '../../theme/useTheme';

type Mode = 'create' | 'join';

const HOUSEHOLD_MODE_OPTIONS = [
  { value: 'create', labelKey: 'mobile.auth.createTab' },
  { value: 'join', labelKey: 'mobile.auth.joinTab' },
] as const satisfies readonly {
  value: Mode;
  labelKey: 'mobile.auth.createTab' | 'mobile.auth.joinTab';
}[];

function HouseholdMark() {
  const { colors } = useTheme();
  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={{ width: 64, height: 64, justifyContent: 'center' }}
    >
      <Icon name="home" size={52} color={colors.text} />
      <View
        style={{
          position: 'absolute',
          start: 27,
          bottom: 11,
          width: 10,
          height: 17,
          borderWidth: 1.5,
          borderColor: colors.primary,
        }}
      />
    </View>
  );
}

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
      leading={<HouseholdMark />}
      footer={
        <>
          <Button title={t('mobile.auth.continue')} onPress={submit} loading={pending} />
          <Button
            title={t('auth.signOut')}
            variant="ghost"
            onPress={() => {
              void signOut().then(() => resetToSignIn(router));
            }}
          />
        </>
      }
    >
      <SegmentedControl<Mode>
        options={HOUSEHOLD_MODE_OPTIONS.map((option) => ({
          value: option.value,
          label: t(option.labelKey),
        }))}
        value={mode}
        onChange={setMode}
      />

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
      </View>
    </AuthLayout>
  );
}
