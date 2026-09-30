import { useMemo } from 'react';
import { useColorScheme, type StyleSheet } from 'react-native';
import { resolveThemeMode, shadowFor, themeModeWithOverride, type Shadow } from './index';
import { paletteFor, type Palette, type Scrim, type ThemeMode } from './palettes';
import { useSettingsStore } from '../stores/settings';
import { useThemeModeOverride } from './ThemeModeOverride';

export interface Theme {
  readonly colors: Palette['colors'];
  readonly scrim: Scrim;
  readonly shadow: Shadow;
  readonly mode: ThemeMode;
  readonly isDark: boolean;
}

/**
 * The active palette. The persisted preference lives in the settings store, and
 * a scoped override can force a subtree without writing that preference.
 */
export function useTheme(): Theme {
  const preference = useSettingsStore((state) => state.themePreference);
  const system = useColorScheme();
  const override = useThemeModeOverride();
  const mode: ThemeMode = themeModeWithOverride(resolveThemeMode(preference, system), override);

  return useMemo(() => {
    const palette = paletteFor(mode);
    return {
      colors: palette.colors,
      scrim: palette.scrim,
      shadow: shadowFor(palette),
      mode,
      isDark: mode === 'dark',
    };
  }, [mode]);
}

/**
 * Builds a stylesheet from the active palette and rebuilds it only when the
 * palette changes.
 *
 * Every screen used to call `StyleSheet.create` at module scope, which is no
 * longer possible: a module-scope sheet captures whichever palette was loaded
 * first and then never updates, so a theme switch would repaint some of the
 * screen and leave the rest behind. Passing the factory through here keeps the
 * one-sheet-per-file shape while making the dependency on the palette explicit.
 *
 * The factory must be defined at module scope (a stable reference), or the memo
 * has nothing to hold on to and the sheet is rebuilt on every render.
 */
export function useStyles<T extends StyleSheet.NamedStyles<T>>(factory: (theme: Theme) => T): T {
  const theme = useTheme();
  return useMemo(() => factory(theme), [factory, theme]);
}
