import { AccessibilityInfo } from 'react-native';
import { create } from 'zustand';

export const TOAST_MS = 5000;

export interface ToastOptions {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

interface ToastState {
  toast: ToastOptions | null;
  footerOffset: number;
  show: (toast: ToastOptions) => void;
  dismiss: () => void;
  setFooterOffset: (height: number) => void;
}

let dismissTimer: ReturnType<typeof setTimeout> | null = null;

function clearDismissTimer() {
  if (!dismissTimer) return;
  clearTimeout(dismissTimer);
  dismissTimer = null;
}

export const useToastStore = create<ToastState>((set) => ({
  toast: null,
  footerOffset: 0,
  show: (toast) => {
    clearDismissTimer();
    set({ toast });
    AccessibilityInfo.announceForAccessibility(toast.message);
    dismissTimer = setTimeout(() => {
      dismissTimer = null;
      set({ toast: null });
    }, TOAST_MS);
  },
  dismiss: () => {
    clearDismissTimer();
    set({ toast: null });
  },
  setFooterOffset: (height) => set({ footerOffset: Math.max(0, height) }),
}));
