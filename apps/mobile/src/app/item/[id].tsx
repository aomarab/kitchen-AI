import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { InventoryEventReason, Unit } from '@kitchen/contracts';
import type { MessageKey } from '@kitchen/i18n';
import {
  Screen,
  Header,
  Card,
  Bento,
  AppText,
  Badge,
  Button,
  Chip,
  DateField,
  Field,
  FoodIcon,
  QuantityStepper,
  Sheet,
  Tile,
  LoadingState,
  ErrorState,
  EmptyState,
  ListGroup,
  ListRow,
  SectionLabel,
} from '../../components';
import { useFormat } from '../../hooks/useFormat';
import {
  useInventoryItem,
  useInventoryEvents,
  useLocations,
  useUpdateInventoryItem,
  useDeleteInventoryItem,
  useAdjustQuantity,
} from '../../hooks/inventory';
import {
  ingredientName,
  itemName,
  unitLabel,
  formatExpiryLabel,
  locationLabel,
  formatDateL,
  formatMeasure,
} from '../../lib/format';
import { expiryStatus, isValidExpiryInput } from '../../lib/expiry';
import { errorMessageKey } from '../../lib/errors';
import { itemHistory } from '../../lib/inventory-history';
import { EXPIRY_TONE } from '../../lib/kitchen';
import { ProductReview } from '../../features/inventory/ProductReview';
import { radius, spacing } from '../../theme';
import { useTheme } from '../../theme/useTheme';

const COMMON_UNITS: Unit[] = ['piece', 'g', 'kg', 'ml', 'l', 'bunch', 'can', 'packet'];
const MINI_TILE_HEIGHT = 112;

const REASON_KEY: Record<InventoryEventReason, MessageKey> = {
  added: 'mobile.item.reason.added',
  consumed: 'mobile.item.reason.consumed',
  expired: 'mobile.item.reason.expired',
  corrected: 'mobile.item.reason.corrected',
  purchased: 'mobile.item.reason.purchased',
};

function foodIconItem(item: {
  label: string | null;
  ingredient: {
    canonicalNameEn: string;
    canonicalNameAr: string;
    category: Parameters<typeof FoodIcon>[0]['item']['category'];
  };
}) {
  return {
    label: item.label,
    nameEn: item.ingredient.canonicalNameEn,
    nameAr: item.ingredient.canonicalNameAr,
    category: item.ingredient.category,
  };
}

function FoodIconCircle({ item }: { item: Parameters<typeof foodIconItem>[0] }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: colors.surfaceAlt,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <FoodIcon item={foodIconItem(item)} size={52} />
    </View>
  );
}

function signedDelta(
  t: ReturnType<typeof useFormat>['t'],
  locale: ReturnType<typeof useFormat>['locale'],
  prefs: ReturnType<typeof useFormat>['prefs'],
  delta: number,
  unit: Unit,
): string {
  const sign = delta > 0 ? '+' : delta < 0 ? '−' : '';
  const measure = formatMeasure(t, locale, Math.abs(delta), unit, prefs);
  if (sign && locale === 'ar' && measure.startsWith('\u2066')) {
    return `\u2066${sign}${measure.slice('\u2066'.length)}`;
  }
  return `${sign}${measure}`;
}

export default function ItemDetail() {
  const { t, locale, prefs } = useFormat();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();

  // Fetched by id. Scanning the first page of the unfiltered list instead
  // meant anything past item #50 rendered as NOT_FOUND.
  const itemQuery = useInventoryItem(id ?? '');
  const locations = useLocations();
  const eventsQuery = useInventoryEvents();
  const item = itemQuery.data;

  const update = useUpdateInventoryItem(id ?? '');
  const remove = useDeleteInventoryItem();
  const adjust = useAdjustQuantity();

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [draftUnit, setDraftUnit] = useState<Unit | null>(null);
  const [draftLocation, setDraftLocation] = useState<string | null>(null);
  const [draftExpiry, setDraftExpiry] = useState<string | null>(null);
  const [draftBrand, setDraftBrand] = useState<string | null>(null);
  const [draftLabel, setDraftLabel] = useState<string | null>(null);
  const history = useMemo(
    () => (item ? itemHistory(eventsQuery.data ?? [], item.id) : []),
    [eventsQuery.data, item],
  );

  if (itemQuery.isLoading) {
    return (
      <Screen>
        <Header title={t('inventory.editItem')} onBack={() => router.back()} />
        <LoadingState />
      </Screen>
    );
  }
  if (itemQuery.isError) {
    return (
      <Screen>
        <Header title={t('inventory.editItem')} onBack={() => router.back()} />
        <ErrorState error={itemQuery.error} onRetry={() => void itemQuery.refetch()} />
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
  const brand = draftBrand ?? item.brand ?? '';
  const label = draftLabel ?? item.label ?? '';
  const name = itemName(locale, item);
  const location = (locations.data ?? []).find((loc) => loc.id === locationId);
  const locationText = location ? locationLabel(t, location) : t('common.loading');
  const expiryValid = isValidExpiryInput(expiresAt);
  const dirty =
    unit !== item.unit ||
    locationId !== item.locationId ||
    (brand.trim() || null) !== (item.brand ?? null) ||
    (label.trim() || null) !== (item.label ?? null) ||
    (expiresAt || null) !== (item.expiresAt ?? null);

  const onAdjust = (next: number) => {
    const delta = next - item.quantity;
    if (delta === 0) return;
    adjust.mutate({ itemId: item.id, delta, unit: item.unit, reason: 'corrected' });
  };
  const decrementQuantity = () => onAdjust(Math.max(0, item.quantity - 1));
  const incrementQuantity = () => onAdjust(item.quantity + 1);

  const save = () => {
    if (!expiryValid) return;
    update.mutate(
      {
        locationId,
        unit,
        brand: brand.trim() ? brand.trim() : null,
        // Empty means "no name of our own", which restores the catalog name —
        // the field is never left holding a blank the user cannot see.
        label: label.trim() ? label.trim() : null,
        expiresAt: expiresAt.trim() ? expiresAt.trim() : null,
      },
      {
        onSuccess: () => {
          setDraftUnit(null);
          setDraftLocation(null);
          setDraftExpiry(null);
          setDraftBrand(null);
          setDraftLabel(null);
          setDetailsOpen(false);
        },
      },
    );
  };

  const draftExpiryLabel = formatExpiryLabel(t, locale, expiresAt || null, prefs);
  const expiryText = draftExpiryLabel ?? t('mobile.capture.noExpiry');
  const quantityText = formatMeasure(t, locale, item.quantity, item.unit, prefs);
  const quantityAccessibility = `${t('inventory.quantity')} ${quantityText}`;
  const locationAccessibility = `${t('inventory.location')} ${locationText}`;
  const expiryAccessibility = `${t('inventory.expiryDate')} ${expiryText}`;
  const caption = item.brand ?? (item.label ? ingredientName(locale, item.ingredient) : null);

  return (
    <Screen scroll>
      <Header title={name} onBack={() => router.back()} />

      <Card style={{ gap: spacing.lg, borderRadius: radius.xl }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <FoodIconCircle item={item} />
          <View style={{ flex: 1 }}>
            <AppText variant="display">{name}</AppText>
            {caption ? (
              <AppText variant="caption" muted>
                {caption}
              </AppText>
            ) : null}
          </View>
        </View>

        <Bento>
          <Tile
            span={2}
            fill="surfaceAlt"
            height={MINI_TILE_HEIGHT}
            accessibilityRole="adjustable"
            accessibilityLabel={quantityAccessibility}
            actions={[
              { name: 'increment', label: t('mobile.common.increase'), onPress: incrementQuantity },
              { name: 'decrement', label: t('mobile.common.decrease'), onPress: decrementQuantity },
            ]}
          >
            <View style={{ gap: spacing.sm }}>
              <AppText variant="label" muted>
                {t('inventory.quantity')}
              </AppText>
              <QuantityStepper
                value={item.quantity}
                onChange={onAdjust}
                label={quantityText}
                accessibilityLabel={quantityAccessibility}
                accessible={false}
                decrementLabel={t('mobile.common.decrease')}
                incrementLabel={t('mobile.common.increase')}
              />
            </View>
          </Tile>
          <Tile
            fill="surfaceAlt"
            height={MINI_TILE_HEIGHT}
            accessibilityLabel={locationAccessibility}
            onPress={() => setDetailsOpen(true)}
          >
            <View style={{ gap: spacing.sm }}>
              <AppText variant="label" muted>
                {t('inventory.location')}
              </AppText>
              <Chip label={locationText} variant="tag" />
            </View>
          </Tile>
          <Tile
            fill="surfaceAlt"
            height={MINI_TILE_HEIGHT}
            weight={1.4}
            accessibilityLabel={expiryAccessibility}
            onPress={() => setDetailsOpen(true)}
          >
            <View style={{ gap: spacing.sm }}>
              <AppText variant="label" muted>
                {t('inventory.expiryDate')}
              </AppText>
              <Badge tone={EXPIRY_TONE[expiryStatus(expiresAt || null)]} label={expiryText} />
            </View>
          </Tile>
        </Bento>
      </Card>

      <View style={{ gap: spacing.sm }}>
        <SectionLabel>{t('mobile.item.history')}</SectionLabel>
        {eventsQuery.isLoading ? (
          <LoadingState compact />
        ) : eventsQuery.isError ? (
          <ErrorState
            compact
            error={eventsQuery.error}
            onRetry={() => void eventsQuery.refetch()}
          />
        ) : history.length === 0 ? (
          <Card style={{ padding: spacing.md }}>
            <AppText muted>{t('mobile.item.historyEmpty')}</AppText>
          </Card>
        ) : (
          <ListGroup>
            {history.map((event) => (
              <ListRow
                key={event.id}
                grouped
                icon={event.delta >= 0 ? 'plus' : 'minus'}
                title={t(REASON_KEY[event.reason])}
                subtitle={signedDelta(t, locale, prefs, event.delta, event.unit)}
                value={formatDateL(locale, event.createdAt, {
                  month: 'short',
                  day: 'numeric',
                })}
                accessibilityLabel={`${t(REASON_KEY[event.reason])}, ${signedDelta(
                  t,
                  locale,
                  prefs,
                  event.delta,
                  event.unit,
                )}`}
              />
            ))}
          </ListGroup>
        )}
      </View>

      <ProductReview itemId={item.id} locale={locale} t={t} />

      <Button
        title={t('inventory.deleteItem')}
        variant="danger"
        icon="trash"
        onPress={() => setConfirmDelete(true)}
      />

      <Sheet
        visible={detailsOpen}
        onClose={() => setDetailsOpen(false)}
        title={t('inventory.editItem')}
      >
        <View style={{ gap: spacing.xs }}>
          <AppText variant="label" muted>
            {t('inventory.location')}
          </AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            {(locations.data ?? []).map((loc) => (
              <Chip
                key={loc.id}
                label={locationLabel(t, loc)}
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
              <Chip
                key={u}
                label={unitLabel(t, u)}
                selected={unit === u}
                onPress={() => setDraftUnit(u)}
              />
            ))}
          </View>
        </View>

        <View style={{ gap: spacing.xs }}>
          <Field
            label={t('mobile.item.nameLabel')}
            value={label}
            onChangeText={setDraftLabel}
            placeholder={ingredientName(locale, item.ingredient)}
            maxLength={120}
            autoCapitalize="words"
            autoCorrect={false}
          />
          {/*
            The catalog name is a global row shared by every household, so this
            renames the item and nothing else — worth saying, because "rename"
            otherwise reads as editing the dictionary.
          */}
          <AppText variant="caption" muted>
            {t('mobile.item.nameHint')}
          </AppText>
          {item.label ? (
            <Button
              title={t('mobile.item.resetName')}
              variant="ghost"
              onPress={() => setDraftLabel('')}
            />
          ) : null}
        </View>

        <Field
          label={t('inventory.brand')}
          value={brand}
          onChangeText={setDraftBrand}
          maxLength={120}
          autoCapitalize="words"
          autoCorrect={false}
        />

        <DateField
          label={t('inventory.expiryDate')}
          value={expiresAt || null}
          onChange={(next) => setDraftExpiry(next ?? '')}
          placeholder={t('mobile.capture.noExpiry')}
          clearLabel={t('mobile.capture.clearDate')}
          doneLabel={t('mobile.capture.pickDate')}
        />

        <Button
          title={t('common.save')}
          icon="check"
          disabled={!dirty || !expiryValid}
          loading={update.isPending}
          onPress={save}
        />
        {update.isError ? (
          <AppText variant="caption" style={{ color: colors.danger }}>
            {t(errorMessageKey(update.error))}
          </AppText>
        ) : null}
      </Sheet>

      <Sheet
        visible={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={t('inventory.deleteItem')}
      >
        <AppText muted>{itemName(locale, item)}</AppText>
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
        <Button
          title={t('common.cancel')}
          variant="ghost"
          onPress={() => setConfirmDelete(false)}
        />
      </Sheet>
    </Screen>
  );
}
