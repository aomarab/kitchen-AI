import { describe, expect, it } from 'vitest';
import { isAllowedEmbedUrl, isValidYoutubeId } from './youtube';

describe('isValidYoutubeId', () => {
  it('accepts a real 11-character id', () => {
    expect(isValidYoutubeId('dQw4w9WgXcQ')).toBe(true);
    expect(isValidYoutubeId('_-aB3cD4eF5')).toBe(true);
  });

  it('rejects anything that could steer the embed elsewhere', () => {
    for (const value of [
      '',
      'dQw4w9WgXc',
      'dQw4w9WgXcQQ',
      '../../evil',
      'abc?enablejsapi=1',
      'abc#fragment',
      'abc&list=x',
      'https://evil.test/x',
      'dQw4w9WgXc Q',
    ]) {
      expect(isValidYoutubeId(value)).toBe(false);
    }
  });
});

describe('isAllowedEmbedUrl', () => {
  it('allows the YouTube embed origins', () => {
    expect(isAllowedEmbedUrl('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ')).toBe(true);
    expect(isAllowedEmbedUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(true);
  });

  it('blocks navigations off YouTube', () => {
    // Without this the WebView is a general-purpose browser inside the app.
    for (const url of [
      'https://evil.test/phish',
      'http://www.youtube.com/embed/x',
      'https://www.youtube.com.evil.test/embed/x',
      'javascript:alert(1)',
      'about:blank',
    ]) {
      expect(isAllowedEmbedUrl(url)).toBe(false);
    }
  });
});
