const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// pnpm keeps dependencies outside the app folder, so Metro has to watch the
// workspace root and know about both node_modules trees.
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
config.resolver.unstable_enableSymlinks = true;
// Hierarchical lookup must stay ON: pnpm hoists undeclared transitive peers
// (whatwg-fetch, etc.) into node_modules/.pnpm/node_modules, and Metro only
// finds them by walking up from the resolving package's directory.
config.resolver.disableHierarchicalLookup = false;

module.exports = config;
