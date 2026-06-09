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
    // No test files are quarantined. LeaderboardSection + HazardDetailSheet —
    // the last two excluded here — were re-enabled 2026-06-09 after fixing two
    // stacked causes: (1) `@sentry/react-native` + `posthog-react-native`
    // (imported top-level by lib/telemetry.ts, reached via the API client)
    // CJS-require real react-native and pulled in Libraries/Promise.js — both
    // are now stubbed in vitest.setup.ts; (2) LeaderboardSection's mock paths
    // were a directory level short (the test sits in `__tests__/`), so the real
    // useLeaderboard → useCurrentLocation → expo-location loaded anyway.
    exclude: [
      'node_modules/**',
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
