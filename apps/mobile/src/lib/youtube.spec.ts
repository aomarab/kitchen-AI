import { describe, expect, it } from 'vitest';
import {
  buildEmbedHtml,
  EMBED_BASE_URL,
  isAllowedEmbedUrl,
  isValidYoutubeId,
  parseEmbedMessage,
  watchOnYoutubeUrl,
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
   * a player configuration error (153, and its 152 siblings) instead of
   * playing. The player must live inside a document served under a real https
   * origin, never at the WebView's own top-level URL.
   */
  it('builds the player in a document, so it has a referrer', () => {
    const html = buildEmbedHtml('dQw4w9WgXcQ')!;

    expect(html).toContain('dQw4w9WgXcQ');
    expect(EMBED_BASE_URL.startsWith('https://')).toBe(true);
    expect(isAllowedEmbedUrl(EMBED_BASE_URL)).toBe(true);
  });

  /**
   * Hand-writing the frame was not enough: a frame pointed at a different
   * YouTube host is cross-origin to the page holding it, and the player
   * refuses a configuration it cannot verify. Letting YouTube's own API script
   * build the frame keeps the two in agreement.
   */
  it('lets YouTube build the player, from the origin the page runs on', () => {
    const html = buildEmbedHtml('dQw4w9WgXcQ')!;

    expect(html).toContain('https://www.youtube.com/iframe_api');
    expect(html).toContain('new YT.Player');
    expect(html).not.toContain('youtube-nocookie.com');
    expect(html).toContain(`origin: '${EMBED_BASE_URL}'`);
  });

  /**
   * A player error renders *inside* a WebView that loaded perfectly, so
   * `onError` never fires and every failure looks the same from the native
   * side. Reporting the code back is what makes the next one diagnosable.
   */
  it('reports player failures back to the app', () => {
    const html = buildEmbedHtml('dQw4w9WgXcQ')!;

    expect(html).toContain('onError');
    expect(html).toContain('ReactNativeWebView.postMessage');
  });

  it('plays inline and automatically, rather than opening the YouTube app', () => {
    const html = buildEmbedHtml('dQw4w9WgXcQ')!;

    expect(html).toContain('playsinline: 1');
    expect(html).toContain('autoplay: 1');
  });

  /**
   * The id is the only interpolated value and it now lands inside a script, so
   * it is validated here rather than relying on every caller to have checked
   * first.
   */
  it('refuses an id that is not exactly a YouTube id', () => {
    for (const bad of ['', "x' + alert(1) + '", '../../evil', 'dQw4w9WgXc', '<script>']) {
      expect(buildEmbedHtml(bad)).toBeNull();
    }
  });

  it('never emits a quote that could break out of the script', () => {
    const html = buildEmbedHtml('dQw4w9WgXcQ')!;
    const videoId = html.slice(html.indexOf('videoId:'));

    expect(videoId.slice(0, videoId.indexOf(','))).toBe("videoId: 'dQw4w9WgXcQ'");
  });
});

describe('parseEmbedMessage', () => {
  it('reads the codes the player reports', () => {
    expect(parseEmbedMessage('{"type":"error","code":"150"}')).toEqual({ type: 'error', code: '150' });
    expect(parseEmbedMessage('{"type":"ready"}')).toEqual({ type: 'ready' });
  });

  /** The page is remote content, so this channel is untrusted input. */
  it('ignores anything that is not one of those', () => {
    for (const bad of ['', 'not json', 'null', '[]', '{"type":"navigate","url":"http://evil"}']) {
      expect(parseEmbedMessage(bad)).toBeNull();
    }
  });

  it('still reports an error whose code is missing or not a string', () => {
    expect(parseEmbedMessage('{"type":"error"}')).toEqual({ type: 'error', code: 'unknown' });
    expect(parseEmbedMessage('{"type":"error","code":150}')).toEqual({ type: 'error', code: 'unknown' });
  });
});

describe('watchOnYoutubeUrl', () => {
  /** An embed can fail for reasons no client can fix; the video still exists. */
  it('offers the real video as a way out', () => {
    expect(watchOnYoutubeUrl('dQw4w9WgXcQ')).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(watchOnYoutubeUrl('nope')).toBeNull();
  });
});
