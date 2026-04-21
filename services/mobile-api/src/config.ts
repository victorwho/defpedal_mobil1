import { resolveConfigValue } from './env';

const splitCsv = (value: string | undefined, fallback: string[]): string[] =>
  (value ?? '')
    .split(',')
    .map((entry) => entry.trim().toUpperCase())
    .filter(Boolean)
    .reduce<string[]>((accumulator, entry) => {
      if (!accumulator.includes(entry)) {
        accumulator.push(entry);
      }
      return accumulator;
    }, fallback.length === 0 ? [] : [...fallback]);

const parsePositiveNumber = (value: string, fallback: number) => {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
};

const parseBooleanFlag = (value: string) => {
  switch (value.trim().toLowerCase()) {
    case '1':
    case 'true':
    case 'yes':
    case 'on':
      return true;
    default:
      return false;
  }
};

export const config = {
  port: Number(resolveConfigValue(['PORT'], '8080')),
  logLevel: resolveConfigValue(['LOG_LEVEL'], 'info'),
  corsOrigin: resolveConfigValue(['CORS_ORIGIN'], '*'),
  safeOsrmBaseUrl:
    resolveConfigValue(
      ['SAFE_OSRM_BASE_URL'],
      'http://34.116.139.172:5000/route/v1/bicycle',
    ),
  safeOsrmFlatBaseUrl:
    resolveConfigValue(
      ['SAFE_OSRM_FLAT_BASE_URL'],
      'http://34.116.139.172:5001/route/v1/bicycle-flat',
    ),
  mapboxAccessToken: resolveConfigValue(
    ['MAPBOX_ACCESS_TOKEN', 'VITE_MAPBOX_ACCESS_TOKEN', 'EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN'],
    '',
    {
      ignoreValues: ['YOUR_MAPBOX_TOKEN_HERE', 'YOUR_MAPBOX_ACCESS_TOKEN'],
    },
  ),
  mapboxGeocodingBaseUrl:
    resolveConfigValue(
      ['MAPBOX_GEOCODING_BASE_URL'],
      'https://api.mapbox.com/geocoding/v5/mapbox.places',
    ),
  mapboxDirectionsBaseUrl:
    resolveConfigValue(
      ['MAPBOX_DIRECTIONS_BASE_URL'],
      'https://api.mapbox.com/directions/v5/mapbox/cycling',
    ),
  supabaseUrl: resolveConfigValue(['SUPABASE_URL'], ''),
  supabaseAnonKey: resolveConfigValue(
    ['SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY', 'EXPO_PUBLIC_SUPABASE_ANON_KEY'],
    '',
  ),
  supabaseServiceRoleKey: resolveConfigValue(['SUPABASE_SERVICE_ROLE_KEY'], ''),
  devAuthBypass: {
    enabled: parseBooleanFlag(resolveConfigValue(['DEV_AUTH_BYPASS_ENABLED'], 'false')),
    token: resolveConfigValue(['DEV_AUTH_BYPASS_TOKEN'], ''),
    userId: resolveConfigValue(['DEV_AUTH_BYPASS_USER_ID'], 'dev-auth-user'),
    email: resolveConfigValue(['DEV_AUTH_BYPASS_EMAIL'], ''),
  },
  supportedSafeCountries: splitCsv(resolveConfigValue(['SUPPORTED_SAFE_COUNTRIES']), ['RO']),
  routeResponseCache: {
    previewTtlMs: parsePositiveNumber(
      resolveConfigValue(['ROUTE_PREVIEW_CACHE_TTL_MS'], '45000'),
      45000,
    ),
    rerouteTtlMs: parsePositiveNumber(
      resolveConfigValue(['ROUTE_REROUTE_CACHE_TTL_MS'], '15000'),
      15000,
    ),
  },
  rateLimits: {
    routePreview: {
      limit: parsePositiveNumber(
        resolveConfigValue(['RATE_LIMIT_ROUTE_PREVIEW_MAX'], '30'),
        30,
      ),
      windowMs: parsePositiveNumber(
        resolveConfigValue(['RATE_LIMIT_ROUTE_PREVIEW_WINDOW_MS'], '60000'),
        60000,
      ),
    },
    routeReroute: {
      limit: parsePositiveNumber(
        resolveConfigValue(['RATE_LIMIT_ROUTE_REROUTE_MAX'], '60'),
        60,
      ),
      windowMs: parsePositiveNumber(
        resolveConfigValue(['RATE_LIMIT_ROUTE_REROUTE_WINDOW_MS'], '60000'),
        60000,
      ),
    },
    write: {
      limit: parsePositiveNumber(resolveConfigValue(['RATE_LIMIT_WRITE_MAX'], '20'), 20),
      windowMs: parsePositiveNumber(
        resolveConfigValue(['RATE_LIMIT_WRITE_WINDOW_MS'], '60000'),
        60000,
      ),
    },
    hazardVote: {
      limit: parsePositiveNumber(resolveConfigValue(['RATE_LIMIT_HAZARD_VOTE_MAX'], '5'), 5),
      windowMs: parsePositiveNumber(
        resolveConfigValue(['RATE_LIMIT_HAZARD_VOTE_WINDOW_MS'], '600000'),
        600000,
      ),
    },
  },
  redis: {
    url: resolveConfigValue(['REDIS_URL'], ''),
    keyPrefix: resolveConfigValue(
      ['REDIS_KEY_PREFIX'],
      'defensivepedal:mobile-api',
    ),
    connectTimeoutMs: parsePositiveNumber(
      resolveConfigValue(['REDIS_CONNECT_TIMEOUT_MS'], '5000'),
      5000,
    ),
  },
  versions: {
    safeRoutingEngineVersion: resolveConfigValue(
      ['SAFE_ROUTING_ENGINE_VERSION', 'ROUTING_ENGINE_VERSION'],
      'safe-osrm-v1',
    ),
    safeRoutingProfileVersion: resolveConfigValue(
      ['SAFE_ROUTING_PROFILE_VERSION', 'ROUTING_PROFILE_VERSION'],
      'safety-profile-v1',
    ),
    fastRoutingEngineVersion: resolveConfigValue(
      ['FAST_ROUTING_ENGINE_VERSION'],
      'mapbox-directions-cycling-v5',
    ),
    fastRoutingProfileVersion: resolveConfigValue(
      ['FAST_ROUTING_PROFILE_VERSION'],
      'mapbox-cycling',
    ),
    mapDataVersion: resolveConfigValue(['MAP_DATA_VERSION'], 'osm-europe-current'),
    riskModelVersion: resolveConfigValue(['RISK_MODEL_VERSION'], 'risk-model-v1'),
  },
} as const;
