import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
  },
  resolve: {
    alias: {
      '@defensivepedal/core': new URL('../../packages/core/src/index.ts', import.meta.url).pathname,
    },
  },
  esbuild: {
    jsx: 'automatic',
  },
});
