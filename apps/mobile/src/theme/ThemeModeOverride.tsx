import { createContext, useContext, type ReactNode } from 'react';
import type { ThemeMode } from './palettes';

const ThemeModeOverrideContext = createContext<ThemeMode | null>(null);

export interface ThemeModeOverrideProps {
  mode: ThemeMode;
  children: ReactNode;
}

export function ThemeModeOverride({ mode, children }: ThemeModeOverrideProps) {
  return (
    <ThemeModeOverrideContext.Provider value={mode}>{children}</ThemeModeOverrideContext.Provider>
  );
}

export function useThemeModeOverride(): ThemeMode | null {
  return useContext(ThemeModeOverrideContext);
}

export function themeModeWithOverride(fallback: ThemeMode, override: ThemeMode | null): ThemeMode {
  return override ?? fallback;
}
