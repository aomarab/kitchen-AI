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
