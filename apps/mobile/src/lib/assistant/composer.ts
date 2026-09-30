export type ComposerMode = 'text' | 'voice' | 'live';
export type ComposerAction = 'send' | 'sendDisabled' | 'mic' | 'micMuted';

export interface ComposerActionInput {
  mode: ComposerMode;
  draft: string;
  micMuted: boolean;
}

export function composerAction({ mode, draft, micMuted }: ComposerActionInput): ComposerAction {
  if (draft.trim().length > 0) return 'send';
  if (mode === 'voice') return micMuted ? 'micMuted' : 'mic';
  return 'sendDisabled';
}
