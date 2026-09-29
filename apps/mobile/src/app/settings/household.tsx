import { useState } from 'react';
import { Share, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  Screen,
  Header,
  AppText,
  Avatar,
  Badge,
  Button,
  Field,
  ListGroup,
  ListRow,
  LoadingState,
  ErrorState,
  EmptyState,
  SectionLabel,
} from '../../components';
import { useFormat } from '../../hooks/useFormat';
import { useHouseholds, useUpdateHousehold, useRotateInviteCode } from '../../hooks/profile';
import { useAuthStore } from '../../stores/auth';
import { spacing } from '../../theme';
import { useTheme } from '../../theme/useTheme';

export default function Household() {
  const { t } = useFormat();
  const { colors } = useTheme();
  const router = useRouter();
  const households = useHouseholds();
  const activeId = useAuthStore((state) => state.activeHouseholdId);
  const household = households.data?.find((h) => h.id === activeId) ?? households.data?.[0] ?? null;

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
        <EmptyState illustration="house" title={t('household.title')} />
      </Screen>
    );
  }

  const draftName = name ?? household.name;
  const canSave = draftName.trim() !== household.name && draftName.trim().length > 0;

  return (
    <Screen
      scroll
      footer={
        <Button
          title={t('common.save')}
          leadingIcon="check"
          disabled={!canSave || update.isPending}
          loading={update.isPending}
          onPress={() => update.mutate({ name: draftName.trim() })}
        />
      }
    >
      <Header title={t('household.title')} onBack={() => router.back()} />

      <Field label={t('household.name')} value={draftName} onChangeText={setName} />

      <View style={{ gap: spacing.sm }}>
        <SectionLabel>{t('household.members')}</SectionLabel>
        <ListGroup>
          {household.members.map((member) => (
            <ListRow
              key={member.userId}
              leading={<Avatar name={member.displayName} size={40} />}
              title={member.displayName}
              subtitle={member.email}
              trailing={
                <Badge
                  tone="muted"
                  label={member.role === 'owner' ? t('household.owner') : t('household.member')}
                />
              }
            />
          ))}
        </ListGroup>
      </View>

      <View
        style={{
          gap: spacing.md,
          padding: spacing.xl,
          backgroundColor: colors.surfaceAlt,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.rowline,
        }}
      >
        <AppText variant="label" muted>
          {t('household.inviteCode')}
        </AppText>
        <AppText variant="display">{household.inviteCode}</AppText>
        <AppText variant="caption" muted>
          {t('household.shareInvite')}
        </AppText>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          <Button
            title={t('household.shareInvite')}
            variant="inverse"
            size="S"
            leadingIcon="share"
            fullWidth={false}
            onPress={() => void Share.share({ message: household.inviteCode })}
          />
          <Button
            title={t('mobile.settings.newInviteCode')}
            variant="ghost"
            size="S"
            leadingIcon="refresh"
            fullWidth={false}
            loading={rotate.isPending}
            onPress={() => rotate.mutate()}
          />
        </View>
      </View>
    </Screen>
  );
}
