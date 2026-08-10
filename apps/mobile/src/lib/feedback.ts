import { Platform } from 'react-native';
import Constants from 'expo-constants';
import type { FeedbackPlatform } from '@kitchen/contracts';

/**
 * Every submission is tagged with the platform and build it came from, so a
 * crop of one-star reports can be traced to a single release rather than
 * treated as a general slide in quality.
 */
export function currentPlatform(): FeedbackPlatform {
  if (Platform.OS === 'ios') return 'ios';
  if (Platform.OS === 'android') return 'android';
  return 'web';
}

export function currentAppVersion(): string {
  return Constants.expoConfig?.version ?? '0.0.0';
}
