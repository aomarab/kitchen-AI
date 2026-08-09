/**
 * Dynamic layer over `app.json`. Two native settings cannot be hard-coded
 * there:
 *
 * - Google's OAuth redirect is the client id with its dot-separated parts
 *   reversed, so the URL scheme the app must register is only known once
 *   `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` is set. `src/lib/oauth.ts` derives the
 *   matching redirect from the same value.
 * - Sign in with Apple needs the `com.apple.developer.applesignin` entitlement,
 *   which its config plugin adds.
 *
 * Everything else continues to come from `app.json` unchanged.
 */
const GOOGLE_SUFFIX = ".apps.googleusercontent.com";

/** `1234-abc.apps.googleusercontent.com` -> `com.googleusercontent.apps.1234-abc` */
function reversedClientIdScheme(clientId) {
  if (!clientId || !clientId.endsWith(GOOGLE_SUFFIX)) return null;
  return `com.googleusercontent.apps.${clientId.slice(0, -GOOGLE_SUFFIX.length)}`;
}

/**
 * Expo's `withScheme` mod skips itself entirely when `ios.infoPlist.CFBundleURLTypes`
 * is already set, so writing the Google scheme there would silently drop the app's
 * own `kitchenai://` deep links. Rebuild what that mod would have produced —
 * `scheme`, `ios.scheme`, then the bundle identifier — so nothing is lost.
 */
function expoDefaultSchemes(config) {
  const asList = (value) =>
    Array.isArray(value)
      ? value.filter((s) => typeof s === "string")
      : typeof value === "string"
        ? [value]
        : [];

  return [
    ...asList(config.scheme),
    ...asList(config.ios?.scheme),
    config.ios?.bundleIdentifier,
  ].filter(Boolean);
}

module.exports = ({ config }) => {
  const googleScheme = reversedClientIdScheme(
    process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  );

  const plugins = [...(config.plugins ?? [])];
  if (!plugins.includes("expo-apple-authentication")) {
    plugins.push("expo-apple-authentication");
  }

  return {
    ...config,
    plugins,
    ios: {
      ...config.ios,
      // Registering the scheme unconditionally would hand iOS an empty URL type
      // and fail App Store validation, so it appears only once configured.
      ...(googleScheme
        ? {
            infoPlist: {
              ...config.ios?.infoPlist,
              CFBundleURLTypes: [
                ...(config.ios?.infoPlist?.CFBundleURLTypes ?? [
                  { CFBundleURLSchemes: expoDefaultSchemes(config) },
                ]),
                { CFBundleURLSchemes: [googleScheme] },
              ],
            },
          }
        : {}),
    },
    android: {
      ...config.android,
      ...(googleScheme
        ? {
            intentFilters: [
              ...(config.android?.intentFilters ?? []),
              {
                action: "VIEW",
                category: ["DEFAULT", "BROWSABLE"],
                data: [{ scheme: googleScheme }],
              },
            ],
          }
        : {}),
    },
  };
};
