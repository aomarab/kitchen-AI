import type {
  InventoryItem,
  ListInventoryQuery,
  StorageLocation,
  StorageLocationType,
} from '@kitchen/contracts';
import type { MessageKey, Translator } from '@kitchen/i18n';
import type { BadgeTone } from '../components/Badge';
import type { IllustrationName } from '../components/glyphs/illustration-paths';
import { byExpiryUrgency, expiryStatus, isExpiringSoon, type ExpiryStatus } from './expiry';
import { isSeededLocationName, locationLabel } from './format';
import type { TintName } from '../theme';

export type KitchenSort = NonNullable<ListInventoryQuery['sort']>;
export type KitchenSection = 'justAdded';

export interface RankedPlace {
  readonly location: StorageLocation;
  readonly count: number;
  readonly soon: number;
}

export const EXPIRY_TONE: Record<ExpiryStatus, BadgeTone> = {
  expired: 'danger',
  today: 'danger',
  soon: 'warn',
  ok: 'success',
  none: 'muted',
};

const SORTS = new Set<KitchenSort>(['expiry', 'name', 'recent']);
const PLACE_TINTS: readonly Extract<TintName, 'butter' | 'sage' | 'apricot'>[] = [
  'butter',
  'sage',
  'apricot',
];

export function rankPlaces(
  items: readonly Pick<InventoryItem, 'locationId' | 'expiresAt'>[],
  locations: readonly StorageLocation[],
  labelOf: (location: StorageLocation) => string,
  now: Date = new Date(),
): RankedPlace[] {
  const known = new Set(locations.map((location) => location.id));
  const counts = new Map<string, { count: number; soon: number }>();

  for (const item of items) {
    if (!known.has(item.locationId)) continue;
    const current = counts.get(item.locationId) ?? { count: 0, soon: 0 };
    counts.set(item.locationId, {
      count: current.count + 1,
      soon: current.soon + (isExpiringSoon(item.expiresAt, now) ? 1 : 0),
    });
  }

  return locations
    .map((location) => ({
      location,
      count: counts.get(location.id)?.count ?? 0,
      soon: counts.get(location.id)?.soon ?? 0,
    }))
    .sort(
      (a, b) =>
        b.count - a.count ||
        labelOf(a.location).localeCompare(labelOf(b.location)) ||
        a.location.id.localeCompare(b.location.id),
    );
}

export function placeTint(rank: number): Extract<TintName, 'butter' | 'sage' | 'apricot'> {
  const index = ((Math.trunc(rank) % PLACE_TINTS.length) + PLACE_TINTS.length) % PLACE_TINTS.length;
  return PLACE_TINTS[index]!;
}

export function placeIllustration(type: StorageLocationType): IllustrationName {
  if (type === 'spice_rack') return 'spicerack';
  if (type === 'fridge' || type === 'freezer' || type === 'pantry') return type;
  return 'pantry';
}

export function useFirst<T extends Pick<InventoryItem, 'expiresAt'>>(
  items: readonly T[],
  now: Date = new Date(),
): T[] {
  return [...items]
    .filter((item) => {
      const status = expiryStatus(item.expiresAt, now);
      return status === 'expired' || status === 'today' || status === 'soon';
    })
    .sort((a, b) => byExpiryUrgency(a, b, now))
    .slice(0, 6);
}

export function justAdded<T extends Pick<InventoryItem, 'createdAt' | 'id'>>(
  items: readonly T[],
): T[] {
  return [...items]
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || a.id.localeCompare(b.id))
    .slice(0, 6);
}

export function parseSort(value: unknown): KitchenSort | undefined {
  return typeof value === 'string' && SORTS.has(value as KitchenSort)
    ? (value as KitchenSort)
    : undefined;
}

export function parseSection(value: unknown): KitchenSection | undefined {
  return value === 'justAdded' ? 'justAdded' : undefined;
}

export function placeCaption(t: Translator, location: StorageLocation): string {
  if (isSeededLocationName(location)) {
    return t(`mobile.kitchen.inType.${location.type}` as MessageKey);
  }
  return t('mobile.kitchen.inPlace', { place: locationLabel(t, location) });
}

export function sentenceCase(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  return `${trimmed.slice(0, 1).toLocaleUpperCase()}${trimmed.slice(1)}`;
}

export function countMessage(
  t: Translator,
  key: MessageKey,
  count: number,
  formattedCount: string,
  extra?: Record<string, string | number>,
): string {
  return t(key, { ...(extra ?? {}), count }).replace(String(count), formattedCount);
}

export function placeAccessibilityLabel({
  t,
  caption,
  count,
  formattedCount,
  soon,
  formattedSoon,
}: {
  t: Translator;
  caption: string;
  count: number;
  formattedCount: string;
  soon: number;
  formattedSoon: string;
}): string {
  const base = countMessage(t, 'mobile.kitchen.placeLabel', count, formattedCount, {
    place: sentenceCase(caption),
  });
  if (soon <= 0) return base;
  return `${base}, ${countMessage(t, 'mobile.kitchen.placeSoon', soon, formattedSoon)}`;
}
