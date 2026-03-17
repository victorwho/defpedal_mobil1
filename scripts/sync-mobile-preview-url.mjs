#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const DEFAULT_NGROK_API_URL = 'http://127.0.0.1:4040/api/tunnels';
const DEFAULT_ENV_FILE = path.join(process.cwd(), 'apps', 'mobile', '.env.preview');
const DEFAULT_TARGET_PORT = '8080';

const parseArgs = (argv) => {
  const args = {};

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];

    if (!current.startsWith('--')) {
      continue;
    }

    const key = current.slice(2);
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

const fail = (message) => {
  console.error(`ERROR: ${message}`);
  process.exit(1);
};

const extractPort = (value) => {
  if (!value) {
    return null;
  }

  const normalized = String(value).trim();
  const match = normalized.match(/:(\d+)(?:\/)?$/);
  return match ? match[1] : null;
};

const chooseTunnel = (tunnels, targetPort) => {
  const httpsTunnels = tunnels.filter(
    (tunnel) => typeof tunnel.public_url === 'string' && tunnel.public_url.startsWith('https://'),
  );

  if (httpsTunnels.length === 0) {
    fail('No HTTPS ngrok tunnels were found.');
  }

  const exactPortMatches = httpsTunnels.filter((tunnel) => {
    const configuredPort = extractPort(tunnel?.config?.addr);
    return configuredPort === targetPort;
  });

  if (exactPortMatches.length === 1) {
    return exactPortMatches[0];
  }

  if (exactPortMatches.length > 1) {
    fail(
      `Multiple HTTPS ngrok tunnels match local port ${targetPort}. Pass --tunnel-url explicitly.`,
    );
  }

  if (httpsTunnels.length === 1) {
    return httpsTunnels[0];
  }

  fail(
    `No HTTPS ngrok tunnel matched local port ${targetPort}. Available addresses: ${httpsTunnels
      .map((tunnel) => tunnel?.config?.addr ?? '(unknown)')
      .join(', ')}`,
  );
};

const formatEnvLine = (key, value) => `${key}=${value}`;

const updateEnvFile = (filePath, updates) => {
  const existingLines = existsSync(filePath) ? readFileSync(filePath, 'utf8').split(/\r?\n/) : [];
  const remainingKeys = new Set(Object.keys(updates));
  const nextLines = existingLines.map((line) => {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) {
      return line;
    }

    const separatorIndex = trimmed.indexOf('=');
    const key = trimmed.slice(0, separatorIndex).trim();

    if (!remainingKeys.has(key)) {
      return line;
    }

    remainingKeys.delete(key);
    return formatEnvLine(key, updates[key]);
  });

  if (nextLines.length > 0 && nextLines[nextLines.length - 1].trim() !== '') {
    nextLines.push('');
  }

  for (const key of remainingKeys) {
    nextLines.push(formatEnvLine(key, updates[key]));
  }

  writeFileSync(filePath, `${nextLines.join('\n').replace(/\n+$/, '\n')}`, 'utf8');
};

const args = parseArgs(process.argv.slice(2));
const tunnelUrl = args['tunnel-url']?.trim() ?? '';
const envFile = path.resolve(args['preview-env-file'] ?? DEFAULT_ENV_FILE);
const ngrokApiUrl = args['ngrok-api-url'] ?? DEFAULT_NGROK_API_URL;
const targetPort = args.port ?? DEFAULT_TARGET_PORT;
const dryRun = args['dry-run'] === 'true';

let resolvedTunnelUrl = tunnelUrl;
let selectedTunnel = null;

if (!resolvedTunnelUrl) {
  let response;

  try {
    response = await fetch(ngrokApiUrl);
  } catch (error) {
    fail(
      `Could not reach ngrok API at ${ngrokApiUrl}. Start ngrok first or pass --tunnel-url explicitly. ${
        error instanceof Error ? error.message : ''
      }`.trim(),
    );
  }

  if (!response.ok) {
    fail(`ngrok API request failed with ${response.status} at ${ngrokApiUrl}.`);
  }

  const payload = await response.json();
  const tunnels = Array.isArray(payload?.tunnels) ? payload.tunnels : [];
  selectedTunnel = chooseTunnel(tunnels, targetPort);
  resolvedTunnelUrl = selectedTunnel.public_url;
}

if (!/^https?:\/\//i.test(resolvedTunnelUrl)) {
  fail(`Resolved tunnel URL is invalid: ${resolvedTunnelUrl}`);
}

const updates = {
  APP_VARIANT: 'preview',
  EXPO_PUBLIC_APP_ENV: 'staging',
  EXPO_PUBLIC_MOBILE_API_URL: resolvedTunnelUrl.replace(/\/$/, ''),
};

if (dryRun) {
  console.log(`Preview env file: ${envFile}`);
  console.log(`Resolved mobile API URL: ${updates.EXPO_PUBLIC_MOBILE_API_URL}`);
  if (selectedTunnel) {
    console.log(`Matched ngrok tunnel: ${selectedTunnel.public_url} -> ${selectedTunnel?.config?.addr ?? '(unknown)'}`);
  }
  process.exit(0);
}

updateEnvFile(envFile, updates);

console.log(`Updated ${envFile}`);
console.log(`EXPO_PUBLIC_MOBILE_API_URL=${updates.EXPO_PUBLIC_MOBILE_API_URL}`);

if (selectedTunnel) {
  console.log(`Matched ngrok tunnel ${selectedTunnel.public_url} -> ${selectedTunnel?.config?.addr ?? '(unknown)'}`);
}
