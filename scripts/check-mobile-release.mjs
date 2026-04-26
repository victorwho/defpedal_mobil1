import { readFileSync } from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();

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

const fail = (message) => {
  console.error(`ERROR: ${message}`);
  process.exit(1);
};

const readJson = (filePath) => JSON.parse(readFileSync(filePath, 'utf8'));

const readEnvKeys = (filePath) => {
  const lines = readFileSync(filePath, 'utf8').split(/\r?\n/);

  return new Set(
    lines
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => line.slice(0, line.indexOf('='))),
  );
};

const args = parseArgs(process.argv.slice(2));
const platform = args.platform;
const profile = args.profile;
const autoSubmit = (args['auto-submit'] ?? 'false') === 'true';
const nativeValidationRef = (args['native-validation-ref'] ?? '').trim();
const releaseNotesRef = (args['release-notes-ref'] ?? '').trim();
const confirmStoreReadiness = (args['confirm-store-readiness'] ?? 'false') === 'true';

if (!['android', 'ios'].includes(platform)) {
  fail(`Unsupported platform "${platform ?? ''}". Expected android or ios.`);
}

if (!['preview', 'production'].includes(profile)) {
  fail(`Unsupported profile "${profile ?? ''}". Expected preview or production.`);
}

const easConfigPath = path.join(repoRoot, 'apps', 'mobile', 'eas.json');
const envExamplePath = path.join(repoRoot, 'apps', 'mobile', '.env.example');

const easConfig = readJson(easConfigPath);
const envKeys = readEnvKeys(envExamplePath);

const buildProfile = easConfig.build?.[profile];

if (!buildProfile) {
  fail(`Missing build profile "${profile}" in apps/mobile/eas.json.`);
}

const expectedBuildEnvByProfile = {
  preview: {
    APP_VARIANT: 'preview',
    EXPO_PUBLIC_APP_ENV: 'staging',
  },
  production: {
    APP_VARIANT: 'production',
    EXPO_PUBLIC_APP_ENV: 'production',
  },
};

for (const [key, expectedValue] of Object.entries(expectedBuildEnvByProfile[profile])) {
  const actualValue = buildProfile.env?.[key];

  if (actualValue !== expectedValue) {
    fail(
      `Build profile "${profile}" must set ${key}=${expectedValue} in apps/mobile/eas.json. Found ${actualValue ?? 'undefined'}.`,
    );
  }
}

const requiredEnvKeys = [
  'EXPO_PUBLIC_MOBILE_API_URL',
  'EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN',
  'RNMAPBOX_MAPS_DOWNLOAD_TOKEN',
  'EXPO_PUBLIC_SUPABASE_URL',
  'EXPO_PUBLIC_SUPABASE_ANON_KEY',
  'APP_VARIANT',
  'EXPO_PUBLIC_APP_ENV',
];

for (const key of requiredEnvKeys) {
  if (!envKeys.has(key)) {
    fail(`apps/mobile/.env.example is missing required release key "${key}".`);
  }
}

if (autoSubmit) {
  if (!confirmStoreReadiness) {
    fail('Auto-submit requires --confirm-store-readiness true.');
  }

  const submitProfile = easConfig.submit?.[profile]?.[platform];

  if (!submitProfile) {
    fail(`Missing submit config for ${platform}/${profile} in apps/mobile/eas.json.`);
  }
}

if (platform === 'android' && profile === 'preview') {
  const previewTrack = easConfig.submit?.preview?.android?.track;

  if (previewTrack !== 'internal') {
    fail(`Preview Android submits must target track=internal. Found ${previewTrack ?? 'undefined'}.`);
  }
}

if (platform === 'android' && profile === 'production') {
  const submitConfig = easConfig.submit?.production?.android ?? {};

  if (submitConfig.track !== 'production') {
    fail(`Production Android submits must target track=production. Found ${submitConfig.track ?? 'undefined'}.`);
  }

  if (submitConfig.releaseStatus !== 'draft') {
    fail(
      `Production Android submits must keep releaseStatus=draft. Found ${submitConfig.releaseStatus ?? 'undefined'}.`,
    );
  }

  // Compliance: Play Store rejects APK uploads for new apps. Production builds
  // must produce an AAB. EAS defaults to app-bundle when buildType is omitted,
  // but we require it explicitly so accidental drift is loud.
  const buildType = easConfig.build?.production?.android?.buildType;

  if (buildType !== 'app-bundle') {
    fail(
      `Production Android builds must set android.buildType="app-bundle" in eas.json. ` +
        `Found ${buildType ?? 'undefined'}. APK uploads are rejected by Google Play.`,
    );
  }
}

if (profile === 'production' && !nativeValidationRef) {
  fail('Production releases require --native-validation-ref.');
}

if (profile === 'production' && !releaseNotesRef) {
  fail('Production releases require --release-notes-ref.');
}

if (platform === 'ios' && !nativeValidationRef) {
  fail('iOS releases require --native-validation-ref until an iPhone smoke pass is documented.');
}

console.log('Mobile release preflight passed.');
console.log(`platform=${platform}`);
console.log(`profile=${profile}`);
console.log(`autoSubmit=${autoSubmit}`);
console.log(`nativeValidationRef=${nativeValidationRef || '(not provided)'}`);
console.log(`releaseNotesRef=${releaseNotesRef || '(not provided)'}`);
