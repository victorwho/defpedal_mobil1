import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

type EnvSource = Record<string, string | undefined>;

type ResolveEnvValueOptions = {
  ignoreValues?: string[];
};

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const serviceRoot = path.resolve(workspaceRoot, 'services', 'mobile-api');

const normalizeEnvValue = (value: string) => {
  const trimmed = value.trim();

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
};

export const parseEnvFileContents = (contents: string): Record<string, string> =>
  contents.split(/\r?\n/).reduce<Record<string, string>>((parsed, line) => {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#')) {
      return parsed;
    }

    const sanitized = trimmed.startsWith('export ') ? trimmed.slice(7).trim() : trimmed;
    const separatorIndex = sanitized.indexOf('=');

    if (separatorIndex === -1) {
      return parsed;
    }

    const key = sanitized.slice(0, separatorIndex).trim();
    const rawValue = sanitized.slice(separatorIndex + 1);

    if (!key) {
      return parsed;
    }

    parsed[key] = normalizeEnvValue(rawValue);
    return parsed;
  }, {});

const readEnvFile = (filePath: string): Record<string, string> => {
  if (!existsSync(filePath)) {
    return {};
  }

  return parseEnvFileContents(readFileSync(filePath, 'utf8'));
};

const localEnv = {
  ...readEnvFile(path.join(workspaceRoot, '.env')),
  ...readEnvFile(path.join(serviceRoot, '.env')),
};

export const resolveEnvValue = (
  keys: string[],
  sources: EnvSource[],
  fallback = '',
  options: ResolveEnvValueOptions = {},
): string => {
  const ignoredValues = new Set(
    (options.ignoreValues ?? []).map((value) => value.trim().toUpperCase()),
  );

  for (const source of sources) {
    for (const key of keys) {
      const value = source[key];

      if (typeof value !== 'string') {
        continue;
      }

      const trimmed = value.trim();

      if (!trimmed) {
        continue;
      }

      if (ignoredValues.has(trimmed.toUpperCase())) {
        continue;
      }

      return trimmed;
    }
  }

  return fallback;
};

export const resolveConfigValue = (
  keys: string[],
  fallback = '',
  options: ResolveEnvValueOptions = {},
): string =>
  resolveEnvValue(keys, [process.env as EnvSource, localEnv], fallback, options);
