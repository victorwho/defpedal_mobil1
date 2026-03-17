import Constants from 'expo-constants';

const publicEnv = process.env as Record<string, string | undefined>;

const extra =
  (Constants.expoConfig?.extra as {
    appEnv?: string;
    appVariant?: string;
    mobileApiUrl?: string;
    mapboxPublicToken?: string;
    supabaseUrl?: string;
    supabaseAnonKey?: string;
    sentryDsn?: string;
    sentryEnvironment?: string;
    sentryTracesSampleRate?: string;
    posthogApiKey?: string;
    posthogHost?: string;
    devAuthBypassEnabled?: string;
    devAuthBypassToken?: string;
    devAuthBypassUserId?: string;
    devAuthBypassEmail?: string;
    validationBundleId?: string;
    validationSourceRoot?: string;
    validationMetroPort?: string;
    validationMode?: string;
  }) ?? {};

const parseBoolean = (value: string | undefined) => {
  switch ((value ?? '').trim().toLowerCase()) {
    case '1':
    case 'true':
    case 'yes':
    case 'on':
      return true;
    default:
      return false;
  }
};

const isNgrokTunnelUrl = (value: string | undefined) => {
  if (!value) {
    return false;
  }

  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return hostname.includes('ngrok');
  } catch {
    return false;
  }
};

export const mobileEnv = {
  appEnv: publicEnv.EXPO_PUBLIC_APP_ENV ?? extra.appEnv ?? 'development',
  appVariant: extra.appVariant ?? 'development',
  mobileApiUrl: publicEnv.EXPO_PUBLIC_MOBILE_API_URL ?? extra.mobileApiUrl ?? '',
  mapboxPublicToken:
    publicEnv.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN ?? extra.mapboxPublicToken ?? '',
  supabaseUrl: publicEnv.EXPO_PUBLIC_SUPABASE_URL ?? extra.supabaseUrl ?? '',
  supabaseAnonKey:
    publicEnv.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? extra.supabaseAnonKey ?? '',
  sentryDsn: publicEnv.EXPO_PUBLIC_SENTRY_DSN ?? extra.sentryDsn ?? '',
  sentryEnvironment:
    publicEnv.EXPO_PUBLIC_SENTRY_ENVIRONMENT ??
    extra.sentryEnvironment ??
    extra.appEnv ??
    'development',
  sentryTracesSampleRate: Number(
    publicEnv.EXPO_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? extra.sentryTracesSampleRate ?? '0.2',
  ),
  posthogApiKey: publicEnv.EXPO_PUBLIC_POSTHOG_API_KEY ?? extra.posthogApiKey ?? '',
  posthogHost:
    publicEnv.EXPO_PUBLIC_POSTHOG_HOST ?? extra.posthogHost ?? 'https://eu.i.posthog.com',
  devAuthBypassEnabled: parseBoolean(
    publicEnv.EXPO_PUBLIC_DEV_AUTH_BYPASS_ENABLED ?? extra.devAuthBypassEnabled,
  ),
  devAuthBypassToken:
    publicEnv.EXPO_PUBLIC_DEV_AUTH_BYPASS_TOKEN ?? extra.devAuthBypassToken ?? '',
  devAuthBypassUserId:
    publicEnv.EXPO_PUBLIC_DEV_AUTH_BYPASS_USER_ID ?? extra.devAuthBypassUserId ?? '',
  devAuthBypassEmail:
    publicEnv.EXPO_PUBLIC_DEV_AUTH_BYPASS_EMAIL ?? extra.devAuthBypassEmail ?? '',
  validationBundleId:
    publicEnv.EXPO_PUBLIC_VALIDATION_BUNDLE_ID ?? extra.validationBundleId ?? '',
  validationSourceRoot:
    publicEnv.EXPO_PUBLIC_VALIDATION_SOURCE_ROOT ?? extra.validationSourceRoot ?? '',
  validationMetroPort:
    publicEnv.EXPO_PUBLIC_VALIDATION_METRO_PORT ?? extra.validationMetroPort ?? '',
  validationMode:
    publicEnv.EXPO_PUBLIC_VALIDATION_MODE ?? extra.validationMode ?? '',
  usesNgrokTunnel: isNgrokTunnelUrl(
    publicEnv.EXPO_PUBLIC_MOBILE_API_URL ?? extra.mobileApiUrl ?? '',
  ),
} as const;
