#!/usr/bin/env node
/**
 * `expo prebuild` regenerates `ios/` from the Expo template, and that template
 * has no scene delegate — but apps linked against the iOS 26+ SDK trap at launch
 * (`_UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption`) unless one
 * exists. `app.json` declares `UISceneDelegateClassName` in the Info.plist, yet
 * nothing in Expo or React Native 0.86 supplies the class it names, so this
 * appends that class to the generated `AppDelegate.swift`.
 *
 * Kept as a plain script rather than an Expo config plugin because
 * `@expo/config-plugins` is not resolvable from this package under pnpm's
 * strict node_modules layout. `pnpm prebuild:ios` chains prebuild and this. It
 * is idempotent.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const appDelegatePath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../ios/KitchenAI/AppDelegate.swift',
);

const MARKER = 'class SceneDelegate';

const SCENE_DELEGATE = `
// iOS 26+ traps at launch unless the app adopts the UIScene life cycle. React
// Native still builds its window in \`application(_:didFinishLaunchingWithOptions:)\`,
// so this delegate adopts that window into the scene rather than creating its own.
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard let windowScene = scene as? UIWindowScene,
          let appDelegate = UIApplication.shared.delegate as? AppDelegate,
          let reactWindow = appDelegate.window else {
      return
    }

    reactWindow.windowScene = windowScene
    window = reactWindow
    reactWindow.makeKeyAndVisible()

    for context in connectionOptions.urlContexts {
      _ = RCTLinkingManager.application(UIApplication.shared, open: context.url, options: [:])
    }

    for activity in connectionOptions.userActivities {
      _ = RCTLinkingManager.application(
        UIApplication.shared, continue: activity, restorationHandler: { _ in })
    }
  }

  func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
    for context in URLContexts {
      _ = RCTLinkingManager.application(UIApplication.shared, open: context.url, options: [:])
    }
  }

  func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
    _ = RCTLinkingManager.application(
      UIApplication.shared, continue: userActivity, restorationHandler: { _ in })
  }
}
`;

let source;
try {
  source = readFileSync(appDelegatePath, 'utf8');
} catch {
  console.error(`No AppDelegate.swift at ${appDelegatePath}. Run \`expo prebuild -p ios\` first.`);
  process.exit(1);
}

if (source.includes(MARKER)) {
  console.log('AppDelegate.swift already declares SceneDelegate — nothing to do.');
  process.exit(0);
}

writeFileSync(appDelegatePath, `${source.trimEnd()}\n${SCENE_DELEGATE}`);
console.log('Added SceneDelegate to AppDelegate.swift.');
