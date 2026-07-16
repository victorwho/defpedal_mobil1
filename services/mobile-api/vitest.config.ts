import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Suppress Fastify JSON log output during test runs
    env: {
      LOG_LEVEL: 'silent',
      // Disable the Pedal Nudge System during tests so fire-and-forget
      // P0 paths from feedback/hazard handlers don't consume mocked
      // Supabase chains and pollute other tests in the same file.
      NUDGES_ENABLED: 'false',
      // Anonymous push stays OFF in tests (its production default). Suites
      // that exercise the anonymous whitelist flip it per-test via
      // process.env and restore in afterEach (same pattern as killSwitch).
      ANON_PUSH_ENABLED: 'false',
      // Point Supabase at NOTHING during tests. Several suites do not mock
      // lib/supabaseAdmin; without this override vitest inherits the real
      // .env, and fixture queries (user_id='test-user-001', 'user-123')
      // land on the PRODUCTION database — observed in prod postgres logs
      // 2026-07-13 while running this suite locally. Empty values make
      // supabaseAdmin null, sending those code paths to their in-memory
      // fallbacks. vitest env is applied before dotenv, and dotenv does not
      // override existing vars, so these win.
      SUPABASE_URL: '',
      SUPABASE_SERVICE_ROLE_KEY: '',
      SUPABASE_ANON_KEY: '',
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
