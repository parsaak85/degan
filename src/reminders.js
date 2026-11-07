import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

const REMINDER_ID = 'degan-thursday-reserve';
const CHANNEL_ID = 'reserve';
const ARTWORK_VERSION = 1;

function reminderContent(kind) {
  return {
    title: 'دگان',
    // Android displays the bundled picture through DeganNotificationsService.
    // Keep text as an accessible description and a fallback on other platforms.
    body: 'سلف لعنتی را رزرو کنید',
    color: '#3D574E',
    sound: 'default',
    data: { kind, artworkVersion: ARTWORK_VERSION, scheduleVersion: 2 },
  };
}

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function ensureNotificationPermission() {
  if (Platform.OS === 'web') return false;

  // Android 13 does not show its permission prompt until a channel exists.
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'یادآوری رزرو',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
    });
  }

  const current = await Notifications.getPermissionsAsync();
  let status = current.status;
  if (status !== 'granted') {
    status = (await Notifications.requestPermissionsAsync()).status;
  }
  if (status !== 'granted') return false;

  return true;
}

export async function scheduleThursdayReminder({ force = false } = {}) {
  if (Platform.OS === 'web') return false;
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const id = REMINDER_ID;
  await Promise.all(scheduled.filter(item => item.identifier !== id &&
    (item.identifier === REMINDER_ID || ['test','thursday'].includes(item.content?.data?.kind)))
    .map(item => Notifications.cancelScheduledNotificationAsync(item.identifier)));
  if (!(await ensureNotificationPermission())) return false;
  const existing = scheduled.find(item => item.identifier === id);
  if (existing && !force && existing.content?.data?.scheduleVersion === 3) return true;
  if (existing) await Notifications.cancelScheduledNotificationAsync(id);
  await Notifications.scheduleNotificationAsync({
    identifier: id,
    content: { ...reminderContent('thursday'), data: { kind:'thursday', artworkVersion:ARTWORK_VERSION, scheduleVersion:3 } },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.WEEKLY, weekday:5, hour:9, minute:0, channelId:CHANNEL_ID },
  });
  return true;
}
