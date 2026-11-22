const { withAppBuildGradle } = require('expo/config-plugins');

module.exports = function withAbiSplits(config) {
  return withAppBuildGradle(config, mod => {
    const marker = '// @generated-degan-abi-splits';
    if (!mod.modResults.contents.includes(marker)) {
      mod.modResults.contents += `
${marker}
android {
    splits {
        abi {
            reset()
            enable true
            universalApk true
            include "armeabi-v7a", "arm64-v8a", "x86_64"
        }
    }
}
`;
    }
    return mod;
  });
};
