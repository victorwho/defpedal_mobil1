import { defineConfig, type Plugin } from 'vitest/config';
import path from 'path';

const mockRnPath = path.resolve(__dirname, 'vitest.mock-rn.ts');
const mockAsyncStoragePath = path.resolve(__dirname, 'vitest.mock-async-storage.ts');

/**
 * Stub RN static-asset `require('./foo.png')` calls. The asset resolver
 * returns an opaque numeric handle at runtime; vitest's bundler tries to
 * parse the binary as JS and dies. A `resolve.alias` doesn't catch
 * require() of relative PNG paths, so we plug in directly.
 */
const stubPngPlugin = (): Plugin => ({
  name: 'stub-png',
  enforce: 'pre',
  resolveId(source) {
    if (source.endsWith('.png')) return '\0stub-png';
    return null;
  },
  load(id) {
    if (id === '\0stub-png') return 'module.exports = 1;';
    return null;
  },
});

export default defineConfig({
  plugins: [stubPngPlugin()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    // The 3 files below fail at MODULE LOAD time (before any describe / it
    // runs): a transitive import escapes the `react-native` shim alias and
    // pulls in real `react-native/Libraries/Promise.js`, whose
    // `require('promise/setimmediate/es6-extensions')` (no extension) the
    // Vite/Node resolver can't resolve — "Cannot find module
    // 'promise/setimmediate/es6-extensions'". `describe.skip` is too late
    // (top-level imports throw before the runner sees a describe). The badge /
    // share / weather files quarantined alongside these were re-enabled
    // 2026-06-09 once the svg/clipboard/Image/PanResponder mocks + View ARIA
    // mapping landed; THESE 3 need the deeper resolver fix (alias the offending
    // internal, or mock the component that reaches it). Production behaviour is
    // exercised at runtime / on-device.
    exclude: [
      'node_modules/**',
      'src/design-system/organisms/__tests__/LeaderboardSection.test.tsx',
      'src/design-system/organisms/__tests__/HazardDetailSheet.test.tsx',
      'src/components/__tests__/FeedCard.champion.test.tsx',
    ],
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
  },
  resolve: {
    alias: [
      { find: '@defensivepedal/core', replacement: new URL('../../packages/core/src/index.ts', import.meta.url).pathname },
      // react-native/index.js contains Flow syntax (`import typeof`) that
      // Vite/Rollup cannot parse. Redirect to a plain TS mock shim.
      { find: /^react-native$/, replacement: mockRnPath },
      { find: /^react-native\//, replacement: mockRnPath },
      // @react-native-async-storage/async-storage uses platform-extension
      // (.native.js / .web.js) resolution Vite's Node resolver doesn't
      // handle. Use an in-memory stand-in in tests.
      {
        find: /^@react-native-async-storage\/async-storage$/,
        replacement: mockAsyncStoragePath,
      },
    ],
  },
  esbuild: {
    jsx: 'automatic',
  },
});
