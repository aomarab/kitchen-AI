import { create } from 'zustand';
import type { RecognitionSession } from '@kitchen/contracts';
import type { CapturedPhoto } from '../lib/capture';

export type CaptureSource = 'photo' | 'receipt';

export interface CaptureState {
  session: RecognitionSession | null;
  source: CaptureSource;
  photos: CapturedPhoto[];
  setSession: (
    session: RecognitionSession,
    source: CaptureSource,
    photos?: CapturedPhoto[],
  ) => void;
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
  photos: [],
  setSession: (session, source, photos = []) => set({ session, source, photos }),
  reset: () => set({ session: null, photos: [] }),
}));
