#!/usr/bin/env node
/**
 * ESLint baseline ratchet — Phase 1 · R1 of the Design Quality Pass (P1-30).
 *
 * Purpose
 *   Allow a strict lint rule (no raw hex / rgba in screen code) to ship without
 *   requiring a mega-PR that cleans every existing violation at once. Instead:
 *     - The current violation count per file is stored in `.eslint-baseline.json`.
 *     - CI runs `npm run lint:check` which fails only when any file has MORE
 *       violations than its baseline (or a previously-clean file gains any).
 *     - Developers running `npm run lint:fix` locally can reduce counts below
 *       baseline freely — the ratchet never forces violations back up.
 *     - Periodically (e.g. end of each phase) someone runs `npm run lint:baseline`
 *       to lock in the new, lower counts.
 *
 * This prevents new drift at the PR boundary while letting the cleanup happen
 * organically via Phase 2's per-screen light-mode sweep (R10).
 *
 * Usage
 *   npm run lint:check              # assert no regressions
 *   npm run lint:baseline           # regenerate the baseline file
 *
 * Exit codes
 *   0 — no regressions
 *   1 — one or more files above baseline (violation details printed)
 *   2 — ESLint failed to run / parse
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const baselinePath = resolve(root, '.eslint-baseline.json');
const writeMode = process.argv.includes('--write');

// ----- Run ESLint with JSON output ------------------------------------------
// Invoke the ESLint JS entry point directly via Node. This avoids the Windows
// `spawnSync .cmd` EINVAL quirk and works whether npm workspaces hoisted the
// package to the repo-root node_modules or installed it locally.
function findEslintEntry(startDir) {
  let dir = startDir;
  while (true) {
    const candidate = resolve(dir, 'node_modules', 'eslint', 'bin', 'eslint.js');
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

const eslintEntry = findEslintEntry(root);

if (!eslintEntry) {
  console.error('✗ ESLint not found in any node_modules on the path from:');
  console.error(`  ${root}`);
  console.error('  Run `npm install` from the repo root first.');
  process.exit(2);
}

const result = spawnSync(
  process.execPath,
  [eslintEntry, '--format=json', '--ext=.ts,.tsx', 'app'],
  {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
    maxBuffer: 50 * 1024 * 1024, // 50 MiB — plenty for JSON violation reports
  },
);

if (result.error) {
  console.error('✗ Failed to run ESLint:', result.error.message);
  process.exit(2);
}

// ESLint exits non-zero when it finds any violation; that's expected here.
// It should only exit 2+ for actual failures (config errors, parse errors
// across the board). We still try to parse stdout — valid JSON means the
// run completed.
let report;
try {
  report = JSON.parse(result.stdout);
} catch {
  console.error('✗ Could not parse ESLint JSON output.');
  console.error('  stdout:', result.stdout.slice(0, 500));
  console.error('  stderr:', result.stderr.slice(0, 500));
  process.exit(2);
}

// ----- Tally per-file violations --------------------------------------------
const current = {};
for (const file of report) {
  const relPath = relative(root, file.filePath).split(sep).join('/');
  const count = file.errorCount + file.warningCount;
  if (count > 0) {
    current[relPath] = count;
  }
}

// ----- --write mode: dump current state as the new baseline -----------------
if (writeMode) {
  const sorted = Object.fromEntries(
    Object.entries(current).sort(([a], [b]) => a.localeCompare(b)),
  );
  writeFileSync(baselinePath, JSON.stringify(sorted, null, 2) + '\n', 'utf8');
  const total = Object.values(sorted).reduce((s, n) => s + n, 0);
  console.log(`✓ Wrote baseline: ${Object.keys(sorted).length} file(s), ${total} violation(s).`);
  process.exit(0);
}

// ----- Check mode: compare current vs baseline ------------------------------
const baseline = existsSync(baselinePath)
  ? JSON.parse(readFileSync(baselinePath, 'utf8'))
  : {};

const regressions = [];
const improvements = [];
const files = new Set([...Object.keys(current), ...Object.keys(baseline)]);

for (const f of files) {
  const cur = current[f] || 0;
  const base = baseline[f] || 0;
  if (cur > base) regressions.push({ file: f, cur, base });
  else if (cur < base) improvements.push({ file: f, cur, base });
}

for (const { file, cur, base } of regressions) {
  console.error(`✗ ${file}: ${cur} violation(s) — baseline ${base}, regression +${cur - base}`);
}

for (const { file, cur, base } of improvements) {
  console.log(`✓ ${file}: ${cur} violation(s) — improved from ${base} (−${base - cur})`);
}

if (regressions.length > 0) {
  const total = regressions.reduce((s, r) => s + (r.cur - r.base), 0);
  console.error('');
  console.error(`✗ ${regressions.length} file(s) have new lint violations above baseline (+${total} total).`);
  console.error('  To fix: address the new violations, OR run `npm run lint:baseline` if intentional.');
  console.error('  See docs/design-context.md §5 for the lint rules.');
  process.exit(1);
}

if (improvements.length > 0) {
  console.log('');
  console.log(`  ${improvements.length} file(s) improved below baseline. Consider running:`);
  console.log('    npm run lint:baseline');
  console.log('  to lock in the lower counts.');
}

const totalCurrent = Object.values(current).reduce((s, n) => s + n, 0);
console.log(`✓ No regressions. ${Object.keys(current).length} file(s) at or below baseline (${totalCurrent} total violation(s)).`);
