import { create } from 'zustand';

/**
 * How many reminders are currently armed on this device.
 *
 * Deliberately not persisted: it describes what the OS is holding right now,
 * and a saved number would go stale the moment the app was closed.
 *
 * It exists because a notification system is otherwise invisible until it
 * fires — or fails to. Someone who has turned the toggles on has no way to
 * tell the difference between "nothing is due yet" and "this is quietly
 * broken", and neither did the person building it: the count is what makes
 * the scheduling verifiable on a real device.
 */
interface NotificationStatusState {
  scheduledCount: number | null;
  setScheduledCount: (value: number) => void;
}

export const useNotificationStatus = create<NotificationStatusState>((set) => ({
  scheduledCount: null,
  setScheduledCount: (value) => set({ scheduledCount: value }),
}));
