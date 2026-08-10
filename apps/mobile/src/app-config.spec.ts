import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import appJson from "../app.json";

// `app.config.js` only reshapes plain config objects, but it is loaded through
// the same mocked-native barrier as `oauth.ts` so both can be compared here.
vi.mock("expo-apple-authentication", () => ({}));
vi.mock("expo-auth-session", () => ({}));
vi.mock("react-native", () => ({
  Platform: { select: (options: Record<string, unknown>) => options.ios },
}));
vi.mock("./lib/api", () => ({ usingMocks: false }));

const { googleRedirectUri } = await import("./lib/oauth");

type Config = {
  ios?: {
    infoPlist?: { CFBundleURLTypes?: { CFBundleURLSchemes: string[] }[] };
  };
  android?: { intentFilters?: { data?: { scheme?: string }[] }[] };
  plugins?: string[];
};

const GOOGLE_ID = "1234-abc.apps.googleusercontent.com";
const GOOGLE_SCHEME = "com.googleusercontent.apps.1234-abc";

async function buildConfig(): Promise<Config> {
  const factory = (await import("../app.config.js")).default as (arg: {
    config: unknown;
  }) => Config;
  // Expo passes the static config already flattened out of its `expo` key.
  return factory({ config: structuredClone(appJson.expo) });
}

function schemes(config: Config): string[] {
  return (config.ios?.infoPlist?.CFBundleURLTypes ?? []).flatMap(
    (t) => t.CFBundleURLSchemes,
  );
}

const originalId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;

beforeEach(() => {
  process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID = GOOGLE_ID;
});

afterEach(() => {
  if (originalId === undefined)
    delete process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
  else process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID = originalId;
});

describe("app.config", () => {
  it("registers the reversed client id so Google can redirect back", async () => {
    expect(schemes(await buildConfig())).toContain(GOOGLE_SCHEME);
  });

  it("keeps the app own schemes that Expo would otherwise have added", async () => {
    // Setting `ios.infoPlist.CFBundleURLTypes` makes Expo skip its `withScheme`
    // mod entirely, which silently dropped `kitchenai://` deep links until the
    // config started reproducing what that mod contributes.
    expect(schemes(await buildConfig())).toEqual(
      expect.arrayContaining([
        appJson.expo.scheme,
        appJson.expo.ios.bundleIdentifier,
      ]),
    );
  });

  it("leaves the URL types to Expo when no client id is configured", async () => {
    delete process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
    const config = await buildConfig();

    // An empty URL type would fail App Store validation, so none is written.
    expect(config.ios?.infoPlist?.CFBundleURLTypes).toBeUndefined();
    expect(config.android?.intentFilters ?? []).toHaveLength(0);
  });

  it("ignores a client id that is not a Google one", async () => {
    process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID = "not-a-google-client-id";
    expect(
      (await buildConfig()).ios?.infoPlist?.CFBundleURLTypes,
    ).toBeUndefined();
  });

  it("registers the same scheme that the runtime redirect is built from", async () => {
    // The Info.plist entry and `oauth.ts` derive independently; if they drift,
    // Google returns the code to a scheme the app never claimed.
    const redirect = googleRedirectUri(GOOGLE_ID);
    expect(schemes(await buildConfig())).toContain(redirect.split(":")[0]);
  });

  it("mirrors the scheme into an Android intent filter", async () => {
    const filters = (await buildConfig()).android?.intentFilters ?? [];
    expect(filters.flatMap((f) => f.data ?? []).map((d) => d.scheme)).toContain(
      GOOGLE_SCHEME,
    );
  });

  it("adds the Sign in with Apple plugin", async () => {
    expect((await buildConfig()).plugins).toContain(
      "expo-apple-authentication",
    );
  });

  it("keeps the SceneDelegate plugin that prevents a black-screen launch", async () => {
    // `app.json` names `$(PRODUCT_MODULE_NAME).SceneDelegate` in
    // UIApplicationSceneManifest. Expo's template ships no such class, so if
    // this plugin is removed `expo prebuild` silently produces an app that
    // launches to a black screen — every test, typecheck and lint still passes.
    expect((await buildConfig()).plugins).toContain(
      "./plugins/withSceneDelegate",
    );
  });
});
