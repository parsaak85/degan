import { requireOptionalNativeModule } from 'expo-modules-core';
import { beforeLoadScript, huntScript, panelUrl, stopHuntScript } from './pageScripts';
import { installWebsiteBridge } from './websiteBridge';
import { weekNavigationScript } from './weekNavigation';

// Native Android drives the same mounted website, never a second buyer/session.
export function huntConfiguration(foods, start, selfId) {
  return JSON.stringify({ foods, start, panelUrl:panelUrl(selfId),
    bridge:installWebsiteBridge(), before:beforeLoadScript(), stop:stopHuntScript(), week:weekNavigationScript(start),
    hunt:huntScript([], '', null, []).replace('var wanted = [];','var wanted = __DEGAN_INDICES__;')
      .replace('var targets=[];','var targets=__DEGAN_TARGETS__;') });
}
export async function startBackgroundHunt(foods,start,selfId) {
  const module=requireOptionalNativeModule('DeganDevice');
  if(!module?.startHunt)throw new Error('برای شکار پس‌زمینه، APK جدید را نصب کنید.');
  await module.startHunt(huntConfiguration(foods,start,selfId));
}
export async function stopBackgroundHunt() { await requireOptionalNativeModule('DeganDevice')?.stopHunt(); }
export async function backgroundHuntState() { return requireOptionalNativeModule('DeganDevice')?.huntState(); }
