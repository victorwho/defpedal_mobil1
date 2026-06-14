/**
 * withIosGoogleModularHeaders
 *
 * Fixes a CocoaPods `pod install` failure on the EAS iOS builder:
 *
 *   [!] The following Swift pods cannot yet be integrated as static libraries:
 *   The Swift pod `AppCheckCore` depends upon `GoogleUtilities` and
 *   `RecaptchaInterop`, which do not define modules. ... you may set
 *   `use_modular_headers!` globally in your Podfile, or specify
 *   `:modular_headers => true` for particular dependencies.
 *
 * `@react-native-google-signin/google-signin` (^16.x) resolves a GoogleSignIn
 * native pod that now transitively pulls in the Swift pod `AppCheckCore`.
 * `AppCheckCore` can only link as a static library if its dependencies
 * (`GoogleUtilities`, `RecaptchaInterop`) define Clang modules — which they do
 * not by default. Because this project never commits a `Podfile.lock` (no
 * `ios/` dir; EAS runs `expo prebuild` fresh each build), CocoaPods resolves
 * the latest compatible pod versions every time, so this regressed silently
 * via transitive version drift between build 11 (green, 2026-06-11) and now.
 *
 * Rather than the heavier `useFrameworks: "static"` hammer (which changes
 * linkage for every pod and risks NEW failures deep in the Xcode build), this
 * grants modular headers ONLY to the offending Google support pods — the exact
 * minimal remedy CocoaPods itself suggests. The rest of the Podfile stays
 * identical to the last green build.
 *
 * Runs during the iOS prebuild on the EAS builder; survives prebuild
 * regeneration (unlike a hand-edited Podfile). iOS-only.
 */
const { createRunOncePlugin, withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const MARKER = '# withIosGoogleModularHeaders';

// Inserted inside the main app target, immediately after `use_expo_modules!`.
const MODULAR_POD_LINES = [
  `  ${MARKER} — grant modular headers so AppCheckCore links as a static lib`,
  "  pod 'GoogleUtilities', :modular_headers => true",
  "  pod 'RecaptchaInterop', :modular_headers => true",
  "  pod 'AppCheckCore', :modular_headers => true",
].join('\n');

const ANCHOR = 'use_expo_modules!';

const withIosGoogleModularHeaders = (config) =>
  withDangerousMod(config, [
    'ios',
    (cfg) => {
      const podfilePath = path.join(cfg.modRequest.platformProjectRoot, 'Podfile');
      let contents = fs.readFileSync(podfilePath, 'utf8');

      // Idempotent — never inject twice.
      if (contents.includes(MARKER)) {
        return cfg;
      }

      if (!contents.includes(ANCHOR)) {
        throw new Error(
          `[withIosGoogleModularHeaders] Could not find "${ANCHOR}" in the generated ` +
            'Podfile; the anchor for injecting modular-header pods has moved. Update the plugin.',
        );
      }

      // Replace only the first occurrence (the main app target).
      contents = contents.replace(ANCHOR, `${ANCHOR}\n${MODULAR_POD_LINES}`);
      fs.writeFileSync(podfilePath, contents);
      return cfg;
    },
  ]);

module.exports = createRunOncePlugin(
  withIosGoogleModularHeaders,
  'withIosGoogleModularHeaders',
  '1.0.0',
);
