# Mobile release build

How to build and ship the Expo app (`Mama's Kitchen`, bundle
`com.abedomar.kitchenai`). Two paths: **EAS** (cloud, for the App Store) and a
**local Release** build (for a device/simulator you have plugged in).

## Build-time env flags

`EXPO_PUBLIC_*` values are baked into the JS bundle at build time. Locals live in
the gitignored `apps/mobile/.env`; EAS reads the `env` block of each profile in
`eas.json`.

| Flag                          | Meaning                                            | Now         |
| ----------------------------- | -------------------------------------------------- | ----------- |
| `EXPO_PUBLIC_API_URL`         | Backend base URL                                   | live Azure VM `https://20-216-43-148.nip.io` |
| `EXPO_PUBLIC_USE_MOCKS`       | `false` = real API (auth + inventory)              | `false`     |
| `EXPO_PUBLIC_USE_STORE_MOCKS` | `false` = real RevenueCat storefront               | `true` (no RevenueCat key yet) |
| `EXPO_PUBLIC_REVENUECAT_API_KEY` | RevenueCat public SDK key                       | unset       |
| `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` / `_ANDROID_` / `_WEB_` | Google OAuth client ids | unset       |

Until a RevenueCat key and App Store IAP products exist, keep
`EXPO_PUBLIC_USE_STORE_MOCKS=true` even in the `production` profile — otherwise
the native SDK cannot load and every "Buy credits" tap fails.

## Local Release build

A **Debug** build fetches JS from Metro and crashes once unplugged — always use
`--configuration Release` for anything that leaves your desk.

```bash
# Simulator (no signing needed):
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
  pnpm --filter @kitchen/mobile exec expo run:ios --configuration Release

# Physical iPhone — pass the hardware UDID from `xcrun xctrace list devices`:
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
  pnpm --filter @kitchen/mobile exec expo run:ios \
  --configuration Release --device <hardware-udid>
```

Regenerate the native project after a config/plugin change:
`pnpm --filter @kitchen/mobile prebuild:ios`.

## EAS build (App Store)

`eas.json` defines `development`, `preview` and `production` profiles + a
`submit` profile. First-time setup links the project to your Expo account (this
writes `extra.eas.projectId` into the app config):

```bash
cd apps/mobile
npx eas-cli login          # your Expo credentials
npx eas-cli init           # links the project, creates projectId
npx eas-cli build --platform ios --profile production
npx eas-cli submit --platform ios --profile production
```

Provide the OAuth/RevenueCat values as EAS secrets (they are not in the repo):
`npx eas-cli secret:create --name EXPO_PUBLIC_REVENUECAT_API_KEY --value <key>`,
and likewise for the three `EXPO_PUBLIC_GOOGLE_*_CLIENT_ID` values. Then flip
`EXPO_PUBLIC_USE_STORE_MOCKS` to `false` in the `production` profile.

## Paid Apple Developer Program caveat

The app currently signs on a **personal/free** Apple team, so
`plugins/withoutUnsignableEntitlements` strips two entitlements that a free team
cannot sign: Push Notifications (`aps-environment`) and Sign in with Apple
(`com.apple.developer.applesignin`).

Before an App Store submission on a **paid** team:

1. Remove `./plugins/withoutUnsignableEntitlements` from `app.json`'s `plugins`.
2. Enable the matching capabilities on the App ID in the Apple Developer portal.
3. Rebuild. **Sign in with Apple is required by App Store Guideline 4.8** because
   the app also offers Google sign-in — it must work before review.

Nothing else in the codebase changes; local notifications never needed push.
