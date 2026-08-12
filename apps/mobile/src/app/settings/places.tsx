import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import type { StorageLocation, StorageLocationType } from '@kitchen/contracts';
import { storageLocationTypeSchema } from '@kitchen/contracts';
import {
  AppText,
  Button,
  Card,
  Chip,
  ErrorState,
  Field,
  Header,
  ListRow,
  LoadingState,
  Screen,
  Sheet,
} from '../../components';
import { useFormat } from '../../hooks/useFormat';
import {
  useCreateLocation,
  useDeleteLocation,
  useInventory,
  useLocations,
  useUpdateLocation,
} from '../../hooks/inventory';
import { locationLabel } from '../../lib/format';
import { countByLocation, planLocationRemoval } from '../../lib/places';
import { colors, spacing } from '../../theme';

const TYPES = storageLocationTypeSchema.options;

type Editing = { location: StorageLocation } | { location: null };

export default function Places() {
  const { t } = useFormat();
  const router = useRouter();
  const locations = useLocations();
  // Every item, so each place can show what it holds. The count is the whole
  // point of the screen: it is what makes "remove" a decision rather than a
  // guess.
  const inventory = useInventory({ limit: 200 });

  const create = useCreateLocation();
  const update = useUpdateLocation();
  const remove = useDeleteLocation();

  const [editing, setEditing] = useState<Editing | null>(null);
  const [name, setName] = useState('');
  const [type, setType] = useState<StorageLocationType>('other');
  const [removing, setRemoving] = useState<StorageLocation | null>(null);

  const counts = useMemo(() => countByLocation(inventory.data?.items ?? []), [inventory.data]);

  const openAdd = () => {
    setName('');
    setType('other');
    setEditing({ location: null });
  };

  const openEdit = (location: StorageLocation) => {
    setName(locationLabel(t, location));
    setType(location.type);
    setEditing({ location });
  };

  const save = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const existing = editing?.location;
    if (existing) {
      update.mutate({ id: existing.id, body: { name: trimmed, type } }, { onSuccess: close });
    } else {
      create.mutate({ name: trimmed, type }, { onSuccess: close });
    }
  };

  const close = () => setEditing(null);

  const places = locations.data ?? [];
  const removalPlan = removing
    ? planLocationRemoval(removing, counts.get(removing.id) ?? 0, places)
    : null;
  const destinations =
    removalPlan?.action === 'choose-destination' ? removalPlan.destinations : [];

  if (locations.isLoading) {
    return (
      <Screen>
        <Header title={t('mobile.places.title')} onBack={() => router.back()} />
        <LoadingState />
      </Screen>
    );
  }
  if (locations.isError) {
    return (
      <Screen>
        <Header title={t('mobile.places.title')} onBack={() => router.back()} />
        <ErrorState error={locations.error} onRetry={() => void locations.refetch()} />
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <Header title={t('mobile.places.title')} onBack={() => router.back()} />

      {places.map((place) => {
        const count = counts.get(place.id) ?? 0;
        const plan = planLocationRemoval(place, count, places);
        return (
          <ListRow
            key={place.id}
            title={locationLabel(t, place)}
            subtitle={count === 0 ? t('mobile.places.empty') : t('mobile.places.itemCount', { count })}
            onPress={() => openEdit(place)}
            trailing={
              <Button
                title={t('mobile.places.remove')}
                variant="ghost"
                // Removing the last place would leave nowhere to put food, and
                // nowhere to move what is already stored.
                disabled={plan.action === 'blocked'}
                onPress={() =>
                  plan.action === 'delete'
                    ? remove.mutate({ id: place.id })
                    : setRemoving(place)
                }
              />
            }
          />
        );
      })}

      <Button title={t('mobile.places.add')} icon="plus" variant="secondary" onPress={openAdd} />

      <Sheet
        visible={editing !== null}
        onClose={close}
        title={editing?.location ? t('mobile.places.rename') : t('mobile.places.add')}
      >
        <Field
          label={t('mobile.places.title')}
          placeholder={t('mobile.places.namePlaceholder')}
          value={name}
          onChangeText={setName}
          autoFocus
        />
        <View style={{ gap: spacing.xs }}>
          <AppText variant="label" muted>
            {t('mobile.places.kind')}
          </AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            {TYPES.map((option) => (
              <Chip
                key={option}
                label={t(`inventory.locations.${option}`)}
                selected={type === option}
                onPress={() => setType(option)}
              />
            ))}
          </View>
        </View>
        <Button
          title={t('common.save')}
          icon="check"
          disabled={name.trim().length === 0}
          loading={create.isPending || update.isPending}
          onPress={save}
        />
      </Sheet>

      <Sheet
        visible={removing !== null}
        onClose={() => setRemoving(null)}
        title={t('mobile.places.moveTitle')}
      >
        <AppText muted>
          {t('mobile.places.moveBody', {
            count: removalPlan?.action === 'choose-destination' ? removalPlan.itemCount : 0,
          })}
        </AppText>
        {destinations.length === 0 ? (
          <AppText style={{ color: colors.danger }}>{t('mobile.places.cannotRemoveLast')}</AppText>
        ) : (
          <Card style={{ gap: spacing.sm }}>
            {destinations.map((destination) => (
              <ListRow
                key={destination.id}
                title={locationLabel(t, destination)}
                subtitle={t('mobile.places.moveHere')}
                onPress={() =>
                  removing &&
                  remove.mutate(
                    { id: removing.id, moveTo: destination.id },
                    { onSuccess: () => setRemoving(null) },
                  )
                }
              />
            ))}
          </Card>
        )}
      </Sheet>
    </Screen>
  );
}
