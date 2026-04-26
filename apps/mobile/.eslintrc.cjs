/**
 * Defensive Pedal — mobile ESLint config
 *
 * Scope of this file (Phase 1 · R1 of the Design Quality Pass, P1-30):
 *   Enforce the design-system token rules in screen code. Specifically: no raw hex
 *   colours and no inline rgba()/rgb() values inside `apps/mobile/app/**`.
 *
 * This config is intentionally minimal — it is NOT a general RN/TS lint sweep.
 * Broader lint passes (react-hooks, react-native, import order) can be layered on
 * later without touching the color rules here.
 *
 * See: docs/design-context.md §2 (Token rules) and §5 (Lint rules).
 */

const hexMessage =
  'Raw hex colours are not allowed in screen code. Use design-system tokens via `useTheme()` ' +
  '(see docs/design-context.md §2). For semantic safety colours use `useSafetyColor()`.';

const rgbaMessage =
  'Raw rgba()/rgb() values are not allowed in screen code. Use tints from design-system ' +
  'tokens (`tints.ts`: surfaceTints, brandTints, safetyTints). See docs/design-context.md §2.';

/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
  env: {
    es2022: true,
    node: true,
    browser: true,
  },
  ignorePatterns: [
    'node_modules/',
    '.expo/',
    'android/',
    'ios/',
    'dist/',
    'build/',
    '**/__tests__/**',
    '**/*.test.ts',
    '**/*.test.tsx',
  ],
  rules: {},
  overrides: [
    // -------------------------------------------------------------------------
    // Screen code — hex + rgba() banned + Toggle atom must go through SettingRow
    // Applies to everything under apps/mobile/app/** (expo-router pages).
    // -------------------------------------------------------------------------
    {
      files: ['app/**/*.ts', 'app/**/*.tsx'],
      rules: {
        'no-restricted-syntax': [
          'error',
          {
            // String literals like '#fff', '#FFFFFF', '#FFFFFFFF'
            selector: "Literal[value=/^#[0-9a-fA-F]{3,8}$/]",
            message: hexMessage,
          },
          {
            // 'rgba(...)' and 'rgb(...)' literal strings
            selector: "Literal[value=/^rgba?\\s*\\(/]",
            message: rgbaMessage,
          },
          {
            // Template literals with a leading '#' (computed hex)
            selector: "TemplateLiteral > TemplateElement[value.raw=/^#[0-9a-fA-F]{3,8}$/]",
            message: hexMessage,
          },
        ],
        // R7 — Toggle atom is composed by SettingRow. Importing Toggle directly
        // in screen code re-creates the orphan-component drift the audit warned
        // about. Use <SettingRow> for boolean settings; for non-row toggle UI
        // (chip, checkbox, accordion handle) reach for the appropriate molecule
        // or build a new one in src/design-system rather than inlining a Toggle.
        'no-restricted-imports': [
          'error',
          {
            paths: [
              {
                name: '../src/design-system/atoms/Toggle',
                message: 'Use <SettingRow> from molecules instead — it composes Toggle correctly. See docs/design-context.md §4.',
              },
              {
                name: '../src/design-system/atoms',
                importNames: ['Toggle'],
                message: 'Use <SettingRow> from molecules instead — it composes Toggle correctly. See docs/design-context.md §4.',
              },
            ],
            patterns: [
              {
                group: ['**/atoms/Toggle', '**/design-system/atoms/Toggle'],
                message: 'Use <SettingRow> from molecules instead — it composes Toggle correctly. See docs/design-context.md §4.',
              },
            ],
          },
        ],
      },
    },
  ],
};
