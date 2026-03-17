import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const appRoot = __dirname;
const workspaceRoot = path.resolve(appRoot, '..', '..');

type AppVariant = 'development' | 'preview' | 'production';

const parseEnvFile = (filePath: string): Record<string, string> => {
  if (!existsSync(filePath)) {
    return {};
  }

  return readFileSync(filePath, 'utf8').split(/\r?\n/).reduce<Record<string, string>>((env, line) => {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#')) {
      return env;
    }

    const sanitized = trimmed.startsWith('export ') ? trimmed.slice(7).trim() : trimmed;
    const separatorIndex = sanitized.indexOf('=');

    if (separatorIndex === -1) {
      return env;
    }

    const key = sanitized.slice(0, separatorIndex).trim();
    const value = sanitized.slice(separatorIndex + 1).trim().replace(/^["']|["']$/g, '');

    if (key) {
      env[key] = value;
    }

    return env;
  }, {});
};

const normalizeVariant = (value: string | undefined): AppVariant => {
  switch ((value ?? '').trim().toLowerCase()) {
    case 'production':
      return 'production';
    case 'preview':
    case 'staging':
      return 'preview';
    default:
      return 'development';
  }
};

const appVariant = normalizeVariant(
  process.env.APP_VARIANT ?? process.env.EXPO_PUBLIC_APP_ENV ?? process.env.EAS_BUILD_PROFILE,
);

const localEnv = [
  path.join(workspaceRoot, '.env'),
  path.join(workspaceRoot, `.env.${appVariant}`),
  path.join(appRoot, '.env'),
  path.join(appRoot, `.env.${appVariant}`),
].reduce<Record<string, string>>((env, filePath) => ({ ...env, ...parseEnvFile(filePath) }), {});

const resolveExpoExtraValue = (keys: string[], fallback = '') => {
  for (const key of keys) {
    const value = process.env[key] ?? localEnv[key];

    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return fallback;
};

const resolveMapboxDownloadToken = () => {
  const candidateKeys = [
    'RNMAPBOX_MAPS_DOWNLOAD_TOKEN',
    'MAPBOX_DOWNLOADS_TOKEN',
    'MAPBOX_SECRET_TOKEN',
    'MAPBOX_ACCESS_TOKEN',
    'VITE_MAPBOX_ACCESS_TOKEN',
    'EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN',
  ];

  for (const key of candidateKeys) {
    const value = process.env[key] ?? localEnv[key];

    if (typeof value === 'string' && value.trim().startsWith('sk.')) {
      return value.trim();
    }
  }

  return '';
};

const appEnv =
  resolveExpoExtraValue(['EXPO_PUBLIC_APP_ENV'], appVariant === 'preview' ? 'staging' : appVariant);
const mobileApiUrl = resolveExpoExtraValue(['EXPO_PUBLIC_MOBILE_API_URL']);
const usesCleartextTraffic = /^http:\/\//i.test(mobileApiUrl) && appVariant !== 'production';

const mapboxDownloadToken = resolveMapboxDownloadToken();

if (mapboxDownloadToken) {
  process.env.RNMAPBOX_MAPS_DOWNLOAD_TOKEN = mapboxDownloadToken;
}

const appNameByVariant: Record<AppVariant, string> = {
  development: 'Defensive Pedal Dev',
  preview: 'Defensive Pedal Preview',
  production: 'Defensive Pedal',
};

const appSchemeByVariant: Record<AppVariant, string> = {
  development: 'defensivepedal-dev',
  preview: 'defensivepedal-preview',
  production: 'defensivepedal',
};

const appIdentifierByVariant: Record<AppVariant, string> = {
  development: 'com.defensivepedal.mobile.dev',
  preview: 'com.defensivepedal.mobile.preview',
  production: 'com.defensivepedal.mobile',
};

export default () => ({
  expo: {
    name: appNameByVariant[appVariant],
    slug: 'defensive-pedal-mobile',
    scheme: appSchemeByVariant[appVariant],
    version: '0.1.0',
    orientation: 'portrait',
    userInterfaceStyle: 'automatic',
    newArchEnabled: true,
    experiments: {
      typedRoutes: true,
    },
    plugins: [
      'expo-router',
      'expo-font',
      '@rnmapbox/maps',
      ['./plugins/withAndroidCleartextTraffic', { enabled: usesCleartextTraffic }],
      [
        'expo-location',
        {
          locationWhenInUsePermission:
            'Defensive Pedal uses your location to preview safer cycling routes and navigate live.',
          locationAlwaysAndWhenInUsePermission:
            'Defensive Pedal uses your location in the background so turn-by-turn navigation keeps working while the screen is locked.',
          isIosBackgroundLocationEnabled: true,
          isAndroidBackgroundLocationEnabled: true,
        },
      ],
      [
        'expo-secure-store',
        {
          faceIDPermission: 'Allow Defensive Pedal to protect your session securely.',
        },
      ],
      [
        'expo-sqlite',
        {
          enableFTS: true,
          useSQLCipher: false,
        },
      ],
      'expo-web-browser',
    ],
    ios: {
      supportsTablet: false,
      bundleIdentifier: appIdentifierByVariant[appVariant],
      infoPlist: {
        UIBackgroundModes: ['location', 'processing'],
      },
    },
    android: {
      package: appIdentifierByVariant[appVariant],
      permissions: [
        'ACCESS_COARSE_LOCATION',
        'ACCESS_FINE_LOCATION',
        'ACCESS_BACKGROUND_LOCATION',
        'FOREGROUND_SERVICE',
        'RECEIVE_BOOT_COMPLETED',
        'WAKE_LOCK',
      ],
    },
    extra: {
      appEnv,
      appVariant,
      mobileApiUrl,
      mapboxPublicToken: resolveExpoExtraValue([
        'EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN',
        'MAPBOX_ACCESS_TOKEN',
        'VITE_MAPBOX_ACCESS_TOKEN',
      ]),
      supabaseUrl: resolveExpoExtraValue([
        'EXPO_PUBLIC_SUPABASE_URL',
        'SUPABASE_URL',
        'VITE_SUPABASE_URL',
      ]),
      supabaseAnonKey: resolveExpoExtraValue([
        'EXPO_PUBLIC_SUPABASE_ANON_KEY',
        'SUPABASE_ANON_KEY',
        'VITE_SUPABASE_ANON_KEY',
      ]),
      sentryDsn: resolveExpoExtraValue(['EXPO_PUBLIC_SENTRY_DSN']),
      sentryEnvironment: resolveExpoExtraValue(
        ['EXPO_PUBLIC_SENTRY_ENVIRONMENT'],
        appEnv,
      ),
      sentryTracesSampleRate: resolveExpoExtraValue(
        ['EXPO_PUBLIC_SENTRY_TRACES_SAMPLE_RATE'],
        '0.2',
      ),
      posthogApiKey: resolveExpoExtraValue(['EXPO_PUBLIC_POSTHOG_API_KEY']),
      posthogHost: resolveExpoExtraValue(
        ['EXPO_PUBLIC_POSTHOG_HOST'],
        'https://eu.i.posthog.com',
      ),
      devAuthBypassEnabled: resolveExpoExtraValue(
        ['EXPO_PUBLIC_DEV_AUTH_BYPASS_ENABLED', 'DEV_AUTH_BYPASS_ENABLED'],
        'false',
      ),
      devAuthBypassToken: resolveExpoExtraValue([
        'EXPO_PUBLIC_DEV_AUTH_BYPASS_TOKEN',
        'DEV_AUTH_BYPASS_TOKEN',
      ]),
      devAuthBypassUserId: resolveExpoExtraValue([
        'EXPO_PUBLIC_DEV_AUTH_BYPASS_USER_ID',
        'DEV_AUTH_BYPASS_USER_ID',
      ]),
      devAuthBypassEmail: resolveExpoExtraValue([
        'EXPO_PUBLIC_DEV_AUTH_BYPASS_EMAIL',
        'DEV_AUTH_BYPASS_EMAIL',
      ]),
      validationBundleId: resolveExpoExtraValue(['EXPO_PUBLIC_VALIDATION_BUNDLE_ID']),
      validationSourceRoot: resolveExpoExtraValue(['EXPO_PUBLIC_VALIDATION_SOURCE_ROOT']),
      validationMetroPort: resolveExpoExtraValue(['EXPO_PUBLIC_VALIDATION_METRO_PORT']),
      validationMode: resolveExpoExtraValue(['EXPO_PUBLIC_VALIDATION_MODE']),
    },
  },
});
