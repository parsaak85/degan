import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';

export async function reminderStatus() {
  if (Platform.OS !== 'android') return {notifications:true,exact:true};
  return requireOptionalNativeModule('DeganDevice')?.reminderStatus() || {notifications:false,exact:false};
}
export async function openReminderSettings() {
  await requireOptionalNativeModule('DeganDevice')?.openReminderSettings();
}

export async function assertVpnOff() {
  if (Platform.OS !== 'android') return;
  const device = requireOptionalNativeModule('DeganDevice');
  if (!device) throw new Error('برای بررسی اتصال، نسخه جدید APK را نصب کنید.');
  if (await device.isVpnActive()) throw new Error('لطفاً VPN یا فیلترشکن را خاموش کنید و دوباره وارد شوید.');
}

export async function openPaymentForm(action, fields) {
  const device = requireOptionalNativeModule('DeganDevice');
  if (!device) throw new Error('باز کردن فرم پرداخت به نسخه جدید APK نیاز دارد.');
  await device.openPaymentForm(action, fields);
}
