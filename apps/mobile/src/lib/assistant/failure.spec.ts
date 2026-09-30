import { describe, expect, it } from 'vitest';
import {
  assistantConnectionLabelKey,
  assistantFailureMessageKey,
  isOutOfCreditsFailure,
} from './failure';

describe('assistantFailureMessageKey', () => {
  it('gives every adapter error code its own message', () => {
    expect(assistantFailureMessageKey('assistant.outOfCredits')).toBe(
      'errors.INSUFFICIENT_CREDITS',
    );
    expect(assistantFailureMessageKey('assistant.mintFailed')).toBe('mobile.assistant.errorMint');
    expect(assistantFailureMessageKey('assistant.connectFailed')).toBe(
      'mobile.assistant.errorConnect',
    );
    expect(assistantFailureMessageKey('assistant.micDenied')).toBe('mobile.assistant.errorMic');
    expect(assistantFailureMessageKey('assistant.providerError')).toBe(
      'mobile.assistant.errorReply',
    );
  });

  it('still says something for a code it does not know', () => {
    expect(assistantFailureMessageKey('assistant.somethingNew')).toBe(
      'mobile.assistant.errorConnect',
    );
  });
});

describe('isOutOfCreditsFailure', () => {
  it('singles out the credits refusal, the one failure Retry cannot fix', () => {
    expect(isOutOfCreditsFailure('assistant.outOfCredits')).toBe(true);
    expect(isOutOfCreditsFailure('assistant.mintFailed')).toBe(false);
    expect(isOutOfCreditsFailure('assistant.connectFailed')).toBe(false);
    expect(isOutOfCreditsFailure(null)).toBe(false);
  });
});

describe('assistantConnectionLabelKey', () => {
  it('never calls an ended session connected', () => {
    expect(assistantConnectionLabelKey('connecting')).toBe('mobile.assistant.connecting');
    expect(assistantConnectionLabelKey('live')).toBe('mobile.assistant.connected');
    expect(assistantConnectionLabelKey('ended')).toBe('mobile.assistant.disconnected');
  });
});
