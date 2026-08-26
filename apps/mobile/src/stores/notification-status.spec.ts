import { describe, it, expect, beforeEach } from 'vitest';
import { useNotificationStatus } from './notification-status';

describe('notification status store', () => {
  beforeEach(() => {
    useNotificationStatus.setState({ scheduledCount: null, permission: null, revision: 0 });
  });

  it('starts with nothing observed yet', () => {
    const state = useNotificationStatus.getState();
    expect(state.scheduledCount).toBeNull();
    // Null rather than 'undetermined': the app has not yet asked the OS, which
    // is a different thing from the OS having said "not decided".
    expect(state.permission).toBeNull();
  });

  it('records the observed permission', () => {
    useNotificationStatus.getState().setPermission('granted');
    expect(useNotificationStatus.getState().permission).toBe('granted');
  });

  it('records how many reminders are armed', () => {
    useNotificationStatus.getState().setScheduledCount(7);
    expect(useNotificationStatus.getState().scheduledCount).toBe(7);
  });

  // The scheduler rebuilds when this number moves, so it has to be a new value
  // every time — a foreground that reused the old one would schedule nothing.
  it('bumps the revision on every foreground', () => {
    const { bumpRevision } = useNotificationStatus.getState();
    bumpRevision();
    expect(useNotificationStatus.getState().revision).toBe(1);
    bumpRevision();
    expect(useNotificationStatus.getState().revision).toBe(2);
  });
});
