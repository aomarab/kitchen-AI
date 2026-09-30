import type { RecognitionSession } from '@kitchen/contracts';
import { isNothingFound } from './capture-error';
import type { CaptureSource } from '../stores/capture';

export type CaptureFlowState = 'framing' | 'shot' | 'looking' | 'result' | 'nothingFound';

export interface CaptureFlowInput {
  mode: CaptureSource;
  photoCount: number;
  busy: boolean;
  session: RecognitionSession | null;
  lastError?: unknown;
}

/** Pure state derivation for the capture surface; rendering stays a consequence of this. */
export function deriveCaptureFlowState({
  mode,
  photoCount,
  busy,
  session,
  lastError,
}: CaptureFlowInput): CaptureFlowState {
  if (busy && photoCount > 0) return 'looking';
  if (mode === 'photo' && session) return 'result';
  if (photoCount > 0 && isNothingFound(lastError)) return 'nothingFound';
  if (photoCount > 0) return 'shot';
  return 'framing';
}
