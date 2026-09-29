import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import type { StorageLocation, StorageLocationType } from '@kitchen/contracts';
import { storageLocationTypeSchema } from '@kitchen/contracts';
import {
  AppText,
  Button,
  Chip,
  ErrorState,
  Field,
  Header,
  IconButton,
  Illustration,
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
import { placeIllustration } from '../../lib/kitchen';
import { countByLocation, planLocationRemoval } from '../../lib/places';
import { spacing } from '../../theme';
import { useTheme } from '../../theme/useTheme';

const TYPES = storageLocationTypeSchema.options;

type Editing = { location: StorageLocation } | { location: null };

function PlaceArt({ type, size = 44 }: { type: StorageLocationType; size?: number }) {
  return <Illustration name={placeIllustration(type)} size={size} />;
}

export default function Places() {
  const { t } = useFormat();
  const router = useRouter();
  const { colors } = useTheme();
  const locations = useLocations();
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
  const destinations = removalPlan?.action === 'choose-destination' ? removalPlan.destinations : [];

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

      <AppText variant="body" muted>
        {t('mobile.places.entryHint')}
      </AppText>

      <View>
        {places.map((place) => {
          const count = counts.get(place.id) ?? 0;
          const plan = planLocationRemoval(place, count, places);
          const countLabel =
            count === 0 ? t('mobile.places.empty') : t('mobile.places.itemCount', { count });
          return (
            <ListRow
              key={place.id}
              leading={<PlaceArt type={place.type} />}
              title={locationLabel(t, place)}
              subtitle={countLabel}
              onPress={() => openEdit(place)}
              trailing={
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                  <IconButton
                    icon="pencil"
                    tone="plain"
                    accessibilityLabel={`${t('mobile.places.rename')} ${locationLabel(t, place)}`}
                    onPress={() => openEdit(place)}
                  />
                  <IconButton
                    icon="trash"
                    tone="plain"
                    disabled={plan.action === 'blocked'}
                    accessibilityLabel={`${t('mobile.places.remove')} ${locationLabel(t, place)}`}
                    onPress={() =>
                      plan.action === 'delete'
                        ? remove.mutate({ id: place.id })
                        : setRemoving(place)
                    }
                  />
                </View>
              }
            />
          );
        })}
      </View>

      <Button
        title={t('mobile.places.add')}
        leadingIcon="plus"
        variant="secondary"
        onPress={openAdd}
      />

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
          <AppText variant="label">{t('mobile.places.kind')}</AppText>
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
          <View>
            {destinations.map((destination) => (
              <ListRow
                key={destination.id}
                leading={<PlaceArt type={destination.type} />}
                title={locationLabel(t, destination)}
                subtitle={t('mobile.places.moveHere')}
                showChevron
                onPress={() =>
                  removing &&
                  remove.mutate(
                    { id: removing.id, moveTo: destination.id },
                    { onSuccess: () => setRemoving(null) },
                  )
                }
              />
            ))}
          </View>
        )}
        <Button title={t('common.cancel')} variant="ghost" onPress={() => setRemoving(null)} />
      </Sheet>
    </Screen>
  );
}
