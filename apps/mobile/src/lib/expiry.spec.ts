import { describe, expect, it } from 'vitest';
import {
  byExpiryUrgency,
  daysUntilExpiry,
  expiryStatus,
  isExpiringSoon,
  todayISODate,
} from '../lib/expiry';

const NOW = new Date('2026-07-26T12:00:00');

describe('daysUntilExpiry', () => {
  it('returns null without a date', () => {
    expect(daysUntilExpiry(null, NOW)).toBeNull();
  });
  it('is 0 for today regardless of the hour', () => {
    expect(daysUntilExpiry('2026-07-26', NOW)).toBe(0);
  });
  it('is negative once expired', () => {
    expect(daysUntilExpiry('2026-07-24', NOW)).toBe(-2);
  });
  it('counts whole calendar days ahead', () => {
    expect(daysUntilExpiry('2026-07-29', NOW)).toBe(3);
  });
});

describe('expiryStatus', () => {
  it('classifies each band', () => {
    expect(expiryStatus(null, NOW)).toBe('none');
    expect(expiryStatus('2026-07-24', NOW)).toBe('expired');
    expect(expiryStatus('2026-07-26', NOW)).toBe('today');
    expect(expiryStatus('2026-07-28', NOW)).toBe('soon');
    expect(expiryStatus('2026-08-30', NOW)).toBe('ok');
  });
});

describe('isExpiringSoon', () => {
  it('is true through the soon window and false beyond it', () => {
    expect(isExpiringSoon('2026-07-28', NOW)).toBe(true);
    expect(isExpiringSoon('2026-08-30', NOW)).toBe(false);
    expect(isExpiringSoon(null, NOW)).toBe(false);
  });
});

describe('todayISODate', () => {
  it('formats local calendar date, not UTC', () => {
    expect(todayISODate(NOW)).toBe('2026-07-26');
  });
});

describe('byExpiryUrgency', () => {
  it('sorts most urgent first and undated last', () => {
    const items = [
      { expiresAt: null },
      { expiresAt: '2026-07-29' },
      { expiresAt: '2026-07-24' },
    ];
    const sorted = [...items].sort((a, b) => byExpiryUrgency(a, b, NOW));
    expect(sorted.map((i) => i.expiresAt)).toEqual(['2026-07-24', '2026-07-29', null]);
  });
});
