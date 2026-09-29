function orderedVisibleText(parts: readonly (string | null | undefined | false)[]): string {
  return parts
    .filter((part): part is string => typeof part === 'string' && part.length > 0)
    .join(', ');
}

export function assistantHeaderAccessibilityLabel({
  name,
  demoLabel,
  subtitle,
  status,
}: {
  name: string;
  demoLabel?: string | null;
  subtitle: string;
  status?: string | null;
}): string {
  return orderedVisibleText([name, demoLabel, status ? `${subtitle} · ${status}` : subtitle]);
}

export function assistantModeAccessibilityLabel({
  title,
  subtitle,
  selectedLabel,
}: {
  title: string;
  subtitle: string;
  selectedLabel?: string | null;
}): string {
  return orderedVisibleText([title, subtitle, selectedLabel]);
}

export function assistantDetectionAccessibilityLabel({
  label,
  confidenceLabel,
}: {
  label: string;
  confidenceLabel?: string | null;
}): string {
  if (confidenceLabel && label.includes(confidenceLabel)) return label;
  return orderedVisibleText([label, confidenceLabel]);
}

export function assistantPausedTextAccessibilityLabel({
  title,
  body,
}: {
  title: string;
  body: string;
}): string {
  return orderedVisibleText([title, body]);
}
