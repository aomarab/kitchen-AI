import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { InventoryEventReason, Unit } from '@kitchen/contracts';
import type { MessageKey } from '@kitchen/i18n';
import {
  AppText,
  Badge,
  Button,
  Chip,
  DateField,
  EmptyState,
  ErrorState,
  Field,
  FoodIcon,
  Header,
  Icon,
  IconButton,
  ListRow,
  LoadingState,
  QuantityStepper,
  Screen,
  Sheet,
  type IconName,
} from '../../components';
import { useFormat } from '../../hooks/useFormat';
import {
  useAdjustQuantity,
  useDeleteInventoryItem,
  useInventoryEvents,
  useInventoryItem,
  useLocations,
  useUpdateInventoryItem,
} from '../../hooks/inventory';
import {
  formatDateL,
  formatExpiryLabel,
  formatMeasure,
  formatQty,
  itemName,
  locationLabel,
  unitLabel,
} from '../../lib/format';
import { isValidExpiryInput } from '../../lib/expiry';
import { errorMessageKey } from '../../lib/errors';
import { itemHistory } from '../../lib/inventory-history';
import {
  inventoryItemRowBadge,
  inventoryItemRowFoodIcon,
  inventoryItemRowWhen,
} from '../../lib/inventory-row';
import { ProductReview } from '../../features/inventory/ProductReview';
import { spacing } from '../../theme';
import { useTheme } from '../../theme/useTheme';

const COMMON_UNITS: Unit[] = ['piece', 'g', 'kg', 'ml', 'l', 'bunch', 'can', 'packet'];
const ITEM_DETAIL_MIN_TOUCH_TARGET = 44;

const REASON_KEY: Record<InventoryEventReason, MessageKey> = {
  added: 'mobile.item.reason.added',
  consumed: 'mobile.item.reason.consumed',
  expired: 'mobile.item.reason.expired',
  corrected: 'mobile.item.reason.corrected',
  purchased: 'mobile.item.reason.purchased',
};

function foodIconItem(item: {
  label: string | null;
  ingredient: Parameters<typeof inventoryItemRowFoodIcon>[0]['ingredient'];
  quantity: number;
  unit: Unit;
  expiresAt: string | null;
}) {
  return inventoryItemRowFoodIcon(item);
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

function historyIcon(reason: InventoryEventReason, delta: number): IconName {
  if (reason === 'corrected') return 'pencil';
  return delta >= 0 ? 'plus' : 'minus';
}

function HistoryIcon({ icon }: { icon: IconName }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        width: 36,
        height: 36,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.surfaceAlt,
      }}
    >
      <Icon name={icon} size={18} color={colors.text} />
    </View>
  );
}

function ItemFooter({ onDelete, onEdit }: { onDelete: () => void; onEdit: () => void }) {
  const { t } = useFormat();
  return (
    <View style={{ flexDirection: 'row', gap: spacing.md }}>
      <Button
        title={t('inventory.deleteItem')}
        variant="ghost"
        tone="danger"
        fullWidth
        style={{ flex: 1, minHeight: ITEM_DETAIL_MIN_TOUCH_TARGET }}
        onPress={onDelete}
      />
      <Button
        title={t('inventory.editItem')}
        variant="secondary"
        fullWidth
        style={{ flex: 1, minHeight: ITEM_DETAIL_MIN_TOUCH_TARGET }}
        onPress={onEdit}
      />
    </View>
  );
}

export default function ItemDetail() {
  const { t, locale, prefs } = useFormat();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();

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
  const now = useMemo(() => new Date(), []);
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
        <EmptyState illustration="pantry" title={t('errors.NOT_FOUND')} />
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

  const save = () => {
    if (!expiryValid) return;
    update.mutate(
      {
        locationId,
        unit,
        brand: brand.trim() ? brand.trim() : null,
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
  const expiryText = draftExpiryLabel ?? t('mobile.home.freshNone');
  const quantityText = formatMeasure(t, locale, item.quantity, item.unit, prefs);
  const quantityValueText = formatQty(locale, item.quantity, prefs);
  const quantityAccessibility = `${t('inventory.quantity')} ${quantityText}`;
  const locationAccessibility = `${t('inventory.location')} ${locationText}`;
  const expiryAccessibility = `${t('inventory.expiryDate')} ${expiryText}`;
  const brandText = item.brand ?? t('mobile.productReview.unbranded');
  const itemBadge = inventoryItemRowBadge(t, item, now);
  const itemWhen = inventoryItemRowWhen(t, locale, item, prefs, now);

  return (
    <Screen
      scroll
      footer={
        <ItemFooter onDelete={() => setConfirmDelete(true)} onEdit={() => setDetailsOpen(true)} />
      }
    >
      <Header
        title=""
        onBack={() => router.back()}
        trailing={
          <IconButton
            icon="pencil"
            tone="plain"
            accessibilityLabel={t('inventory.editItem')}
            onPress={() => setDetailsOpen(true)}
          />
        }
      />

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg }}>
        <FoodIcon item={foodIconItem(item)} size={72} />
        <View style={{ flex: 1, gap: spacing.xs }}>
          <AppText variant="display" accessibilityRole="header">
            {name}
          </AppText>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            {itemBadge ? <Badge tone={itemBadge.tone} label={itemBadge.label} /> : null}
            {itemWhen ? (
              <AppText variant="caption" muted>
                {itemWhen}
              </AppText>
            ) : null}
          </View>
        </View>
      </View>

      <View>
        <ListRow
          title={t('inventory.quantity')}
          trailing={
            <QuantityStepper
              value={item.quantity}
              onChange={onAdjust}
              label={quantityValueText}
              unit={unitLabel(t, item.unit)}
              accessibilityLabel={quantityAccessibility}
              decrementLabel={t('mobile.common.decrease')}
              incrementLabel={t('mobile.common.increase')}
            />
          }
        />
        <ListRow
          title={t('inventory.brand')}
          value={brandText}
          accessibilityLabel={`${t('inventory.brand')} ${brandText}`}
          onPress={() => setDetailsOpen(true)}
          showChevron
        />
        <ListRow
          title={t('inventory.location')}
          value={locationText}
          accessibilityLabel={locationAccessibility}
          onPress={() => setDetailsOpen(true)}
          showChevron
        />
        <ListRow
          title={t('inventory.expiryDate')}
          value={expiryText}
          accessibilityLabel={expiryAccessibility}
          onPress={() => setDetailsOpen(true)}
          showChevron
        />
      </View>

      <View style={{ gap: spacing.sm }}>
        <AppText variant="heading" accessibilityRole="header">
          {t('mobile.item.history')}
        </AppText>
        {eventsQuery.isLoading ? (
          <LoadingState compact />
        ) : eventsQuery.isError ? (
          <ErrorState
            compact
            error={eventsQuery.error}
            onRetry={() => void eventsQuery.refetch()}
          />
        ) : history.length === 0 ? (
          <AppText variant="body" muted>
            {t('mobile.item.historyEmpty')}
          </AppText>
        ) : (
          <View>
            {history.map((event) => {
              const delta = signedDelta(t, locale, prefs, event.delta, event.unit);
              const reason = t(REASON_KEY[event.reason]);
              return (
                <ListRow
                  key={event.id}
                  leading={<HistoryIcon icon={historyIcon(event.reason, event.delta)} />}
                  title={`${reason} · ${delta}`}
                  value={formatDateL(locale, event.createdAt, {
                    month: 'short',
                    day: 'numeric',
                  })}
                  accessibilityLabel={`${reason}, ${delta}`}
                />
              );
            })}
          </View>
        )}
      </View>

      <ProductReview itemId={item.id} locale={locale} t={t} />

      <Sheet
        visible={detailsOpen}
        onClose={() => setDetailsOpen(false)}
        title={t('inventory.editItem')}
      >
        <View style={{ gap: spacing.xs }}>
          <Field
            label={t('mobile.item.nameLabel')}
            value={label}
            onChangeText={setDraftLabel}
            placeholder={t('mobile.item.namePlaceholder')}
            hint={t('mobile.item.nameHint')}
            maxLength={120}
            autoCapitalize="words"
            autoCorrect={false}
          />
          <View style={{ alignItems: 'flex-end' }}>
            <Button
              title={t('mobile.item.resetName')}
              variant="ghost"
              fullWidth={false}
              disabled={!item.label && label.length === 0}
              onPress={() => setDraftLabel('')}
            />
          </View>
        </View>

        <View style={{ gap: spacing.xs }}>
          <AppText variant="label">{t('inventory.unit')}</AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            {COMMON_UNITS.map((option) => (
              <Chip
                key={option}
                label={unitLabel(t, option)}
                selected={unit === option}
                onPress={() => setDraftUnit(option)}
              />
            ))}
          </View>
        </View>

        <Field
          label={t('inventory.brand')}
          value={brand}
          onChangeText={setDraftBrand}
          maxLength={120}
          autoCapitalize="words"
          autoCorrect={false}
        />

        <View style={{ gap: spacing.xs }}>
          <AppText variant="label">{t('inventory.location')}</AppText>
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
          variant="destructive"
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
