import { useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { Unit } from '@kitchen/contracts';
import {
  Screen,
  Header,
  Card,
  AppText,
  Badge,
  Button,
  Chip,
  Field,
  QuantityStepper,
  Sheet,
  LoadingState,
  ErrorState,
  EmptyState,
} from '../../components';
import type { BadgeTone } from '../../components/Badge';
import { useFormat } from '../../hooks/useFormat';
import {
  useInventory,
  useLocations,
  useUpdateInventoryItem,
  useDeleteInventoryItem,
  useAdjustQuantity,
} from '../../hooks/inventory';
import { ingredientName, unitLabel, formatExpiryLabel } from '../../lib/format';
import { expiryStatus, type ExpiryStatus } from '../../lib/expiry';
import { spacing } from '../../theme';

const COMMON_UNITS: Unit[] = ['piece', 'g', 'kg', 'ml', 'l', 'bunch', 'can', 'packet'];

const EXPIRY_TONE: Record<ExpiryStatus, BadgeTone> = {
  expired: 'danger',
  today: 'danger',
  soon: 'warn',
  ok: 'success',
  none: 'neutral',
};

export default function ItemDetail() {
  const { t, locale, prefs } = useFormat();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const inventory = useInventory();
  const locations = useLocations();
  const item = inventory.data?.items.find((i) => i.id === id);

  const update = useUpdateInventoryItem(id ?? '');
  const remove = useDeleteInventoryItem();
  const adjust = useAdjustQuantity();

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [draftUnit, setDraftUnit] = useState<Unit | null>(null);
  const [draftLocation, setDraftLocation] = useState<string | null>(null);
  const [draftExpiry, setDraftExpiry] = useState<string | null>(null);

  if (inventory.isLoading) {
    return (
      <Screen>
        <Header title={t('inventory.editItem')} onBack={() => router.back()} />
        <LoadingState />
      </Screen>
    );
  }
  if (inventory.isError) {
    return (
      <Screen>
        <Header title={t('inventory.editItem')} onBack={() => router.back()} />
        <ErrorState error={inventory.error} onRetry={() => void inventory.refetch()} />
      </Screen>
    );
  }
  if (!item) {
    return (
      <Screen>
        <Header title={t('inventory.editItem')} onBack={() => router.back()} />
        <EmptyState icon="kitchen" title={t('errors.NOT_FOUND')} />
      </Screen>
    );
  }

  const unit = draftUnit ?? item.unit;
  const locationId = draftLocation ?? item.locationId;
  const expiresAt = draftExpiry ?? item.expiresAt ?? '';
  const dirty =
    unit !== item.unit ||
    locationId !== item.locationId ||
    (expiresAt || null) !== (item.expiresAt ?? null);

  const onAdjust = (next: number) => {
    const delta = next - item.quantity;
    if (delta === 0) return;
    adjust.mutate({ itemId: item.id, delta, unit: item.unit, reason: 'corrected' });
  };

  const save = () =>
    update.mutate({ locationId, unit, expiresAt: expiresAt.trim() ? expiresAt.trim() : null });

  const expiryLabel = formatExpiryLabel(t, locale, item.expiresAt, prefs);

  return (
    <Screen scroll>
      <Header
        title={ingredientName(locale, item.ingredient)}
        onBack={() => router.back()}
        trailing={
          expiryLabel ? <Badge tone={EXPIRY_TONE[expiryStatus(item.expiresAt)]} label={expiryLabel} /> : undefined
        }
      />

      <Card style={{ gap: spacing.md }}>
        <AppText variant="label" muted>
          {t('inventory.quantity')}
        </AppText>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <QuantityStepper
            value={item.quantity}
            onChange={onAdjust}
            decrementLabel={t('mobile.common.decrease')}
            incrementLabel={t('mobile.common.increase')}
          />
          <AppText muted>{unitLabel(t, item.unit)}</AppText>
        </View>
      </Card>

      <Card style={{ gap: spacing.md }}>
        <View style={{ gap: spacing.xs }}>
          <AppText variant="label" muted>
            {t('inventory.location')}
          </AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            {(locations.data ?? []).map((loc) => (
              <Chip
                key={loc.id}
                label={loc.name}
                selected={locationId === loc.id}
                onPress={() => setDraftLocation(loc.id)}
              />
            ))}
          </View>
        </View>

        <View style={{ gap: spacing.xs }}>
          <AppText variant="label" muted>
            {t('inventory.unit')}
          </AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            {COMMON_UNITS.map((u) => (
              <Chip key={u} label={unitLabel(t, u)} selected={unit === u} onPress={() => setDraftUnit(u)} />
            ))}
          </View>
        </View>

        <Field
          label={t('inventory.expiryDate')}
          value={expiresAt}
          onChangeText={setDraftExpiry}
          placeholder={t('mobile.capture.noExpiry')}
          autoCapitalize="none"
          autoCorrect={false}
        />

        <Button
          title={t('common.save')}
          icon="check"
          disabled={!dirty}
          loading={update.isPending}
          onPress={save}
        />
      </Card>

      <Button
        title={t('inventory.deleteItem')}
        variant="danger"
        icon="trash"
        onPress={() => setConfirmDelete(true)}
      />

      <Sheet
        visible={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={t('inventory.deleteItem')}
      >
        <AppText muted>{ingredientName(locale, item.ingredient)}</AppText>
        <Button
          title={t('common.delete')}
          variant="danger"
          loading={remove.isPending}
          onPress={() =>
            remove.mutate(item.id, {
              onSuccess: () => {
                setConfirmDelete(false);
                router.back();
              },
            })
          }
        />
        <Button title={t('common.cancel')} variant="ghost" onPress={() => setConfirmDelete(false)} />
      </Sheet>
    </Screen>
  );
}
