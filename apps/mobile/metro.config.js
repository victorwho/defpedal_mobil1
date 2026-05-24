const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '..', '..');

const config = getDefaultConfig(projectRoot);

// When running from a `.claude/worktrees/<name>/` worktree, node_modules are
// junctions pointing into the main repo (worktrees don't ship node_modules).
// Metro canonicalizes paths via realpath and rejects any resolution that lands
// outside `watchFolders` — so the main repo must be included for resolutions
// to succeed. We compute it by walking up to the directory containing `.claude`.
const isInsideWorktree = /\.claude[\\/]worktrees[\\/]/.test(workspaceRoot);
const mainRepoRoot = isInsideWorktree
  ? workspaceRoot.replace(/[\\/]\.claude[\\/]worktrees[\\/][^\\/]+$/, '')
  : null;

config.watchFolders = mainRepoRoot
  ? [workspaceRoot, mainRepoRoot]
  : [workspaceRoot];

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// The blockList exists so the main checkout's Metro doesn't accidentally bundle
// files from a sibling worktree at C:\dev\defpedal\.claude\worktrees\<name>.
// When Metro is running FROM inside a worktree, however, the same rule would
// block ALL of its own source. Detect the situation and only apply the block
// when the workspaceRoot is NOT inside a worktree.
config.resolver.blockList = isInsideWorktree
  ? [/\.claude[\\/]plans[\\/].*/]
  : [/\.claude[\\/]worktrees[\\/].*/, /\.claude[\\/]plans[\\/].*/];

module.exports = config;
