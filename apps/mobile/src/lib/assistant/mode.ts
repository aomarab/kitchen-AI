export type AssistantMode = 'text' | 'voice' | 'live';

export const ASSISTANT_MODES: readonly AssistantMode[] = ['text', 'voice', 'live'];

/**
 * The `/assistant?mode=` route param, narrowed. Anything unrecognised opens
 * text chat — the only mode that needs no microphone or camera permission — so
 * a stale or hand-typed link can never land the user in a permission prompt.
 */
export function assistantModeFromParam(value: string | string[] | undefined): AssistantMode {
  const raw = Array.isArray(value) ? value[0] : value;
  return ASSISTANT_MODES.find((mode) => mode === raw) ?? 'text';
}
