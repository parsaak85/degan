const { withAndroidManifest, withDangerousMod, AndroidConfig } = require('expo/config-plugins');
const fs = require('node:fs/promises');
const path = require('node:path');

const ICON = 'degan_launcher_v4';
const ALIAS = '.DeganLauncherV4';

module.exports = function withLauncherIcon(config) {
  config = withAndroidManifest(config, (mod) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(mod.modResults);
    const main = app.activity.find((item) => item.$['android:name'] === '.MainActivity');
    if (!main) throw new Error('Cannot find MainActivity for the launcher icon');
    app.$['android:icon'] = `@mipmap/${ICON}`;
    app.$['android:roundIcon'] = `@mipmap/${ICON}`;
    main.$['android:icon'] = `@mipmap/${ICON}`;
    // A new component identity lets Android refresh launcher caches on upgrade.
    // Keep MainActivity available for existing shortcuts and notification taps.
    main['intent-filter'] = (main['intent-filter'] || []).filter((filter) =>
      !(filter.category || []).some((category) => category.$['android:name'] === 'android.intent.category.LAUNCHER'));
    app['activity-alias'] = (app['activity-alias'] || []).filter((item) => !String(item.$['android:name']).includes('DeganLauncherV'));
    app['activity-alias'].push({
      $: { 'android:name': ALIAS, 'android:targetActivity': '.MainActivity',
        'android:enabled': 'true', 'android:exported': 'true',
        'android:icon': `@mipmap/${ICON}`, 'android:label': '@string/app_name' },
      'intent-filter': [{
        action: [{ $: { 'android:name': 'android.intent.action.MAIN' } }],
        category: [{ $: { 'android:name': 'android.intent.category.LAUNCHER' } }],
      }],
    });
    return mod;
  });
  return withDangerousMod(config, ['android', async (mod) => {
    const assets = path.join(mod.modRequest.projectRoot, 'assets');
    const res = path.join(mod.modRequest.platformProjectRoot, 'app/src/main/res');
    // Remove only our own obsolete generated icon files, whose old color references are no longer emitted.
    for (const dir of await fs.readdir(res, { withFileTypes: true })) {
      if (!dir.isDirectory()) continue;
      for (const name of await fs.readdir(path.join(res, dir.name))) {
        if (/^degan_launcher(?:_foreground|_monochrome)?_v[0-9]+\.(?:png|xml)$/.test(name) && !name.includes('_v4.')) await fs.unlink(path.join(res, dir.name, name));
      }
    }
    for (const density of ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi']) {
      const target = path.join(res, `mipmap-${density}`);
      await fs.mkdir(target, { recursive: true });
      await fs.copyFile(path.join(assets, `launcher-v4/${density}.png`), path.join(target, `${ICON}.png`));
    }
    const drawable = path.join(res, 'drawable-nodpi');
    await fs.mkdir(drawable, { recursive: true });
    await fs.copyFile(path.join(assets, 'launcher-foreground-v4.png'), path.join(drawable, 'degan_launcher_foreground_v4.png'));
    await fs.copyFile(path.join(assets, 'launcher-monochrome-v4.png'), path.join(drawable, 'degan_launcher_monochrome_v4.png'));
    for (const [folder, monochrome] of [['mipmap-anydpi-v26', false], ['mipmap-anydpi-v33', true]]) {
      const target = path.join(res, folder);
      await fs.mkdir(target, { recursive: true });
      await fs.writeFile(path.join(target, `${ICON}.xml`), `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
  <background android:drawable="@color/degan_launcher_background_v4" />
  <foreground android:drawable="@drawable/degan_launcher_foreground_v4" />
  ${monochrome ? '<monochrome android:drawable="@drawable/degan_launcher_monochrome_v4" />' : ''}
</adaptive-icon>
`);
    }
    await fs.writeFile(path.join(res, 'values/degan_launcher.xml'), '<resources><color name="degan_launcher_background_v4">#3D574E</color></resources>\n');
    return mod;
  }]);
};
