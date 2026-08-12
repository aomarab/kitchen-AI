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
 * YouTube rejects an embed whose request carries no usable `Referer` with
 * "Video unavailable / error 153". Pointing a WebView straight at the embed
 * URL does exactly that: WKWebView has no document to derive a referrer from,
 * so the player refuses to start. Loading our own one-line page *under a real
 * https origin* gives the iframe a referrer and the player runs.
 *
 * The page carries no script and can navigate nowhere but YouTube, so adopting
 * this origin grants it nothing — it exists only to be a referrer.
 */
export const EMBED_BASE_URL = 'https://www.youtube.com';

/**
 * The player document for {@link EMBED_BASE_URL}.
 *
 * Returns null for an id that is not exactly a YouTube id, so a malformed or
 * hostile value can never reach the markup — the id is the only interpolated
 * value here, and validating at the point of construction means no caller can
 * forget to.
 */
export function buildEmbedHtml(youtubeId: string): string | null {
  if (!isValidYoutubeId(youtubeId)) return null;

  const params = ['autoplay=1', 'playsinline=1', 'rel=0', 'modestbranding=1'].join('&amp;');
  const src = `https://www.youtube-nocookie.com/embed/${youtubeId}?${params}`;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<style>html,body{margin:0;padding:0;height:100%;background:#000;overflow:hidden}iframe{display:block;border:0;width:100%;height:100%}</style>
</head>
<body>
<iframe src="${src}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>
</body>
</html>`;
}
