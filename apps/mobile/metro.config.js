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
// When Metro runs from the main repo, block worktree files so they don't
// pollute resolution. When Metro runs INSIDE a worktree (i.e. workspaceRoot
// itself is under .claude/worktrees/), don't block — otherwise Metro blocks
// its own files and every bundle request 404s with "Unable to resolve ./index".
const runningInsideWorktree = /\.claude[\\/]worktrees[\\/]/.test(workspaceRoot);
config.resolver.blockList = runningInsideWorktree
  ? [/\.claude[\\/]plans[\\/].*/]
  : [
      /\.claude[\\/]worktrees[\\/].*/,
      /\.claude[\\/]plans[\\/].*/,
    ];

module.exports = config;
