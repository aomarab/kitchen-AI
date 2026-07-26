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

export function isAllowedEmbedUrl(url: string): boolean {
  return YOUTUBE_EMBED_ORIGINS.some((origin) => url.startsWith(`${origin}/`));
}
