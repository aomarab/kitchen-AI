const { withDangerousMod, withXcodeProject, IOSConfig } = require("expo/config-plugins");
const fs = require("node:fs");
const path = require("node:path");

/**
 * `app.json` points `UISceneDelegateClassName` at `$(PRODUCT_MODULE_NAME).SceneDelegate`, and the
 * iOS 26+ SDK refuses to launch an app that does not adopt the UIScene life cycle. Expo's template
 * ships no such class, so prebuild would otherwise produce an app that launches to a black screen.
 * `AppDelegate` still builds the window and starts React Native; this delegate only adopts that
 * window into the scene UIKit hands us.
 */
const SCENE_DELEGATE = `import UIKit

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard let windowScene = scene as? UIWindowScene,
          let appDelegate = UIApplication.shared.delegate as? AppDelegate,
          let existingWindow = appDelegate.window else { return }

    existingWindow.windowScene = windowScene
    window = existingWindow
    existingWindow.makeKeyAndVisible()
  }
}
`;

const FILENAME = "SceneDelegate.swift";

function withSceneDelegateFile(config) {
  return withDangerousMod(config, [
    "ios",
    (cfg) => {
      const { projectName, platformProjectRoot } = cfg.modRequest;
      const target = path.join(platformProjectRoot, projectName, FILENAME);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, SCENE_DELEGATE, "utf8");
      return cfg;
    },
  ]);
}

function withSceneDelegateBuildFile(config) {
  return withXcodeProject(config, (cfg) => {
    const { projectName } = cfg.modRequest;
    const filepath = `${projectName}/${FILENAME}`;
    if (!cfg.modResults.hasFile(filepath)) {
      IOSConfig.XcodeUtils.addBuildSourceFileToGroup({
        filepath,
        groupName: projectName,
        project: cfg.modResults,
      });
    }
    return cfg;
  });
}

module.exports = (config) => withSceneDelegateBuildFile(withSceneDelegateFile(config));
