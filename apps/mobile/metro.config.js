const fs = require('fs');
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '..', '..');

const config = getDefaultConfig(projectRoot);

const escapeRegex = (value) => value.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&');
const pathToPattern = (targetPath) =>
  targetPath.split(path.sep).map(escapeRegex).join('[\\\\/]');

const blockedWorkspacePaths = [
  path.join(workspaceRoot, 'App.tsx'),
  path.join(workspaceRoot, 'MapWrapper.tsx'),
  path.join(workspaceRoot, 'components'),
  path.join(workspaceRoot, 'hooks'),
  path.join(workspaceRoot, 'services'),
];

config.resolver.blockList = blockedWorkspacePaths.map((targetPath) => {
  const isDirectory = fs.existsSync(targetPath) && fs.statSync(targetPath).isDirectory();
  const suffix = isDirectory ? '[\\\\/].*$' : '$';
  return new RegExp(`^${pathToPattern(targetPath)}${suffix}`);
});

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

module.exports = config;
