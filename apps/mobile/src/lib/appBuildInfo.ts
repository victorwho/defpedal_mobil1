/**
 * Which build this device is running, for server-side provenance.
 *
 * Until 2026-09-10 nothing recorded it, so a developer's preview rides sat
 * beside riders' store installs in every number on the analytics dashboard —
 * and the only provenance of any kind was `push_tokens.platform`, which covers
 * 56% of trip users and is consent-gated for anonymous riders, so it is both
 * partial and biased.
 *
 * Pure and separate from `ProfileDeviceSyncManager` so the precedence rule
 * below can be tested without standing up a provider.
 */
import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { mobileEnv } from './env';

export type AppEnvironment = 'development' | 'preview' | 'production';
export type AppPlatform = 'ios' | 'android' | 'web';

/**
 * Least-production wins when the two signals disagree.
 *
 * `appVariant` comes from the build config and `appEnv` from `.env`, and they
 * can disagree — a preview binary pointed at production, or a production APK
 * with a mis-set env var. The whole reason this field exists is to keep tester
 * rides OUT of the production numbers, so an ambiguous build must never
 * report itself as production: under-counting production is recoverable,
 * polluting it with test rides is the failure being fixed. Same fail-safe
 * direction as `coolMode.ts` and `loopServerFlag.ts`, which require BOTH to
 * say production before treating a build as production.
 */
const RANK: Record<AppEnvironment, number> = {
  development: 0,
  preview: 1,
  production: 2,
};

const asEnvironment = (value: string | undefined): AppEnvironment | null =>
  value === 'development' || value === 'preview' || value === 'production'
    ? value
    : null;

export const resolveAppEnvironment = (
  variant: string | undefined,
  env: string | undefined,
): AppEnvironment | undefined => {
  const a = asEnvironment(variant);
  const b = asEnvironment(env);
  if (!a && !b) return undefined;
  if (!a) return b ?? undefined;
  if (!b) return a;
  return RANK[a] <= RANK[b] ? a : b;
};

const asPlatform = (os: string): AppPlatform | undefined =>
  os === 'ios' || os === 'android' || os === 'web' ? os : undefined;

/**
 * Version string for the running build.
 *
 * `Constants.expoConfig.version` is `app.config.ts`'s `version`, the same
 * source the Sentry release smoke test uses. ⚠️ On Android the shipped
 * versionName comes from `android/app/build.gradle`, NOT this file, and the
 * two have silently drifted twice (0.2.123 vs 0.2.128, then 0.2.154 vs
 * 0.2.157). They are in step as of v0.2.159 — if they drift again this field
 * reports the stale one, so keep the bump to both.
 */
export const resolveAppVersion = (raw: unknown): string | undefined =>
  typeof raw === 'string' && raw.trim().length > 0 ? raw.trim() : undefined;

export type AppBuildInfo = {
  readonly appEnvironment?: AppEnvironment;
  readonly appVersion?: string;
  readonly appPlatform?: AppPlatform;
};

/** Build provenance for the running app. Fields absent when unresolvable. */
export const getAppBuildInfo = (): AppBuildInfo => {
  const info: {
    appEnvironment?: AppEnvironment;
    appVersion?: string;
    appPlatform?: AppPlatform;
  } = {};
  const environment = resolveAppEnvironment(
    mobileEnv.appVariant,
    mobileEnv.appEnv,
  );
  if (environment) info.appEnvironment = environment;
  const version = resolveAppVersion(Constants.expoConfig?.version);
  if (version) info.appVersion = version;
  const platform = asPlatform(Platform.OS);
  if (platform) info.appPlatform = platform;
  return info;
};
