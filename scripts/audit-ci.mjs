#!/usr/bin/env node
// Production-dependency security gate for CI (and local parity).
//
// Replaces `npm audit --omit=dev --audit-level=high`. It audits only shipped
// (production) dependencies and FAILS on any high/critical advisory EXCEPT a
// small, explicitly-documented allowlist of advisories that live in transitive
// dev/build/telemetry tooling which is not part of the shipped app.
//
// Why an allowlist instead of npm `overrides`: npm 11 silently refuses to apply
// overrides to these deeply-nested workspace sub-trees (Expo/Metro/RN dev
// tooling; posthog -> @opentelemetry), and `npm audit fix` removes
// @opentelemetry/core and breaks @sentry/node. See progress.md (CI audit) and
// .claude/error-log.md.
//
// HARD RULE: every allowlist entry must document why the advisory cannot reach
// shipped code, and must be re-reviewed on every dependency bump. Anything NOT
// in the allowlist still fails the build.
import { execSync } from 'node:child_process';

const ALLOWLIST = {
  'GHSA-96hv-2xvq-fx4p':
    'ws — Memory-exhaustion DoS. Pulled only by Expo/Metro/React-Native dev-server + JS-inspector tooling (@expo/cli, @expo/metro, @react-native/dev-middleware). Not bundled into the shipped Android/iOS app (Hermes bytecode) or invoked in production.',
  'GHSA-wcpc-wj8m-hjx6':
    'protobufjs — DoS via unbounded Any expansion during JSON conversion. Pulled by posthog-js -> @opentelemetry/otlp-transformer (web telemetry export). The vulnerable Any->JSON conversion path is not exercised by our usage.',
};

// Use a shell command string so npm resolves on every platform (npm vs
// npm.cmd) and stdout is captured even when npm exits non-zero.
let raw;
try {
  raw = execSync('npm audit --omit=dev --json', {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
} catch (err) {
  // `npm audit` exits non-zero whenever vulnerabilities exist; the JSON report
  // is still written to stdout. Fall back to it.
  raw = err.stdout ? err.stdout.toString() : '';
}
if (!raw.trim()) {
  console.error('audit-ci: npm audit produced no JSON output');
  process.exit(2);
}

const report = JSON.parse(raw);
const ghsaFromUrl = (url) => {
  const m = url && String(url).match(/GHSA-[0-9a-z-]+/i);
  return m ? m[0] : null;
};

const blocking = [];
const allowed = [];
const seen = new Set();
for (const vuln of Object.values(report.vulnerabilities || {})) {
  for (const via of vuln.via || []) {
    if (typeof via !== 'object') continue; // string entries are transitive links
    if (via.severity !== 'high' && via.severity !== 'critical') continue;
    const id = ghsaFromUrl(via.url) || `src:${via.source}`;
    const pkg = via.name || vuln.name;
    const key = `${id}|${pkg}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const entry = { id, pkg, severity: via.severity, title: via.title };
    (ALLOWLIST[id] ? allowed : blocking).push(entry);
  }
}

if (allowed.length) {
  console.log(
    `\nAllowlisted high/critical advisories (${allowed.length}) — documented as not reaching shipped code:`,
  );
  for (const a of allowed) {
    console.log(`  • ${a.severity.toUpperCase()} ${a.id} (${a.pkg}) — ${a.title}`);
    console.log(`      reason: ${ALLOWLIST[a.id]}`);
  }
}

if (blocking.length) {
  console.error(
    `\n✖ ${blocking.length} non-allowlisted high/critical advisory(ies) in production dependencies:`,
  );
  for (const b of blocking) {
    console.error(`  • ${b.severity.toUpperCase()} ${b.id} (${b.pkg}) — ${b.title}`);
  }
  console.error(
    '\nResolve with `npm audit fix`, by bumping the dependency, or — only if it genuinely cannot reach shipped code — by adding it to the allowlist in scripts/audit-ci.mjs with a documented reason.',
  );
  process.exit(1);
}

console.log('\n✓ No non-allowlisted high/critical advisories in production dependencies.');
process.exit(0);
