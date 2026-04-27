/**
 * withAndroidNetworkSecurityConfig
 *
 * Replaces the previous app-wide `android:usesCleartextTraffic="true"` flag
 * with a domain-scoped network security config. This:
 *
 *   - Bans cleartext (HTTP) globally — `cleartextTrafficPermitted="false"`.
 *   - Allows cleartext only for the OSRM server IPs (34.116.139.172) so the
 *     existing routing requests keep working until TLS is provisioned in
 *     front of OSRM (item 6 long-term).
 *
 * Mechanism:
 *   1. Write `android/app/src/main/res/xml/network_security_config.xml`
 *      using `withDangerousMod` (the only Expo hook that writes raw files).
 *   2. Set `android:networkSecurityConfig="@xml/network_security_config"`
 *      on the `<application>` node via `withAndroidManifest`.
 *   3. Remove `android:usesCleartextTraffic` (now controlled by the XML).
 *
 * Idempotent — safe to re-run.
 *
 * Pattern based on plugins/withAndroidForegroundServiceLocation.js + the
 * Expo config-plugins `withDangerousMod` documentation.
 */
const fs = require('fs');
const path = require('path');
const {
  createRunOncePlugin,
  withAndroidManifest,
  withDangerousMod,
} = require('@expo/config-plugins');

const NETWORK_SECURITY_CONFIG_RESOURCE = 'network_security_config';

const buildXml = (allowedDomains) => {
  const domainBlocks = allowedDomains
    .map(
      (domain) =>
        `    <domain-config cleartextTrafficPermitted="true">\n` +
        `        <domain includeSubdomains="false">${domain}</domain>\n` +
        `    </domain-config>`,
    )
    .join('\n');

  return (
    `<?xml version="1.0" encoding="utf-8"?>\n` +
    `<network-security-config>\n` +
    `    <base-config cleartextTrafficPermitted="false" />\n` +
    `${domainBlocks}\n` +
    `</network-security-config>\n`
  );
};

const withResource = (config, allowedDomains) =>
  withDangerousMod(config, [
    'android',
    async (modConfig) => {
      const xmlDir = path.join(
        modConfig.modRequest.platformProjectRoot,
        'app',
        'src',
        'main',
        'res',
        'xml',
      );
      fs.mkdirSync(xmlDir, { recursive: true });
      const filePath = path.join(xmlDir, `${NETWORK_SECURITY_CONFIG_RESOURCE}.xml`);
      fs.writeFileSync(filePath, buildXml(allowedDomains));
      return modConfig;
    },
  ]);

const withManifestAttribute = (config) =>
  withAndroidManifest(config, (configWithManifest) => {
    const application = configWithManifest.modResults.manifest.application?.[0];

    if (!application) {
      return configWithManifest;
    }

    if (!application.$) {
      application.$ = {};
    }

    application.$['android:networkSecurityConfig'] = `@xml/${NETWORK_SECURITY_CONFIG_RESOURCE}`;
    delete application.$['android:usesCleartextTraffic'];

    return configWithManifest;
  });

const withAndroidNetworkSecurityConfig = (config, props = {}) => {
  const allowedDomains =
    Array.isArray(props.allowedCleartextDomains) && props.allowedCleartextDomains.length > 0
      ? props.allowedCleartextDomains
      : ['34.116.139.172'];

  let modified = withResource(config, allowedDomains);
  modified = withManifestAttribute(modified);
  return modified;
};

module.exports = createRunOncePlugin(
  withAndroidNetworkSecurityConfig,
  'with-android-network-security-config',
  '1.0.0',
);
