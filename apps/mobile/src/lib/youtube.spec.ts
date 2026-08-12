import { describe, expect, it } from 'vitest';
import {
  buildEmbedHtml,
  EMBED_BASE_URL,
  isAllowedEmbedUrl,
  isValidYoutubeId,
  WEBVIEW_ORIGIN_WHITELIST,
  YOUTUBE_EMBED_ORIGINS,
} from './youtube';

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
    ]) {
      expect(isAllowedEmbedUrl(url)).toBe(false);
    }
  });

  it('allows about:blank, which WebViews navigate to internally', () => {
    expect(isAllowedEmbedUrl('about:blank')).toBe(true);
  });
});

describe('originWhitelist', () => {
  /**
   * react-native-webview does not *cancel* a URL that fails originWhitelist —
   * it hands it to Linking.openURL, launching the system browser (or a deep
   * link into another app) without user intent, and skips the app-level
   * onShouldStartLoadWithRequest entirely. A narrow whitelist therefore turns
   * an unwanted in-app navigation into an unwanted external one. The whitelist
   * must stay wide so the library never reaches for Linking; isAllowedEmbedUrl
   * is what actually blocks, and it cancels in place.
   */
  it('stays permissive so blocked URLs are cancelled, not escalated', () => {
    expect(WEBVIEW_ORIGIN_WHITELIST).toEqual(['http://*', 'https://*']);
    for (const origin of YOUTUBE_EMBED_ORIGINS) {
      expect(isAllowedEmbedUrl(`${origin}/embed/dQw4w9WgXcQ`)).toBe(true);
    }
  });
});

describe('buildEmbedHtml', () => {
  /**
   * The whole reason this function exists. Navigating the WebView straight to
   * the embed URL leaves the player with no referrer, and YouTube answers with
   * "Video unavailable — error 153" instead of playing. The player must
   * therefore be an iframe inside a document we serve under a real https
   * origin, never the WebView's own top-level URL.
   */
  it('embeds the video in a document, so the player has a referrer', () => {
    const html = buildEmbedHtml('dQw4w9WgXcQ')!;

    expect(html).toContain('<iframe');
    expect(html).toContain('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
    expect(EMBED_BASE_URL.startsWith('https://')).toBe(true);
    expect(isAllowedEmbedUrl(EMBED_BASE_URL)).toBe(true);
  });

  it('plays inline and automatically, rather than opening the YouTube app', () => {
    const html = buildEmbedHtml('dQw4w9WgXcQ')!;

    expect(html).toContain('playsinline=1');
    expect(html).toContain('autoplay=1');
    expect(html).toContain('allow="autoplay');
  });

  /**
   * The id is the only interpolated value, so it is validated here rather than
   * relying on every caller to have checked first — otherwise a stored id
   * could close the attribute and inject markup into the page.
   */
  it('refuses an id that is not exactly a YouTube id', () => {
    for (const bad of ['', 'x" onload="alert(1)', '../../evil', 'dQw4w9WgXc', '<script>']) {
      expect(buildEmbedHtml(bad)).toBeNull();
    }
  });

  it('never emits a quote that could escape the src attribute', () => {
    const html = buildEmbedHtml('dQw4w9WgXcQ')!;
    const src = html.slice(html.indexOf('src="') + 5);

    expect(src.slice(0, src.indexOf('"'))).not.toContain('<');
  });
});
