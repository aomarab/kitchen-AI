const { withEntitlementsPlist } = require('expo/config-plugins');

/**
 * Strips the two entitlements this app cannot sign, so `expo prebuild`
 * produces a project that builds.
 *
 * ## Push Notifications (`aps-environment`), added by `expo-notifications`
 *
 * The app schedules **local** notifications only — expiry warnings and meal
 * reminders, built on this device from data it already has. Local
 * notifications require no entitlement and no server. The plugin cannot know
 * that, so it always writes `aps-environment`, which asks Apple for remote
 * push.
 *
 * Requesting a capability the app does not use is not free: Xcode then demands
 * a provisioning profile carrying Push Notifications, so a build that needs no
 * push at all fails to sign — which is exactly how this was discovered.
 *
 * ## Sign In with Apple (`com.apple.developer.applesignin`)
 *
 * Added by `expo-apple-authentication`, and **a free/personal Apple team
 * cannot sign it** — Xcode fails with "Personal development teams do not
 * support the Sign In with Apple capability". The device builds that were
 * working before this file existed had the entitlement stripped by hand in
 * Xcode, which is why `ios/` (gitignored) could not be regenerated: a
 * `prebuild` silently produced a project that no longer built.
 *
 * Removing the entitlement does not remove a working feature — Sign In with
 * Apple has never functioned on this device build, because the capability was
 * never signed. Google and email sign-in are unaffected.
 *
 * RESTORE BOTH when the app moves to a paid Apple Developer Program team:
 * delete this plugin from `app.json`, enable the capabilities on the App ID,
 * and rebuild. Nothing else in the codebase needs to change.
 *
 * ## Why `ios.entitlements` in `app.json` is not empty
 *
 * Stripping both keys used to leave the entitlements file as a bare `<dict/>`,
 * so the app was signed with **no entitlements at all** — including no
 * keychain access group. Every `SecItemCopyMatching` / `SecItemAdd` then
 * returned `-34018 errSecMissingEntitlement`, which broke two things at once:
 * `expo-notifications` logged a red error on every launch, and — silently —
 * `expo-secure-store` could not persist the refresh token, so the session was
 * lost on every cold start. `app.json` therefore declares
 * `keychain-access-groups` explicitly. Do not remove it when this plugin goes
 * away.
 *
 * Must be listed FIRST in `plugins`. Expo applies mods in reverse
 * registration order — the last plugin in the array runs first — so anything
 * listed after the plugin that adds an entitlement gets overwritten by it.
 */
module.exports = function withoutUnsignableEntitlements(config) {
  return withEntitlementsPlist(config, (mod) => {
    delete mod.modResults['aps-environment'];
    delete mod.modResults['com.apple.developer.applesignin'];
    return mod;
  });
};
