export function visibleTextLabel(parts: readonly (string | null | undefined)[]): string {
  return parts
    .map((part) => part?.trim())
    .filter((part): part is string => !!part)
    .join(', ');
}

export function accountProfileAccessibilityLabel({
  name,
  email,
}: {
  name: string;
  email?: string | null;
}): string {
  return visibleTextLabel([name, email]);
}

export function assistantPersonaAccessibilityLabel({
  name,
  dialect,
  description,
  selectedLabel,
}: {
  name: string;
  dialect: string;
  description: string;
  selectedLabel?: string | null;
}): string {
  return visibleTextLabel([name, dialect, description, selectedLabel]);
}
