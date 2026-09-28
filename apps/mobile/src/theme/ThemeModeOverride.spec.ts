import { describe, expect, it } from 'vitest';
import { resolveThemeMode } from './index';
import { themeModeWithOverride } from './ThemeModeOverride';

describe('themeModeWithOverride', () => {
  it('lets a scoped dark override win over a pinned light preference', () => {
    const fallback = resolveThemeMode('light', 'light');
    expect(themeModeWithOverride(fallback, 'dark')).toBe('dark');
  });

  it('lets a scoped light override win over the system preference', () => {
    const fallback = resolveThemeMode('system', 'dark');
    expect(themeModeWithOverride(fallback, 'light')).toBe('light');
  });

  it('keeps the existing resolved mode when no override is mounted', () => {
    expect(themeModeWithOverride(resolveThemeMode('system', 'dark'), null)).toBe('dark');
    expect(themeModeWithOverride(resolveThemeMode('system', 'light'), null)).toBe('light');
  });
});
