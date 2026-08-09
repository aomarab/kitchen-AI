import type {
  InventoryItemInput,
  RecognitionSession,
  StorageLocation,
  StorageLocationType,
  Unit,
} from '@kitchen/contracts';
import type { CaptureSource } from '../stores/capture';

/**
 * Capture-review logic, kept pure so the "never auto-commit" guarantee is unit
 * testable. A recognition session is turned into editable {@link ReviewRow}s;
 * only rows the user keeps (`include: true`) become inventory inputs, and that
 * only happens when a screen explicitly calls {@link buildInventoryInputs} from
 * a confirm action (spec §5.1).
 */

/** Rows at or below this confidence are visibly flagged for the user to check. */
export const LOW_CONFIDENCE = 0.6;

export interface ReviewRow {
  tempId: string;
  nameEn: string;
  nameAr: string;
  ingredientId: string | null;
  rawName: string;
  quantity: number;
  unit: Unit;
  locationId: string;
  expiresAt: string | null;
  confidence: number;
  photoKey: string | null;
  include: boolean;
}

export function isLowConfidence(confidence: number): boolean {
  return confidence < LOW_CONFIDENCE;
}

/** Resolve the storage location whose type matches, else the first location. */
export function pickLocationForType(
  locations: readonly StorageLocation[],
  type: StorageLocationType,
): string {
  const byType = locations.find((l) => l.type === type);
  return (byType ?? locations[0])?.id ?? '';
}

export function initialReviewRows(
  session: RecognitionSession,
  locations: readonly StorageLocation[],
): ReviewRow[] {
  return session.items.map((item) => ({
    tempId: item.tempId,
    nameEn: item.nameEn,
    nameAr: item.nameAr,
    ingredientId: item.match.ingredientId,
    rawName: item.match.rawName || item.nameEn,
    quantity: item.quantity,
    unit: item.unit,
    locationId: pickLocationForType(locations, item.suggestedLocationType),
    expiresAt: item.suggestedExpiresAt,
    confidence: item.confidence,
    photoKey: item.photoKey,
    include: true,
  }));
}

/** Included rows only — the sole path from a review into inventory. */
export function buildInventoryInputs(
  rows: readonly ReviewRow[],
  source: CaptureSource,
): InventoryItemInput[] {
  return rows
    .filter((row) => row.include && row.locationId !== '')
    .map((row) => ({
      ingredientId: row.ingredientId,
      rawName: row.ingredientId ? undefined : row.rawName,
      // Recognition returns both names. Sending only one makes the API file it
      // under both languages in the globally shared ingredient catalog.
      rawNameAr: row.ingredientId ? undefined : row.nameAr,
      locationId: row.locationId,
      quantity: row.quantity,
      unit: row.unit,
      expiresAt: row.expiresAt,
      source,
      confidence: row.confidence,
      photoKey: row.photoKey,
    }));
}

export function includedCount(rows: readonly ReviewRow[]): number {
  return rows.filter((row) => row.include && row.locationId !== '').length;
}
