import type { ColorToken } from '../theme';

export type FieldBorderColorToken = Extract<ColorToken, 'border' | 'text' | 'danger'>;

export interface FieldBorderState {
  focused: boolean;
  error?: string | null;
}

export interface FieldBorderTone {
  width: 1 | 1.5;
  colorToken: FieldBorderColorToken;
}

export function fieldBorder({ focused, error }: FieldBorderState): FieldBorderTone {
  if (error) return { width: 1.5, colorToken: 'danger' };
  if (focused) return { width: 1.5, colorToken: 'text' };
  return { width: 1, colorToken: 'border' };
}

export interface TextareaCountState {
  multiline?: boolean;
  maxLength?: number;
  text: string;
}

export function textareaCountLabel({
  multiline,
  maxLength,
  text,
}: TextareaCountState): string | null {
  if (!multiline || typeof maxLength !== 'number') return null;
  return `${text.length}/${maxLength}`;
}
