import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Suppress Fastify JSON log output during test runs
    env: {
      LOG_LEVEL: 'silent',
    },
    coverage: {
      provider: 'istanbul',
      include: ['src/**/*.ts'],
      exclude: [
        'src/server.ts',
        'src/env.ts',
        'src/env.test.ts',
        'src/**/*.test.ts',
      ],
      thresholds: {
        branches: 80,
        functions: 80,
        lines: 80,
        statements: 80,
      },
    },
  },
  resolve: {
    alias: {
      '@defensivepedal/core': new URL('../../packages/core/src/index.ts', import.meta.url).pathname,
    },
  },
});
