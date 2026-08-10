import type { FeedbackPlatform, FeedbackStatus } from '@kitchen/contracts';
import type { MessageKey } from '@kitchen/i18n';

/**
 * `MessageKey` is a literal union, so these maps are what lets a component turn
 * a runtime enum value into a checked key. A template literal would compile only
 * by widening the key type to `string`, which would remove that check from every
 * other `t()` call in the app.
 */
export const STATUS_KEY: Record<FeedbackStatus, MessageKey> = {
  new: 'web.admin.status.new',
  triaged: 'web.admin.status.triaged',
  resolved: 'web.admin.status.resolved',
  wont_fix: 'web.admin.status.wont_fix',
};

export const PLATFORM_KEY: Record<FeedbackPlatform, MessageKey> = {
  ios: 'web.admin.platform.ios',
  android: 'web.admin.platform.android',
  web: 'web.admin.platform.web',
};
