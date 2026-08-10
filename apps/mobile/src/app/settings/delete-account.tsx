import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, Header, AppText, Button, Card, Field, LoadingState, ErrorState } from '../../components';
import { useLocale } from '../../lib/locale';
import { useMe, useHouseholds } from '../../hooks/profile';
import { useDeleteAccount } from '../../hooks/account';
import { deleteConfirmationWord, matchesDeleteConfirmation } from '../../lib/delete-confirmation';
import { errorMessageKey } from '../../lib/errors';
import { colors, radius, spacing } from '../../theme';
import { successorFor } from '../../lib/successor-for';

export default function DeleteAccount() {
  const { t, locale } = useLocale();
  const router = useRouter();
  const meQuery = useMe();
  const householdsQuery = useHouseholds();
  const mutation = useDeleteAccount();

  const [confirmation, setConfirmation] = useState('');
  const [password, setPassword] = useState('');

  if (meQuery.isLoading || householdsQuery.isLoading) return <LoadingState />;
  if (meQuery.isError)
    return <ErrorState error={meQuery.error} onRetry={() => void meQuery.refetch()} />;
  if (householdsQuery.isError)
    return <ErrorState error={householdsQuery.error} onRetry={() => void householdsQuery.refetch()} />;
  if (!meQuery.data || !householdsQuery.data) return null;

  const user = meQuery.data;
  const households = householdsQuery.data;
  const word = deleteConfirmationWord(locale);
  const confirmed = matchesDeleteConfirmation(confirmation, locale);
  const canSubmit = confirmed && (!user.hasPassword || password.length > 0) && !mutation.isPending;

  const submit = () => {
    if (!canSubmit) return;
    mutation.mutate(
      { password: user.hasPassword ? password : undefined },
      { onSuccess: () => router.replace('/sign-in') },
    );
  };

  return (
    <Screen scroll>
      <Header title={t('mobile.deleteAccount.title')} onBack={() => router.back()} />

      <AppText muted>{t('mobile.deleteAccount.intro')}</AppText>

      <Card style={{ gap: spacing.sm }}>
        <AppText variant="label" muted>
          {t('mobile.deleteAccount.householdsTitle')}
        </AppText>
        {households.map((household) => {
          const successor = successorFor(household.members, user.id);
          return (
            <View
              key={household.id}
              style={{
                backgroundColor: colors.dangerSoft,
                borderColor: colors.danger,
                borderWidth: 1,
                borderRadius: radius.sm,
                padding: spacing.md,
              }}
            >
              <AppText variant="caption" color="danger">
                {successor
                  ? t('mobile.deleteAccount.handover', {
                      household: household.name,
                      successor: successor.displayName,
                    })
                  : t('mobile.deleteAccount.destroy', { household: household.name })}
              </AppText>
            </View>
          );
        })}
      </Card>

      <Field
        label={t('mobile.deleteAccount.confirmLabel', { word })}
        value={confirmation}
        onChangeText={setConfirmation}
        autoCapitalize="none"
        autoCorrect={false}
        editable={!mutation.isPending}
      />

      {user.hasPassword ? (
        <Field
          label={t('mobile.deleteAccount.passwordLabel')}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          autoComplete="current-password"
          editable={!mutation.isPending}
        />
      ) : null}

      {mutation.isError ? (
        <View accessibilityLiveRegion="polite">
          <AppText variant="caption" accessibilityRole="alert" color="danger">
            {t(errorMessageKey(mutation.error))}
          </AppText>
        </View>
      ) : null}

      <Button
        title={mutation.isPending ? t('mobile.deleteAccount.working') : t('mobile.deleteAccount.submit')}
        variant="danger"
        icon="trash"
        disabled={!canSubmit}
        loading={mutation.isPending}
        onPress={submit}
      />
      <Button
        title={t('mobile.deleteAccount.cancel')}
        variant="ghost"
        disabled={mutation.isPending}
        onPress={() => router.back()}
      />
    </Screen>
  );
}
