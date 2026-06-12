/**
 * Root postinstall wrapper around patch-package.
 *
 * Why this exists: the API Docker build (services/mobile-api/Dockerfile) runs
 * `npm install --workspaces --include-workspace-root=false`, which still
 * executes the ROOT package's postinstall but never installs the root
 * devDependencies — so a bare `"postinstall": "patch-package"` exits 127
 * ("patch-package: not found") and kills every Cloud Build (first broken by
 * the 2026-06-09 install-referrer patch, caught 2026-06-12).
 *
 * Behavior:
 *   - patch-package not installed → warn + exit 0. The patches/ directory
 *     only targets React Native libraries (expo-sensors,
 *     react-native-play-install-referrer), none of which ship in the API
 *     image, so skipping is correct there.
 *   - patch-package installed (dev machines, EAS, CI) → run it and PROPAGATE
 *     its exit code, so a genuine patch conflict still fails the install
 *     loudly instead of shipping an unpatched native module.
 */
const path = require('node:path');
const { spawnSync } = require('node:child_process');

let pkgJsonPath;
try {
  pkgJsonPath = require.resolve('patch-package/package.json');
} catch {
  console.warn(
    '[postinstall] patch-package is not installed — skipping RN patches. ' +
      'This is expected ONLY in server Docker builds (root devDependencies omitted); ' +
      'on a dev machine or EAS this means node_modules is broken.',
  );
  process.exit(0);
}

const pkg = require(pkgJsonPath);
const binRelative = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin['patch-package'];
const binPath = path.join(path.dirname(pkgJsonPath), binRelative);

const result = spawnSync(process.execPath, [binPath], { stdio: 'inherit' });
process.exit(result.status ?? 1);
