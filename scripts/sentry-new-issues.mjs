/**
 * Sentry "new issues" detector — monitoring runbook health check #1.
 *
 * WHY THIS EXISTS
 * ---------------
 * Check #1 used to be a single `search_issues(...)` against
 * `GET /organizations/{org}/issues/`. That endpoint requires the `event:read`
 * scope, which the `sntryu_` token in `apps/mobile/.env` does NOT have — it
 * answers 403 `{"detail":"You do not have permission to perform this action."}`
 * with `www-authenticate: Bearer error="insufficient_scope",
 * scope="event:admin event:read event:write"`. Everything else the runbook uses
 * (Discover `/events/`, releases, project keys) needs only `org:read` /
 * `project:read`, so the token looks healthy and ONLY issue search fails. That
 * left new-issue triage silently blind — the exact compensating control that
 * error-log #83b leans on for low-volume 100% failures. See error-log #97.
 *
 * WHAT IT DOES
 * ------------
 * Preflights the native issues endpoint. If the token can reach it, that path is
 * used (richer: Sentry-authoritative firstSeen, lifetime counts, permalinks).
 * If it 403s on scope, it falls back to a Discover set difference that needs
 * only `org:read`:
 *
 *   recent   = distinct issue ids with error events in the last `--days`
 *   baseline = distinct issue ids with error events in the `--baseline` days
 *              immediately before that window
 *   new      = recent minus baseline
 *
 * The fallback's "new" therefore means "no error events in the baseline window",
 * not Sentry's true firstSeen: an issue dormant longer than `--baseline` reads
 * as new. That is a deliberate false-positive bias — a monitor that re-surfaces
 * a long-dormant issue is useful; one that misses a brand-new one is not.
 *
 * The script self-heals: re-scope the token with `event:read` and it switches
 * back to the native path with no edit here.
 *
 * USAGE
 *   node scripts/sentry-new-issues.mjs [--days 5] [--baseline 90] [--json]
 *                                      [--org SLUG] [--project SLUG|-1]
 *                                      [--host https://de.sentry.io]
 *                                      [--token-file PATH] [--max-pages 10]
 *                                      [--fail-on-new]
 *
 * TOKEN RESOLUTION (first hit wins)
 *   1. $SENTRY_AUTH_TOKEN
 *   2. --token-file PATH
 *   3. apps/mobile/.env  (gitignored; only present in the main checkout)
 *
 * EXIT CODES
 *   0  check ran (new issues may have been found)
 *   1  check could not run (no token, network/auth failure)
 *   2  new issues found AND --fail-on-new was passed
 */

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const DEFAULTS = {
  org: 'defensive-pedal',
  project: '-1',
  host: 'https://de.sentry.io',
  days: '5',
  baseline: '90',
  maxPages: '10',
};

const parseArgs = (argv) => {
  const args = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (!token.startsWith('--')) {
      continue;
    }

    const key = token.slice(2);
    const next = argv[index + 1];

    if (!next || next.startsWith('--')) {
      args[key] = 'true';
      continue;
    }

    args[key] = next;
    index += 1;
  }

  return args;
};

const args = parseArgs(process.argv.slice(2));
const org = args.org ?? DEFAULTS.org;
const project = args.project ?? DEFAULTS.project;
const host = (args.host ?? DEFAULTS.host).replace(/\/$/, '');
const days = Number(args.days ?? DEFAULTS.days);
const baselineDays = Number(args.baseline ?? DEFAULTS.baseline);
const maxPages = Number(args['max-pages'] ?? DEFAULTS.maxPages);
const asJson = args.json === 'true';
const failOnNew = args['fail-on-new'] === 'true';

if (!Number.isFinite(days) || days <= 0) {
  console.error('--days must be a positive number');
  process.exit(1);
}

if (!Number.isFinite(baselineDays) || baselineDays <= 0) {
  console.error('--baseline must be a positive number');
  process.exit(1);
}

// ── token ────────────────────────────────────────────────────────────────────

const readTokenFromEnvFile = (filePath) => {
  if (!existsSync(filePath)) {
    return null;
  }

  const line = readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .find((candidate) => candidate.startsWith('SENTRY_AUTH_TOKEN='));

  if (!line) {
    return null;
  }

  return line.slice('SENTRY_AUTH_TOKEN='.length).trim().replace(/^["']|["']$/g, '');
};

const resolveToken = () => {
  if (process.env.SENTRY_AUTH_TOKEN) {
    return { token: process.env.SENTRY_AUTH_TOKEN, source: '$SENTRY_AUTH_TOKEN' };
  }

  if (args['token-file']) {
    const fromFile = readTokenFromEnvFile(args['token-file']);

    return { token: fromFile, source: args['token-file'] };
  }

  const envPath = path.join(process.cwd(), 'apps', 'mobile', '.env');

  return { token: readTokenFromEnvFile(envPath), source: envPath };
};

const { token, source: tokenSource } = resolveToken();

if (!token) {
  console.error(`No Sentry token found (looked at: ${tokenSource}).`);
  console.error('Set $SENTRY_AUTH_TOKEN, or pass --token-file <path to a .env holding SENTRY_AUTH_TOKEN=>.');
  console.error('A fresh worktree does not carry apps/mobile/.env — it is gitignored and lives in the main checkout.');
  process.exit(1);
}

// ── HTTP ─────────────────────────────────────────────────────────────────────

const request = async (url) => {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const text = await response.text();
  let body = null;

  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  return {
    ok: response.ok,
    status: response.status,
    body,
    link: response.headers.get('link') ?? '',
    wwwAuthenticate: response.headers.get('www-authenticate') ?? '',
  };
};

/** Sentry paginates with a Link header; follow rel="next" only while results="true". */
const nextCursorUrl = (linkHeader) => {
  const next = linkHeader
    .split(',')
    .map((part) => part.trim())
    .find((part) => part.includes('rel="next"'));

  if (!next || !next.includes('results="true"')) {
    return null;
  }

  const match = next.match(/^<([^>]+)>/);

  return match ? match[1] : null;
};

const discoverUrl = (params) => {
  const url = new URL(`${host}/api/0/organizations/${org}/events/`);

  url.searchParams.set('dataset', 'errors');
  url.searchParams.set('project', project);
  url.searchParams.set('per_page', '100');

  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        url.searchParams.append(key, item);
      }

      continue;
    }

    url.searchParams.set(key, value);
  }

  return url.toString();
};

const fetchAllRows = async (startUrl, label) => {
  const rows = [];
  let url = startUrl;
  let page = 0;

  while (url && page < maxPages) {
    // eslint-disable-next-line no-await-in-loop
    const response = await request(url);

    if (!response.ok) {
      const detail = typeof response.body === 'object' ? JSON.stringify(response.body) : response.body;

      throw new Error(`${label} query failed: HTTP ${response.status} ${detail}`);
    }

    rows.push(...(response.body?.data ?? []));
    url = nextCursorUrl(response.link);
    page += 1;
  }

  if (url) {
    console.warn(
      `! ${label}: stopped at --max-pages ${maxPages} with more pages available; raise --max-pages if this window is busy.`,
    );
  }

  return rows;
};

const isoAgo = (daysAgo) =>
  new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString().replace(/\.\d{3}Z$/, '');

const issueUrl = (issueId) => `https://${org}.sentry.io/issues/${issueId}/`;

// ── path A: native issue search (needs event:read) ───────────────────────────

const tryNativeIssueSearch = async () => {
  const url = new URL(`${host}/api/0/organizations/${org}/issues/`);

  url.searchParams.set('query', `is:unresolved firstSeen:-${days}d`);
  url.searchParams.set('sort', 'freq');
  url.searchParams.set('statsPeriod', `${days}d`);
  url.searchParams.set('limit', '100');
  url.searchParams.set('project', project);

  const response = await request(url.toString());

  if (response.status === 403) {
    return {
      available: false,
      reason: response.wwwAuthenticate.includes('insufficient_scope')
        ? `token is missing a scope (server asked for: ${response.wwwAuthenticate})`
        : `403 ${JSON.stringify(response.body)}`,
    };
  }

  if (!response.ok) {
    return { available: false, reason: `HTTP ${response.status} ${JSON.stringify(response.body)}` };
  }

  const issues = (response.body ?? []).map((issue) => ({
    id: issue.id,
    shortId: issue.shortId ?? null,
    title: issue.title,
    culprit: issue.culprit ?? null,
    events: Number(issue.count ?? 0),
    users: Number(issue.userCount ?? 0),
    firstSeen: issue.firstSeen ?? null,
    lastSeen: issue.lastSeen ?? null,
    url: issue.permalink ?? issueUrl(issue.id),
  }));

  return { available: true, issues };
};

// ── path B: Discover set difference (needs only org:read) ────────────────────

const runDiscoverFallback = async () => {
  const recentRows = await fetchAllRows(
    discoverUrl({
      field: ['issue', 'issue.id', 'title', 'count()', 'count_unique(user)', 'min(timestamp)', 'max(timestamp)'],
      statsPeriod: `${days}d`,
      sort: '-count()',
    }),
    'recent-window',
  );

  const baselineRows = await fetchAllRows(
    discoverUrl({
      field: ['issue.id', 'count()'],
      start: isoAgo(days + baselineDays),
      end: isoAgo(days),
      sort: '-count()',
    }),
    'baseline-window',
  );

  const baselineIds = new Set(baselineRows.map((row) => String(row['issue.id'])));
  const byId = new Map();

  for (const row of recentRows) {
    const id = String(row['issue.id']);

    if (baselineIds.has(id)) {
      continue;
    }

    const existing = byId.get(id);

    // A group's title can vary between events; collapse to one row per issue.
    if (existing) {
      existing.events += Number(row['count()'] ?? 0);
      existing.users = Math.max(existing.users, Number(row['count_unique(user)'] ?? 0));

      continue;
    }

    byId.set(id, {
      id,
      shortId: row.issue ?? null,
      title: row.title ?? '(untitled)',
      culprit: null,
      events: Number(row['count()'] ?? 0),
      users: Number(row['count_unique(user)'] ?? 0),
      firstSeen: row['min(timestamp)'] ?? null,
      lastSeen: row['max(timestamp)'] ?? null,
      url: issueUrl(id),
    });
  }

  return {
    issues: [...byId.values()].sort((a, b) => b.events - a.events),
    scanned: { recentGroups: recentRows.length, baselineGroups: baselineRows.length },
  };
};

// ── main ─────────────────────────────────────────────────────────────────────

const main = async () => {
  let mode = 'native';
  let issues = [];
  let note = null;
  let scanned = null;

  const native = await tryNativeIssueSearch();

  if (native.available) {
    issues = native.issues;
  } else {
    mode = 'discover-fallback';
    note = native.reason;

    const fallback = await runDiscoverFallback();

    issues = fallback.issues;
    scanned = fallback.scanned;
  }

  if (asJson) {
    console.log(
      JSON.stringify(
        {
          org,
          project,
          windowDays: days,
          baselineDays: mode === 'native' ? null : baselineDays,
          mode,
          note,
          scanned,
          newIssueCount: issues.length,
          issues,
        },
        null,
        2,
      ),
    );
  } else {
    console.log(`Sentry new-issue check — org ${org}, last ${days}d, token from ${tokenSource}`);

    if (mode === 'native') {
      console.log('Mode: native issue search (token has event:read) — firstSeen is Sentry-authoritative.\n');
    } else {
      console.log(`Mode: Discover fallback — native issue search unavailable: ${note}`);
      console.log(
        `      "New" here = no error events in the preceding ${baselineDays}d, not Sentry firstSeen.\n` +
          '      Restore the exact check by re-scoping the token with event:read\n' +
          '      (Sentry > User settings > Auth Tokens > create a token with event:read, then update apps/mobile/.env).\n',
      );
    }

    if (issues.length === 0) {
      console.log(`No new issues in the last ${days} days.`);
    } else {
      console.log(`${issues.length} new issue(s):\n`);

      for (const issue of issues) {
        const shortId = issue.shortId ? ` [${issue.shortId}]` : '';

        console.log(`  ${issue.title}${shortId}`);
        console.log(`    events ${issue.events} · users ${issue.users} · first ${issue.firstSeen ?? '?'}`);
        console.log(`    ${issue.url}`);
        console.log('');
      }
    }
  }

  if (failOnNew && issues.length > 0) {
    process.exit(2);
  }
};

main().catch((error) => {
  console.error(`Sentry new-issue check FAILED to run: ${error.message}`);
  process.exit(1);
});
