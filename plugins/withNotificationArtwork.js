const { withAndroidManifest, withDangerousMod, withStringsXml, AndroidConfig } = require('expo/config-plugins');
const fs = require('node:fs/promises');
const path = require('node:path');

module.exports = function withNotificationArtwork(config) {
  config = withAndroidManifest(config, (mod) => {
    const manifest = mod.modResults.manifest;
    manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(mod.modResults);
    application.receiver = (application.receiver || []).filter((receiver) => ![
      'expo.modules.notifications.service.NotificationsService',
      '.DeganNotificationsService',
    ].includes(receiver.$['android:name']));
    application.receiver.push({
      $: { 'android:name': 'expo.modules.notifications.service.NotificationsService', 'tools:node': 'remove' },
    }, {
      $: { 'android:name': '.DeganNotificationsService', 'android:enabled': 'true', 'android:exported': 'false' },
      'intent-filter': [{
        action: [
          'expo.modules.notifications.NOTIFICATION_EVENT',
          'android.intent.action.BOOT_COMPLETED',
          'android.intent.action.REBOOT',
          'android.intent.action.QUICKBOOT_POWERON',
          'com.htc.intent.action.QUICKBOOT_POWERON',
          'android.intent.action.MY_PACKAGE_REPLACED',
        ].map((name) => ({ $: { 'android:name': name } })),
      }],
    });
    return mod;
  });

  config = withStringsXml(config, (mod) => {
    mod.modResults = AndroidConfig.Strings.setStringItem([
      { $: { name: 'degan_reserve_reminder_accessibility', translatable: 'false' }, _: 'سلف لعنتی را رزرو کنید' },
    ], mod.modResults);
    return mod;
  });

  return withDangerousMod(config, ['android', async (mod) => {
    const androidRoot = mod.modRequest.platformProjectRoot;
    const mainRoot = path.join(androidRoot, 'app/src/main');
    const packageName = mod.android.package;
    const sourceRoot = path.join(mainRoot, 'java', ...packageName.split('.'));
    const resourceRoot = path.join(mainRoot, 'res');
    await fs.mkdir(sourceRoot, { recursive: true });
    await fs.mkdir(path.join(resourceRoot, 'drawable-nodpi'), { recursive: true });
    await fs.mkdir(path.join(resourceRoot, 'layout'), { recursive: true });
    const source = await fs.readFile(path.join(__dirname, 'notification-artwork/DeganNotificationsService.kt'), 'utf8');
    await fs.writeFile(path.join(sourceRoot, 'DeganNotificationsService.kt'), source.replaceAll('__PACKAGE__', packageName));
    await fs.copyFile(path.join(mod.modRequest.projectRoot, 'assets/reserve-notification.png'), path.join(resourceRoot, 'drawable-nodpi/degan_reserve_reminder.png'));
    for (const [variant, height] of [['compact', 48], ['expanded', 120]]) {
      await fs.writeFile(path.join(resourceRoot, `layout/degan_notification_${variant}.xml`), `<?xml version="1.0" encoding="utf-8"?>
<FrameLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:layout_width="match_parent" android:layout_height="${height}dp">
    <ImageView android:id="@+id/degan_notification_image"
        android:layout_width="match_parent" android:layout_height="match_parent"
        android:src="@drawable/degan_reserve_reminder" android:scaleType="fitCenter"
        android:contentDescription="@string/degan_reserve_reminder_accessibility" />
</FrameLayout>
`);
    }
    return mod;
  }]);
};
