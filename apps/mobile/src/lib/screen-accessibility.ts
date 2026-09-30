export function visibleTextAccessibilityLabel(
  parts: readonly (string | null | undefined | false)[],
): string {
  return parts
    .map((part) => (typeof part === 'string' ? part.trim() : ''))
    .filter((part): part is string => part.length > 0)
    .join(', ');
}

export function timerCardAccessibilityLabel({
  primary,
  caption,
  action,
}: {
  primary: string;
  caption: string;
  action?: string | null;
}): string {
  return visibleTextAccessibilityLabel([primary, caption, action]);
}

export function wellnessNudgeAccessibilityLabel({
  body,
  status,
}: {
  body: string;
  status: string;
}): string {
  return visibleTextAccessibilityLabel([body, status]);
}

export function kioskCardAccessibilityLabel(
  parts: readonly (string | null | undefined | false)[],
): string {
  return visibleTextAccessibilityLabel(parts);
}
