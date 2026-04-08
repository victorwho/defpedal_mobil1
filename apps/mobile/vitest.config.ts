import { defineConfig } from 'vitest/config';
import path from 'path';

const mockRnPath = path.resolve(__dirname, 'vitest.mock-rn.ts');

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
    ],
  },
  esbuild: {
    jsx: 'automatic',
  },
});
