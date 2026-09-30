import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  Screen,
  Header,
  AppText,
  Button,
  Field,
  Icon,
  LoadingState,
  ErrorState,
} from '../../components';
import { useLocale } from '../../lib/locale';
import { useMe, useHouseholds } from '../../hooks/profile';
import { useDeleteAccount } from '../../hooks/account';
import { deleteConfirmationWord, matchesDeleteConfirmation } from '../../lib/delete-confirmation';
import { errorMessageKey } from '../../lib/errors';
import { spacing } from '../../theme';
import { useTheme } from '../../theme/useTheme';
import { successorFor } from '../../lib/successor-for';

export default function DeleteAccount() {
  const { t, locale } = useLocale();
  const router = useRouter();
  const { colors } = useTheme();
  const meQuery = useMe();
  const householdsQuery = useHouseholds();
  const mutation = useDeleteAccount();

  const [confirmation, setConfirmation] = useState('');
  const [password, setPassword] = useState('');

  if (meQuery.isLoading || householdsQuery.isLoading) {
    return (
      <Screen>
        <Header title={t('mobile.deleteAccount.title')} onBack={() => router.back()} />
        <LoadingState />
      </Screen>
    );
  }
  if (meQuery.isError)
    return (
      <Screen>
        <Header title={t('mobile.deleteAccount.title')} onBack={() => router.back()} />
        <ErrorState error={meQuery.error} onRetry={() => void meQuery.refetch()} />
      </Screen>
    );
  if (householdsQuery.isError)
    return (
      <Screen>
        <Header title={t('mobile.deleteAccount.title')} onBack={() => router.back()} />
        <ErrorState error={householdsQuery.error} onRetry={() => void householdsQuery.refetch()} />
      </Screen>
    );
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
      { onSuccess: () => router.replace('/welcome') },
    );
  };

  return (
    <Screen
      scroll
      footer={
        <View style={{ gap: spacing.sm }}>
          <Button
            title={
              mutation.isPending
                ? t('mobile.deleteAccount.working')
                : t('mobile.deleteAccount.submit')
            }
            variant="destructive"
            leadingIcon="trash"
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
        </View>
      }
    >
      <Header title={t('mobile.deleteAccount.title')} onBack={() => router.back()} />

      <AppText variant="body">{t('mobile.deleteAccount.intro')}</AppText>

      <View style={{ gap: spacing.sm }}>
        <AppText variant="label" muted>
          {t('mobile.deleteAccount.householdsTitle')}
        </AppText>
        {households.map((household) => {
          const successor = successorFor(household.members, user.id);
          const message = successor
            ? t('mobile.deleteAccount.handover', {
                household: household.name,
                successor: successor.displayName,
              })
            : t('mobile.deleteAccount.destroy', { household: household.name });
          return (
            <View
              key={household.id}
              style={{
                flexDirection: 'row',
                gap: spacing.md,
                alignItems: 'center',
                padding: spacing.lg,
                backgroundColor: colors.surfaceAlt,
                borderBottomWidth: 1,
                borderBottomColor: colors.rowline,
              }}
            >
              <Icon name="home" size={40} color={colors.text} />
              <AppText style={{ flex: 1 }}>{message}</AppText>
            </View>
          );
        })}
      </View>

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
          autoCorrect={false}
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
    </Screen>
  );
}
