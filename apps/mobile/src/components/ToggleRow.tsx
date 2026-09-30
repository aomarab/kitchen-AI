import { Toggle } from './Toggle';
import { ListRow } from './ListRow';

export const TOGGLE_ROW_MIN_HEIGHT = 56;

export interface ToggleRowProps {
  label: string;
  hint?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
}

/** Labelled switch row used across Settings. */
export function ToggleRow({ label, hint, value, onValueChange }: ToggleRowProps) {
  return (
    <ListRow
      title={label}
      subtitle={hint}
      trailing={<Toggle value={value} onValueChange={onValueChange} accessibilityLabel={label} />}
      style={{ minHeight: TOGGLE_ROW_MIN_HEIGHT }}
    />
  );
}
