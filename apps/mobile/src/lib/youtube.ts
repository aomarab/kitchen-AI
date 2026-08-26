/**
 * A YouTube video id is exactly 11 URL-safe base64 characters.
 *
 * The id is interpolated straight into the embed URL that a full WebView then
 * navigates to. It comes from the YouTube Data API today, but it travels
 * through a model-assisted pipeline and is stored, so it is checked before it
 * becomes a URL rather than trusted because of where it came from.
 *
 * Pure and free of native imports so it can be tested in the node-env suite.
 */
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

export function isValidYoutubeId(value: string): boolean {
  return YOUTUBE_ID.test(value);
}

/** The only origins the embed WebView may navigate to. */
export const YOUTUBE_EMBED_ORIGINS = [
  'https://www.youtube-nocookie.com',
  'https://www.youtube.com',
];

/**
 * Deliberately permissive, and it must stay that way.
 *
 * `originWhitelist` is not a blocker. In react-native-webview, a URL that fails
 * the whitelist is handed to `Linking.openURL` — the request is not cancelled,
 * it is escalated out of the app into the system browser (see
 * `createOnShouldStartLoadWithRequest` in WebViewShared). A restrictive list
 * therefore turns an unwanted in-app navigation into an unwanted *external*
 * one, including non-http schemes that deep-link into other installed apps,
 * and the app-level `onShouldStartLoadWithRequest` is never consulted.
 *
 * So the whitelist stays wide enough that the library never reaches for
 * `Linking`, and `isAllowedEmbedUrl` below does the real filtering — it runs
 * only for URLs that already passed, and returning false there cancels the
 * navigation in place.
 */
export const WEBVIEW_ORIGIN_WHITELIST = ['http://*', 'https://*'];

export function isAllowedEmbedUrl(url: string): boolean {
  // WebViews navigate to about:blank internally; blocking it breaks the embed.
  if (url === 'about:blank') return true;
  return YOUTUBE_EMBED_ORIGINS.some(
    (origin) => url === origin || url.startsWith(`${origin}/`),
  );
}

/**
 * The document origin the player page is loaded under.
 *
 * YouTube rejects an embed whose request carries no usable `Referer` with a
 * player configuration error (153, and its 152 siblings). Pointing a WebView
 * straight at the embed URL does exactly that: WKWebView has no document to
 * derive a referrer from, so the player refuses to start. Loading our own page
 * *under a real https origin* gives it one.
 *
 * It has to be youtube.com specifically, because the page loads YouTube's own
 * `iframe_api` — see {@link buildEmbedHtml}.
 */
export const EMBED_BASE_URL = 'https://www.youtube.com';

/** What the player page reports back over `postMessage`. */
export type EmbedMessage =
  | { type: 'ready' }
  | { type: 'error'; code: string };

/**
 * Parses a message from the player page.
 *
 * The WebView renders remote content, so anything arriving on this channel is
 * untrusted input from the page — it is narrowed to the two shapes we act on
 * rather than cast, and anything else is ignored.
 */
export function parseEmbedMessage(raw: string): EmbedMessage | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof data !== 'object' || data === null) return null;
  const message = data as { type?: unknown; code?: unknown };
  if (message.type === 'ready') return { type: 'ready' };
  if (message.type === 'error') {
    return { type: 'error', code: typeof message.code === 'string' ? message.code : 'unknown' };
  }
  return null;
}

/** Where to send someone whose embed will not play. */
export function watchOnYoutubeUrl(youtubeId: string): string | null {
  return isValidYoutubeId(youtubeId) ? `https://www.youtube.com/watch?v=${youtubeId}` : null;
}

/**
 * The player document for {@link EMBED_BASE_URL}.
 *
 * The player is built by YouTube's own `iframe_api`, loaded from the same
 * origin as this document, rather than by hand-writing an `<iframe>` at an
 * embed URL. That is what actually settles the configuration errors: the API
 * script stamps the frame with the `origin` and `widget_referrer` the player
 * validates, and it agrees with the document it is running in — a hand-written
 * frame pointed at a *different* YouTube host (`youtube-nocookie.com`) is
 * cross-origin to its own page and gets refused.
 *
 * The page also reports back: `onError` from the player carries YouTube's
 * numeric reason, which is otherwise invisible from the native side and leaves
 * a failure looking identical whatever caused it.
 *
 * Returns null for an id that is not exactly a YouTube id, so a malformed or
 * hostile value can never reach the markup — the id is interpolated into a
 * script here, and validating at the point of construction means no caller can
 * forget to.
 */
export function buildEmbedHtml(youtubeId: string): string | null {
  if (!isValidYoutubeId(youtubeId)) return null;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<style>html,body{margin:0;padding:0;height:100%;background:#000;overflow:hidden}#player{width:100%;height:100%}</style>
</head>
<body>
<div id="player"></div>
<script>
(function () {
  function post(message) {
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(message));
  }
  window.onYouTubeIframeAPIReady = function () {
    new YT.Player('player', {
      width: '100%',
      height: '100%',
      videoId: '${youtubeId}',
      playerVars: { autoplay: 1, playsinline: 1, rel: 0, modestbranding: 1, origin: '${EMBED_BASE_URL}' },
      events: {
        onReady: function (event) { event.target.playVideo(); post({ type: 'ready' }); },
        onError: function (event) { post({ type: 'error', code: String(event.data) }); }
      }
    });
  };
  var tag = document.createElement('script');
  tag.src = 'https://www.youtube.com/iframe_api';
  tag.onerror = function () { post({ type: 'error', code: 'api-unreachable' }); };
  document.body.appendChild(tag);
})();
</script>
</body>
</html>`;
}
