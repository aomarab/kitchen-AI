import type { Translator } from '@kitchen/i18n';

export interface ExpiryInfo {
  label: string;
  tone: 'neutral' | 'warning' | 'danger' | 'success';
  days: number | null;
}

/** Whole days between today and an ISO date (YYYY-MM-DD). Negative = past. */
export function daysUntil(isoDate: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(`${isoDate}T00:00:00`);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

/** Localized expiry label + severity tone for an inventory item. */
export function expiryInfo(expiresAt: string | null, t: Translator): ExpiryInfo {
  if (!expiresAt) return { label: '—', tone: 'neutral', days: null };
  const days = daysUntil(expiresAt);
  if (days < 0) return { label: t('inventory.expired'), tone: 'danger', days };
  if (days === 0) return { label: t('inventory.expiresToday'), tone: 'danger', days };
  return {
    label: t('inventory.expiresIn', { days }),
    tone: days <= 3 ? 'warning' : 'success',
    days,
  };
}
