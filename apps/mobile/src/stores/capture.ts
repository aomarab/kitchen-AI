import { create } from 'zustand';
import type { RecognitionSession } from '@kitchen/contracts';

export type CaptureSource = 'photo' | 'receipt';

interface CaptureState {
  session: RecognitionSession | null;
  source: CaptureSource;
  setSession: (session: RecognitionSession, source: CaptureSource) => void;
  reset: () => void;
}

/**
 * Holds the recognition session between the capture screen and the review
 * screen. Recognition results live here — never in inventory — until the user
 * explicitly confirms them (spec §5.1: results are always reviewed first).
 */
export const useCaptureStore = create<CaptureState>((set) => ({
  session: null,
  source: 'photo',
  setSession: (session, source) => set({ session, source }),
  reset: () => set({ session: null }),
}));
