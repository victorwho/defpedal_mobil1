#!/usr/bin/env node
/**
 * Upload an AAB to Google Play via the Android Publisher API.
 *
 * Exists so a release can be published from here instead of by hand in the
 * Console. Set up 2026-09-15; see docs/runbooks/play-publishing.md.
 *
 *   node scripts/play-publish.mjs --aab <path> [--track production]
 *                                 [--status draft] [--notes <dir>] [--dry-run]
 *                                 [--fraction 0.05]   (with --status inProgress)
 *
 * Auth: a service-account JSON key, path from PLAY_SERVICE_ACCOUNT_KEY (default
 * below). The key is NEVER in the repo. Play permissions come from Play Console
 * > Users and permissions — GCP IAM roles have nothing to do with it.
 *
 * ⚠️ Defaults to `draft`: the release is created but NOT rolled out, so a human
 * still decides when users get it. Pass --status completed only when you mean
 * "ship to 100% now" — there is no undo on a Play rollout.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const DEFAULT_KEY =
  'C:/dev/adminInfo/google_play_publisher/play-publisher-gen-lang-client-0895796477.json';
const PKG = 'com.defensivepedal.mobile';
const API = 'https://androidpublisher.googleapis.com';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
};
const has = name => process.argv.includes(`--${name}`);

const aabPath = arg('aab');
const track   = arg('track', 'production');
const status  = arg('status', 'draft');
const notesDir = arg('notes');
const fraction = arg('fraction');
const dryRun  = has('dry-run');
const keyPath = process.env.PLAY_SERVICE_ACCOUNT_KEY || DEFAULT_KEY;

if (!aabPath) { console.error('--aab <path> is required'); process.exit(2); }
if (!fs.existsSync(aabPath)) { console.error(`AAB not found: ${aabPath}`); process.exit(2); }
if (!fs.existsSync(keyPath)) { console.error(`Service-account key not found: ${keyPath}`); process.exit(2); }
if (!['draft', 'completed', 'halted', 'inProgress'].includes(status)) {
  console.error(`--status must be draft|completed|halted|inProgress`); process.exit(2);
}

/*
 * Staged rollout. Play expresses "5% of users" as status `inProgress` plus a
 * `userFraction`; the two are not independent, and sending a fraction with any
 * other status is rejected. Guarded here rather than left to the caller,
 * because the failure mode is asymmetric: a fraction silently dropped on a
 * `completed` release ships to 100% of users with no undo.
 */
let userFraction;
if (fraction !== undefined) {
  if (status !== 'inProgress') {
    console.error(`--fraction requires --status inProgress (got '${status}')`);
    process.exit(2);
  }
  userFraction = Number(fraction);
  if (!Number.isFinite(userFraction) || userFraction <= 0 || userFraction >= 1) {
    console.error(`--fraction must be between 0 and 1 exclusive (got '${fraction}')`);
    process.exit(2);
  }
} else if (status === 'inProgress') {
  console.error(`--status inProgress requires --fraction (e.g. --fraction 0.05)`);
  process.exit(2);
}

// ---------------------------------------------------------------------------
// Auth: JWT-bearer -> access token
// ---------------------------------------------------------------------------
const sa = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const now = Math.floor(Date.now() / 1000);
const header = b64({ alg: 'RS256', typ: 'JWT' });
const claim = b64({
  iss: sa.client_email,
  scope: 'https://www.googleapis.com/auth/androidpublisher',
  aud: 'https://oauth2.googleapis.com/token',
  iat: now, exp: now + 3600,
});
const jwtSig = crypto
  .sign('RSA-SHA256', Buffer.from(`${header}.${claim}`), sa.private_key)
  .toString('base64url');

const tokRes = await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion: `${header}.${claim}.${jwtSig}`,
  }),
});
if (!tokRes.ok) { console.error('token request failed:', await tokRes.text()); process.exit(1); }
const { access_token } = await tokRes.json();

const api = async (method, urlPath, { body, headers = {}, raw } = {}) => {
  const r = await fetch(`${API}${urlPath}`, {
    method,
    headers: { Authorization: `Bearer ${access_token}`, ...headers },
    body: raw ?? (body ? JSON.stringify(body) : undefined),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`${method} ${urlPath} -> HTTP ${r.status}\n${text}`);
  return text ? JSON.parse(text) : {};
};

// ---------------------------------------------------------------------------
// Release notes: one file per locale, <locale>.txt, 500-char Play cap
// ---------------------------------------------------------------------------
let releaseNotes;
if (notesDir) {
  releaseNotes = fs.readdirSync(notesDir)
    .filter(f => f.endsWith('.txt'))
    .map(f => {
      const text = fs.readFileSync(path.join(notesDir, f), 'utf8').trim();
      if ([...text].length > 500) {
        throw new Error(`${f}: ${[...text].length} chars, Play caps release notes at 500`);
      }
      return { language: path.basename(f, '.txt'), text };
    });
}

const bytes = fs.statSync(aabPath).size;
console.log(`package   ${PKG}`);
console.log(`aab       ${aabPath} (${(bytes / 1048576).toFixed(1)} MB)`);
console.log(`track     ${track}`);
console.log(`status    ${status}${status === 'draft' ? '  (created, NOT rolled out)' : ''}`);
console.log(`notes     ${releaseNotes ? releaseNotes.map(n => n.language).join(', ') : '(none)'}`);
const proceed = !dryRun;
if (!proceed) console.log('--dry-run: stopping before any write.');

// ---------------------------------------------------------------------------
// Edit -> upload -> assign to track -> commit
// ---------------------------------------------------------------------------
if (proceed) {
  const edit = await api('POST', `/androidpublisher/v3/applications/${PKG}/edits`);
  console.log(`\nedit ${edit.id} opened`);
  try {
    const uploaded = await api('POST',
      `/upload/androidpublisher/v3/applications/${PKG}/edits/${edit.id}/bundles?uploadType=media`,
      { headers: { 'Content-Type': 'application/octet-stream' }, raw: fs.readFileSync(aabPath) });
    console.log(`uploaded versionCode ${uploaded.versionCode} (sha1 ${uploaded.sha1})`);

    await api('PUT', `/androidpublisher/v3/applications/${PKG}/edits/${edit.id}/tracks/${track}`, {
      headers: { 'Content-Type': 'application/json' },
      body: {
        track,
        releases: [{
          versionCodes: [String(uploaded.versionCode)],
          status,
          ...(userFraction !== undefined ? { userFraction } : {}),
          ...(releaseNotes ? { releaseNotes } : {}),
        }],
      },
    });
    console.log(
      `assigned to '${track}' as ${status}` +
        (userFraction !== undefined ? ` at ${userFraction * 100}% of users` : ''),
    );

    await api('POST', `/androidpublisher/v3/applications/${PKG}/edits/${edit.id}:commit`);
    console.log('edit committed');

    // Verify from a FRESH edit — never trust the write's own response.
    const check = await api('POST', `/androidpublisher/v3/applications/${PKG}/edits`);
    const live = await api('GET',
      `/androidpublisher/v3/applications/${PKG}/edits/${check.id}/tracks/${track}`);
    console.log('\nverified on a fresh read:');
    for (const rel of live.releases ?? []) {
      console.log(`  versionCodes ${rel.versionCodes?.join(',')}  status=${rel.status}` +
        `  notes=${(rel.releaseNotes ?? []).map(n => n.language).join(',') || 'none'}`);
    }
    await api('DELETE', `/androidpublisher/v3/applications/${PKG}/edits/${check.id}`);
  } catch (err) {
    await api('DELETE', `/androidpublisher/v3/applications/${PKG}/edits/${edit.id}`).catch(() => {});
    console.error('\nfailed, edit discarded — nothing was published');
    throw err;
  }

}
