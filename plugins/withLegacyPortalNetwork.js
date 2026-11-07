const { withAndroidManifest, withDangerousMod, AndroidConfig } = require('expo/config-plugins');
const fs = require('node:fs/promises');
const path = require('node:path');
module.exports = function withLegacyPortalNetwork(config) {
  config = withAndroidManifest(config, (mod) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(mod.modResults);
    app.$['android:networkSecurityConfig'] = '@xml/legacy_portal_network';
    return mod;
  });
  return withDangerousMod(config, ['android', async (mod) => {
    const folder = path.join(mod.modRequest.platformProjectRoot, 'app/src/main/res/xml');
    await fs.mkdir(folder, { recursive: true });
    await fs.writeFile(path.join(folder, 'legacy_portal_network.xml'), `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <base-config cleartextTrafficPermitted="false" />
  <domain-config cleartextTrafficPermitted="true">
    <domain includeSubdomains="false">food.guilan.ac.ir</domain>
  </domain-config>
</network-security-config>`);
    return mod;
  }]);
};
