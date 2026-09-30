import type { Ingredient, StorageLocation } from '@kitchen/contracts';
import type { MessageKey } from '@kitchen/i18n';
import { daysUntilExpiry, expiryStatus } from './expiry';
import { isLowConfidence, type ReviewRow } from './capture';
import { uuidv4 } from './uuid';

export type ReviewExpiryTone = 'warn' | 'success' | 'danger' | 'muted';

export interface ReviewExpiryPhrase {
  key: MessageKey;
  count?: number;
  tone: ReviewExpiryTone;
}

export function needsAnswer(
  row: Pick<ReviewRow, 'confidence' | 'tempId'>,
  answered: ReadonlySet<string>,
): boolean {
  return isLowConfidence(row.confidence) && !answered.has(row.tempId);
}

export function unansweredCount(rows: readonly ReviewRow[], answered: ReadonlySet<string>): number {
  return rows.filter((row) => row.include && needsAnswer(row, answered)).length;
}

export function isNewReviewRow(row: ReviewRow): boolean {
  return !row.ingredientId && row.nameEn === '' && row.nameAr === '' && row.rawName === '';
}

export function hasValidIngredientSelection(term: string, selectedLabel: string | null): boolean {
  return !!selectedLabel && term.trim() === selectedLabel.trim();
}

export function applyIngredient(
  row: ReviewRow,
  ingredient: Ingredient,
  options: { unitTouched: boolean },
): ReviewRow {
  const shouldUseDefaultUnit = isNewReviewRow(row) || !options.unitTouched;
  return {
    ...row,
    ingredientId: ingredient.id,
    nameEn: ingredient.canonicalNameEn,
    nameAr: ingredient.canonicalNameAr,
    category: ingredient.category,
    rawName: ingredient.canonicalNameEn,
    unit: shouldUseDefaultUnit ? ingredient.defaultUnit : row.unit,
  };
}

export function newReviewRow(locations: readonly StorageLocation[]): ReviewRow {
  return {
    tempId: `review-${uuidv4()}`,
    nameEn: '',
    nameAr: '',
    ingredientId: null,
    rawName: '',
    quantity: 1,
    unit: 'piece',
    locationId: locations[0]?.id ?? '',
    expiresAt: null,
    confidence: 1,
    photoKey: null,
    category: 'other',
    include: true,
  };
}

export function expiryPhrase(expiresAt: string | null, now: Date = new Date()): ReviewExpiryPhrase {
  const status = expiryStatus(expiresAt, now);
  const days = daysUntilExpiry(expiresAt, now);

  if (status === 'none') return { key: 'mobile.capture.noExpiry', tone: 'muted' };
  if (status === 'expired') return { key: 'inventory.expired', tone: 'danger' };
  if (status === 'today' || status === 'soon') {
    return { key: 'mobile.review.useIn', count: Math.max(days ?? 0, 0), tone: 'warn' };
  }

  const safeDays = Math.max(days ?? 0, 0);
  if (safeDays >= 14) {
    return {
      key: 'mobile.review.goodForWeeks',
      count: Math.max(1, Math.round(safeDays / 7)),
      tone: 'success',
    };
  }
  return { key: 'mobile.review.goodForDays', count: safeDays, tone: 'success' };
}

export function reviewHeadlineCount(rows: readonly Pick<ReviewRow, 'include'>[]): number {
  return rows.filter((row) => row.include).length;
}

export function focusIndex(
  rows: readonly Pick<ReviewRow, 'tempId' | 'include'>[],
  focus: string | undefined,
): number {
  if (!focus) return -1;
  return rows.filter((row) => row.include).findIndex((row) => row.tempId === focus);
}

export function reviewScrollTarget(bentoY: number, rowY: number): number {
  return Math.max(0, bentoY + rowY);
}
