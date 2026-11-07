const { withAppBuildGradle } = require('expo/config-plugins');

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, mod => {
    const marker = '// @generated-degan-release-signing';
    if (!mod.modResults.contents.includes(marker)) {
      mod.modResults.contents += `
${marker}
def deganKeystorePath = System.getenv("DEGAN_KEYSTORE_PATH")
if (deganKeystorePath) {
    android.signingConfigs.create("deganRelease") {
        storeFile file(deganKeystorePath)
        storePassword System.getenv("DEGAN_KEYSTORE_PASSWORD")
        keyAlias System.getenv("DEGAN_KEY_ALIAS")
        keyPassword System.getenv("DEGAN_KEY_PASSWORD")
    }
    android.buildTypes.release.signingConfig = android.signingConfigs.deganRelease
}
`;
    }
    return mod;
  });
};
