const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '..', '..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// The blockList exists so the main checkout's Metro doesn't accidentally bundle
// files from a sibling worktree at C:\dev\defpedal\.claude\worktrees\<name>.
// When Metro is running FROM inside a worktree, however, the same rule would
// block ALL of its own source. Detect the situation and only apply the block
// when the workspaceRoot is NOT inside a worktree.
const isInsideWorktree = /\.claude[\\/]worktrees[\\/]/.test(workspaceRoot);
config.resolver.blockList = isInsideWorktree
  ? [/\.claude[\\/]plans[\\/].*/]
  : [/\.claude[\\/]worktrees[\\/].*/, /\.claude[\\/]plans[\\/].*/];

module.exports = config;
