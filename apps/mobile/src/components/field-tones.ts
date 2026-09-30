import type { ColorToken } from '../theme';

export type FieldBorderColorToken = Extract<ColorToken, 'border' | 'primary' | 'danger'>;

export interface FieldBorderState {
  focused: boolean;
  error?: string | null;
}

export interface FieldBorderTone {
  width: 1 | 2;
  colorToken: FieldBorderColorToken;
}

export function fieldBorder({ focused, error }: FieldBorderState): FieldBorderTone {
  if (error) return { width: focused ? 2 : 1, colorToken: 'danger' };
  if (focused) return { width: 2, colorToken: 'primary' };
  return { width: 1, colorToken: 'border' };
}
