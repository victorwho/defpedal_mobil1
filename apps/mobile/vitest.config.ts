import { defineConfig } from 'vitest/config';
import path from 'path';

const mockRnPath = path.resolve(__dirname, 'vitest.mock-rn.ts');
const mockAsyncStoragePath = path.resolve(__dirname, 'vitest.mock-async-storage.ts');

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
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
