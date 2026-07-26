import { useState } from 'react';
import { Share, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  Screen,
  Header,
  AppText,
  Badge,
  Button,
  Card,
  Field,
  ListRow,
  LoadingState,
  ErrorState,
  EmptyState,
} from '../../components';
import { useFormat } from '../../hooks/useFormat';
import { useHouseholds, useUpdateHousehold, useRotateInviteCode } from '../../hooks/profile';
import { useAuthStore } from '../../stores/auth';
import { spacing } from '../../theme';

export default function Household() {
  const { t } = useFormat();
  const router = useRouter();
  const households = useHouseholds();
  const activeId = useAuthStore((state) => state.activeHouseholdId);
  const household =
    households.data?.find((h) => h.id === activeId) ?? households.data?.[0] ?? null;

  const update = useUpdateHousehold(household?.id ?? '');
  const rotate = useRotateInviteCode(household?.id ?? '');
  const [name, setName] = useState<string | null>(null);

  if (households.isLoading) {
    return (
      <Screen>
        <Header title={t('household.title')} onBack={() => router.back()} />
        <LoadingState />
      </Screen>
    );
  }
  if (households.isError) {
    return (
      <Screen>
        <Header title={t('household.title')} onBack={() => router.back()} />
        <ErrorState error={households.error} onRetry={() => void households.refetch()} />
      </Screen>
    );
  }
  if (!household) {
    return (
      <Screen>
        <Header title={t('household.title')} onBack={() => router.back()} />
        <EmptyState icon="household" title={t('household.title')} />
      </Screen>
    );
  }

  const draftName = name ?? household.name;

  return (
    <Screen scroll>
      <Header title={t('household.title')} onBack={() => router.back()} />

      <Field label={t('household.name')} value={draftName} onChangeText={setName} />
      <Button
        title={t('common.save')}
        icon="check"
        disabled={draftName.trim() === household.name || draftName.trim().length === 0}
        loading={update.isPending}
        onPress={() => update.mutate({ name: draftName.trim() })}
      />

      <Card style={{ gap: spacing.sm }}>
        <AppText variant="label" muted>
          {t('household.inviteCode')}
        </AppText>
        <AppText variant="title">{household.inviteCode}</AppText>
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <Button
            title={t('household.shareInvite')}
            variant="secondary"
            onPress={() => void Share.share({ message: household.inviteCode })}
            style={{ flex: 1 }}
          />
          <Button
            title={t('plans.regenerate')}
            variant="ghost"
            icon="sync"
            loading={rotate.isPending}
            onPress={() => rotate.mutate()}
            style={{ flex: 1 }}
          />
        </View>
      </Card>

      <AppText variant="heading">{t('household.members')}</AppText>
      {household.members.map((member) => (
        <ListRow
          key={member.userId}
          title={member.displayName}
          subtitle={member.email}
          trailing={
            <Badge
              tone={member.role === 'owner' ? 'info' : 'neutral'}
              label={member.role === 'owner' ? t('household.owner') : t('household.member')}
            />
          }
        />
      ))}
    </Screen>
  );
}
