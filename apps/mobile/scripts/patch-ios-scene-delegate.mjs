#!/usr/bin/env node
/**
 * Apps linked against the iOS 26+ SDK trap at launch
 * (`_UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption`) unless the
 * app adopts the UIScene life cycle. `app.json` declares
 * `UISceneDelegateClassName` in the Info.plist, so a `SceneDelegate` class must
 * exist to satisfy it.
 *
 * Older Expo templates generated no scene delegate, so this script appended one
 * to `AppDelegate.swift`. Expo SDK 57 / React Native 0.86 now emit a dedicated
 * `SceneDelegate.swift` from the template, which already adopts the React Native
 * window into the scene — appending a second class then fails the build with
 * "invalid redeclaration of 'SceneDelegate'". So this script now *skips* when the
 * project already declares a `SceneDelegate` (a sibling `SceneDelegate.swift`, or
 * the class already present in `AppDelegate.swift`) and only appends one when the
 * template supplies none.
 *
 * Kept as a plain script rather than an Expo config plugin because
 * `@expo/config-plugins` is not resolvable from this package under pnpm's
 * strict node_modules layout. `pnpm prebuild:ios` chains prebuild and this. It
 * is idempotent and forward-compatible with templates that already ship a scene
 * delegate.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// `expo prebuild` names the iOS project directory after the app's display name,
// so a rename (e.g. "Mama's Kitchen" -> `ios/MamasKitchen`) moves this file.
// Locate it under `ios/*/AppDelegate.swift` rather than hard-coding the name.
const iosDir = resolve(dirname(fileURLToPath(import.meta.url)), '../ios');

function findAppDelegate() {
  let entries;
  try {
    entries = readdirSync(iosDir, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === 'Pods' || entry.name === 'build') continue;
    const candidate = resolve(iosDir, entry.name, 'AppDelegate.swift');
    try {
      readFileSync(candidate, 'utf8');
      return candidate;
    } catch {
      // not this directory
    }
  }
  return null;
}

const appDelegatePath = findAppDelegate();

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
  console.error(
    `No AppDelegate.swift found under ${iosDir}/*/. Run \`expo prebuild -p ios\` first.`,
  );
  process.exit(1);
}

// The template (Expo SDK 57+) ships a dedicated SceneDelegate.swift next to
// AppDelegate.swift. Appending our own class then redeclares it and fails the
// build, so defer to the template's when present.
const siblingSceneDelegate = resolve(dirname(appDelegatePath), 'SceneDelegate.swift');
try {
  readFileSync(siblingSceneDelegate, 'utf8');
  console.log('Template already provides SceneDelegate.swift — nothing to do.');
  process.exit(0);
} catch {
  // template supplies no scene delegate; fall through and append one
}

if (source.includes(MARKER)) {
  console.log('AppDelegate.swift already declares SceneDelegate — nothing to do.');
  process.exit(0);
}

writeFileSync(appDelegatePath, `${source.trimEnd()}\n${SCENE_DELEGATE}`);
console.log('Added SceneDelegate to AppDelegate.swift.');
