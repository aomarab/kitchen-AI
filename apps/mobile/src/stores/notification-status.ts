import { create } from 'zustand';
import type { PermissionState } from '../lib/notification-scheduler';

/**
 * What the notification system is doing right now, shared by the background
 * scheduler and the settings screen so the two can never disagree.
 *
 * Deliberately not persisted: it describes what the OS is holding at this
 * moment, and a saved value would go stale as soon as the app was closed.
 *
 * It exists because a notification system is otherwise invisible until it
 * fires — or fails to. Someone who has turned the toggles on has no way to
 * tell the difference between "nothing is due yet" and "this is quietly
 * broken", and neither did the person building it: the count is what makes
 * the scheduling verifiable on a real device.
 */
interface NotificationStatusState {
  scheduledCount: number | null;
  /**
   * The OS permission as last observed, or null before the app has ever
   * asked. The scheduler watches this: permission is granted from the
   * settings screen at a moment when nothing about the kitchen has changed,
   * and without a signal here the plan would never be rebuilt.
   */
  permission: PermissionState | null;
  /** Bumped on every return to the foreground; forces a rebuild for the new day. */
  revision: number;
  setScheduledCount: (value: number) => void;
  setPermission: (value: PermissionState) => void;
  bumpRevision: () => void;
}

export const useNotificationStatus = create<NotificationStatusState>((set) => ({
  scheduledCount: null,
  permission: null,
  revision: 0,
  setScheduledCount: (value) => set({ scheduledCount: value }),
  setPermission: (value) => set({ permission: value }),
  bumpRevision: () => set((state) => ({ revision: state.revision + 1 })),
}));
