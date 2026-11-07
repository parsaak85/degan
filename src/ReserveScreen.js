import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, BackHandler, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { DESKTOP_UA, beforeLoadScript, huntScript, loginScript, openReservationPanelScript, panelUrl, stopHuntScript } from './pageScripts';
import { createPanelEntry } from './panelEntry';
import { installWebsiteBridge, websiteAction, websiteCreditClickScript } from './websiteBridge';
import { createLegacyPageClient } from './legacyPageClient';
import { weekNavigationScript, stopWeekNavigationScript } from './weekNavigation';
import { LEGACY_PANEL_PATH, PORTAL_HOST, portalNavigation, safePagePath } from './portal';
import { selfName } from './selves';
import { colors, font } from './theme';
import LowBalanceSheet from './LowBalanceSheet';
import WeeklyReservations from './WeeklyReservations';
import { createSamadClient } from './samad';
import { managedWalletBridgeScript, walletDestinationScript, disableWebsiteWalletScript, retryWalletHandoffScript } from './walletScripts';
import { walletCheckoutPath, openWalletCheckout } from './walletCheckout';
import { assertVpnOff, openPaymentForm } from './deviceNetwork';
import { blockedUrlFromText, httpErrorMessage, FIREWALL_MESSAGE } from './siteGuard';
import { canHuntFood, isHuntExpired } from './huntWindow';
import { walletBalance } from './walletBalance';
import { tomanPrice } from './prices';
import { confirmedHuntFood } from './huntConfirmation';
import { startBackgroundHunt, stopBackgroundHunt, backgroundHuntState } from './backgroundHunt';
import { ensureNotificationPermission } from './reminders';
import { initialBookingWeek, clampBookingWeek, bookingWeeks } from './siteWeek';

export default function ReserveScreen({session,onBack}) {
  const webRef=useRef(null),currentUrl=useRef(''),mounted=useRef(true),watchingRef=useRef(false);
  const phaseRef=useRef('choosing'),reloadTimer=useRef(null),verifyTimer=useRef(null),monitor=useRef(null),huntPage=useRef('');
  const loginSent=useRef(''),balanceAsked=useRef(false),monitorAttempt=useRef(0),walletOpening=useRef(false);
  const nativeHunt=useRef(false);
  const walletReturnPending=useRef(false);
  const returningPanel=useRef(false);
  const homePendingPage=useRef('');
  const [phase,setPhaseState]=useState('choosing'),[foods,setFoods]=useState([]),[selected,setSelected]=useState([]);
  const [checks,setChecks]=useState(0),[error,setError]=useState(''),[boughtIndex,setBoughtIndex]=useState(null),[reserved,setReserved]=useState(false);
  const [showSite,setShowSite]=useState(false),[siteUrl,setSiteUrl]=useState(''),[canGoBack,setCanGoBack]=useState(false),[canGoForward,setCanGoForward]=useState(false);
  const [lowBalance,setLowBalance]=useState(null),[reservationRevision,setReservationRevision]=useState(0),[selectedWeek,setSelectedWeek]=useState(initialBookingWeek);
  const [webGeneration,setWebGeneration]=useState(0);
  const [balanceRials,setBalanceRials]=useState(null);
  const [walletMode,setWalletMode]=useState(false),[walletTransfer,setWalletTransfer]=useState(false),transferTimer=useRef(null);
  const walletModeRef=useRef(false),walletEntryPage=useRef(''),walletHandingOff=useRef(false);
  const panelEntry=useRef(null);
  if(panelEntry.current===null)panelEntry.current=createPanelEntry();
  const webActivated=true;
  const startUrl=useMemo(()=>panelUrl(session.selfId),[session.selfId]);
  const webSource=useMemo(()=>({uri:startUrl}),[startUrl]);
  const qrBackend=useMemo(()=>createSamadClient(session),[session]);
  const setPhase=useCallback(value=>{phaseRef.current=value;setPhaseState(value);},[]);
  const clearReload=useCallback(()=>{if(reloadTimer.current)clearTimeout(reloadTimer.current);reloadTimer.current=null;},[]);
  const read=useCallback(()=>webRef.current?.injectJavaScript(installWebsiteBridge()),[]);
  // The factory stores these event callbacks; it never invokes browser refs during render.
  /* eslint-disable react-hooks/refs */
  const client=useMemo(()=>createLegacyPageClient({
    read,
    navigateWeek:(start,options)=>webRef.current?.injectJavaScript(weekNavigationScript(start,options)),
    stopNavigation:()=>webRef.current?.injectJavaScript(stopWeekNavigationScript),
    send:request=>webRef.current?.injectJavaScript(websiteAction(request)),
    // A refresh must never replay a reservation POST via WebView.reload().
    reload:()=>webRef.current?.injectJavaScript(openReservationPanelScript(session.selfId)),
    qr:async(food,start)=>{
      await assertVpnOff();
      let row=food;
      if(!(Number(row.id)>0)) {
        const reports=await qrBackend.reservations(start);
        row=reports.find(item=>String(item.programId)===String(food.programId)&&item.date===food.date&&!item.sold);
      }
      if(!row)throw new Error('شناسه رزرو برای دریافت QR پیدا نشد.');
      return qrBackend.qr(row);
    },
  }),[read,qrBackend,session.selfId]);
  /* eslint-enable react-hooks/refs */
  const clearWalletMode=useCallback(()=>{
    walletModeRef.current=false;walletEntryPage.current='';walletHandingOff.current=false;setWalletMode(false);
    clearTimeout(transferTimer.current);setWalletTransfer(false);
    webRef.current?.injectJavaScript(disableWebsiteWalletScript);
  },[]);
  const beginWalletMode=useCallback(()=>{
    if(!walletModeRef.current)walletEntryPage.current=client.getSnapshot()?.pageId||'';
    walletModeRef.current=true;setWalletMode(true);setShowSite(true);setLowBalance(null);setError('');
  },[client]);
  const stopWatching=useCallback(()=>{
    if(nativeHunt.current){nativeHunt.current=false;stopBackgroundHunt().catch(()=>{});}
    monitorAttempt.current+=1;
    watchingRef.current=false;monitor.current=null;clearReload();huntPage.current='';
    if(verifyTimer.current)clearTimeout(verifyTimer.current);verifyTimer.current=null;
    webRef.current?.injectJavaScript(stopHuntScript());webRef.current?.injectJavaScript(stopWeekNavigationScript);
    if(['boot','watching','verifying'].includes(phaseRef.current))setPhase('choosing');
  },[clearReload,setPhase]);
  const fail=useCallback(message=>{stopWatching();setError(message);setPhase('error');},[stopWatching,setPhase]);
  const complete=useCallback(food=>{
    watchingRef.current=false;clearReload();if(verifyTimer.current)clearTimeout(verifyTimer.current);verifyTimer.current=null;
    webRef.current?.injectJavaScript(stopHuntScript());setBoughtIndex(food.index);setReserved(true);setReservationRevision(value=>value+1);setPhase('done');
  },[clearReload,setPhase]);
  const returnToMain=useCallback(()=>{
    setShowSite(false);setError('');
    if(nativeHunt.current){read();return;}
    clearWalletMode();
    const snapshot=client.getSnapshot();
    if(snapshot?.kind==='login'){onBack();return;}
    stopWatching();setPhase('choosing');setBoughtIndex(null);
    client.reset();setReservationRevision(value=>value+1);
    let inPanel=false;
    try{inPanel=new URL(currentUrl.current).pathname===LEGACY_PANEL_PATH&&snapshot?.kind==='panel';}catch{}
    if(inPanel)read();else{
      returningPanel.current={from:snapshot?.pageId};
      webRef.current?.injectJavaScript(openReservationPanelScript(session.selfId));
    }
  },[client,onBack,read,session.selfId,setPhase,stopWatching,clearWalletMode]);
  const refreshHome=useCallback(()=>{
    if(nativeHunt.current)return;
    clearWalletMode();
    client.rejectSync('در حال تازه‌سازی پنل رزرو.');
    client.invalidate({currentWeek:true});
    setSelectedWeek(bookingWeeks().current);setBalanceRials(null);setLowBalance(null);
    setShowSite(false);setError('');setBoughtIndex(null);setReserved(false);setPhase('choosing');
    setReservationRevision(value=>value+1);
  },[client,setPhase,clearWalletMode]);
  const scheduleReload=useCallback(()=>{
    if(nativeHunt.current||!watchingRef.current||reloadTimer.current)return;
    reloadTimer.current=setTimeout(()=>{reloadTimer.current=null;if(!mounted.current||!watchingRef.current||AppState.currentState!=='active')return;
      if(!monitor.current?.foods.some(food=>!isHuntExpired(food.date))){fail('مهلت شکار غذاهای انتخابی گذشته است.');return;}
      setChecks(value=>value+1);webRef.current?.reload();},0);
  },[fail]);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;if(nativeHunt.current)stopBackgroundHunt().catch(()=>{});clearReload();if(verifyTimer.current)clearTimeout(verifyTimer.current);client.dispose();};},[client,clearReload]);
  useEffect(()=>{
    let reading=false;
    const poll=async()=>{
      if(!nativeHunt.current||reading||AppState.currentState!=='active')return;
      reading=true;
      try{
        const raw=await backgroundHuntState();
        if(!mounted.current||!nativeHunt.current)return;
        const status=typeof raw==='string'?JSON.parse(raw):raw;
        if(!status)return;
        setChecks(status.checks||0);
        if(status.phase==='watching'||status.phase==='verifying')setPhase(status.phase);
        else if(status.phase==='done'){
          nativeHunt.current=false;complete(status.winner);read();
        }else if(status.phase==='error'||status.phase==='stopped'){
          nativeHunt.current=false;
          if(status.phase==='error')fail(status.message);else stopWatching();
          read();
        }
      }catch{ /* Native service remains the single owner; a UI read never retries a purchase. */ }
      finally{reading=false;}
    };
    const timer=setInterval(poll,750);
    const sub=AppState.addEventListener('change',state=>{if(state==='active')poll();});
    return()=>{clearInterval(timer);sub.remove();};
  },[complete,fail,read,setPhase,stopWatching]);
  useEffect(()=>{const sub=AppState.addEventListener('change',state=>{if(state==='active'){
    if(walletReturnPending.current){walletReturnPending.current=false;refreshHome();}
    read();if(watchingRef.current)scheduleReload();
  }else clearReload();});return()=>sub.remove();},[refreshHome,read,scheduleReload,clearReload]);
  useEffect(()=>{const sub=BackHandler.addEventListener('hardwareBackPress',()=>{
    if(showSite){if(canGoBack&&!nativeHunt.current&&!walletModeRef.current)webRef.current?.goBack();else returnToMain();return true;}
    if(watchingRef.current||phaseRef.current==='verifying'){stopWatching();return true;}onBack();return true;
  });return()=>sub.remove();},[showSite,canGoBack,returnToMain,stopWatching,onBack]);

  // The WAF can block the in-app request for the payment-method page. Its block
  // page names the blocked URL, so the normal browser handoff still proceeds.
  function handleFirewallBlock(snapshot){
    const blockedUrl=blockedUrlFromText(snapshot.blockText)||snapshot.href||'';
    if(walletModeRef.current&&walletCheckoutPath(blockedUrl)){launchWalletPayment({type:'checkout',url:blockedUrl});return;}
    client.rejectSync(FIREWALL_MESSAGE);
    if(walletModeRef.current){walletReturnPending.current=false;returnToMain();}
    setError(FIREWALL_MESSAGE);
  }
  function onMessage(event) {
    if(!mounted.current)return;
    if(nativeHunt.current)return;
    try{if(new URL(event.nativeEvent.url||currentUrl.current).hostname!==PORTAL_HOST)return;}catch{return;}
    let value;try{value=JSON.parse(event.nativeEvent.data);}catch{return;}
    if(value.scope==='degan-wallet'){
      if(value.type==='amount-error'){
        setWalletTransfer(false);setError(value.message||'مبلغ انتخابی معتبر نیست.');return;
      }
      if(value.type==='transfer'){
        // The site is moving to the payment page. Keep that page hidden: it is only
        // ever shown in the default browser.
        if(walletModeRef.current){
          setWalletTransfer(true);clearTimeout(transferTimer.current);
          transferTimer.current=setTimeout(()=>{if(mounted.current&&walletModeRef.current&&!walletHandingOff.current){setWalletTransfer(false);setError('انتقال به صفحه پرداخت کامل نشد. دوباره تلاش کنید.');}},25000);
        }
        return;
      }
      if(walletModeRef.current)launchWalletPayment(value);
      return;
    }
    if(value.scope==='degan-site-v2') {
      if(value.type==='snapshot') {
        const snapshot=value.snapshot;
        if(!snapshot||!['panel','login','website'].includes(snapshot.kind))return;
        const requested=client.pendingWeek;
        if(client.update(snapshot)===false)return;
        if(snapshot.blocked){handleFirewallBlock(snapshot);return;}
        if(walletModeRef.current){
          if(snapshot.kind==='login'){clearWalletMode();onBack();return;}
          if(snapshot.kind==='panel'&&snapshot.pageId!==walletEntryPage.current){returnToMain();}
          return;
        }
        if(returningPanel.current&&snapshot.kind==='login'){returningPanel.current=false;onBack();return;}
        if(returningPanel.current&&snapshot.kind==='website'&&snapshot.pageId!==returningPanel.current.from){returningPanel.current=false;onBack();return;}
        const home=!showSite&&phaseRef.current==='choosing';
        if(snapshot.kind==='panel'){returningPanel.current=false;homePendingPage.current='';}
        else if(home&&homePendingPage.current!==snapshot.pageId){
          homePendingPage.current=snapshot.pageId;setBalanceRials(null);setFoods([]);setReservationRevision(value=>value+1);
        }
        const entryAction=panelEntry.current.observe(snapshot,{home:home&&!returningPanel.current});
        if(entryAction==='open-panel'){
          webRef.current?.injectJavaScript(openReservationPanelScript(session.selfId));return;
        }
        if(entryAction==='failed'){
          const message='ورود انجام شد، اما صفحه رزرو باز نشد. صفحه سایت را بررسی کنید.';
          client.rejectSync(message);setError(message);setShowSite(true);return;
        }
        if(snapshot.kind==='login') {
          if(!loginSent.current){loginSent.current=snapshot.pageId;assertVpnOff().then(()=>{if(mounted.current)webRef.current?.injectJavaScript(loginScript(session.username,session.password));}).catch(reason=>{if(mounted.current){Alert.alert('اتصال VPN',reason.message);onBack();}});}
          else if(loginSent.current!==snapshot.pageId){setError('ورود به سایت کامل نشد. فرم سایت را بررسی کنید.');setShowSite(true);}
          return;
        }
        if(snapshot.kind!=='panel')return;
        loginSent.current='';
        if(showSite&&!requested&&!snapshot.navigating&&!watchingRef.current&&phaseRef.current!=='verifying'&&snapshot.weekStart)setSelectedWeek(clampBookingWeek(snapshot.weekStart));
        setFoods(snapshot.foods);setError(snapshot.siteMessage||'');
        if(snapshot.dialog)setShowSite(true);
        const wallet=walletBalance(snapshot);
        setBalanceRials(wallet.balanceRials);
        if(wallet.low&&!balanceAsked.current&&!watchingRef.current&&!monitor.current&&!snapshot.navigating&&!client.pendingWeek&&!walletOpening.current){balanceAsked.current=true;setLowBalance({balance:wallet.balanceRials,creditUrl:snapshot.creditUrl});}
        const target=monitor.current;
        if(target&&(watchingRef.current||phaseRef.current==='verifying')) {
          if(snapshot.weekStart!==target.start){fail('هفته صفحه سایت تغییر کرد.');return;}
          const candidates=target.foods.map(food=>snapshot.foods.find(item=>item.key===food.key)).filter(Boolean);
          const purchased=candidates.find(food=>food.reserved);
          if(purchased){complete(purchased);return;}
          const eligible=candidates.filter(food=>canHuntFood(food,snapshot.foods));
          if(watchingRef.current&&!eligible.length){fail('غذای قابل شکار از انتخاب‌های شما باقی نمانده است.');return;}
          if(watchingRef.current&&huntPage.current!==snapshot.pageId){huntPage.current=snapshot.pageId;setSelected(eligible.map(food=>food.index));webRef.current?.injectJavaScript(huntScript(eligible.map(food=>food.index),'',null,eligible));}
        }
      } else if(value.type==='result'){
        if(value.id==='degan-credit-open'&&!value.ok){clearWalletMode();setError(value.message||'دکمه افزایش اعتبار در سایت پیدا نشد.');}
        else client.result(value);
      }
      else if(value.type==='waiting'){client.result({...value,ok:false});setError(value.message);}
      else if(value.type==='show-site')setShowSite(true);
      return;
    }
    if(value.type==='wallet-opened'){beginWalletMode();return;}
    if(value.type==='week-ready'){read();return;}
    if(value.type==='week-error'){client.rejectSync(value.message);setError(value.message);return;}
    if(value.type==='login-page'){read();return;}
    if(value.type==='miss'){scheduleReload();return;}
    if(value.type==='hunt-expired'){fail('مهلت شکار این روز گذشته است.');return;}
    if(value.type==='bought') {
      if(!watchingRef.current)return;
      watchingRef.current=false;clearReload();webRef.current?.injectJavaScript(stopHuntScript());setPhase('verifying');read();
      const target=monitor.current;
      // This timestamp is taken only when a WebView purchase message arrives.
      // eslint-disable-next-line react-hooks/purity
      const deadline=Date.now()+25000;
      const verify=async()=>{
        if(!mounted.current||phaseRef.current!=='verifying'||monitor.current!==target)return;
        try {
          const reports=await qrBackend.reservations(target.start);
          if(!mounted.current||phaseRef.current!=='verifying'||monitor.current!==target)return;
          const purchased=confirmedHuntFood(target.foods,reports);
          if(purchased){complete(purchased);return;}
        }catch{/* A failed read is not purchase confirmation. Never retry a write. */}
        if(!mounted.current||phaseRef.current!=='verifying')return;
        if(Date.now()>=deadline){fail('ثبت خرید در سایت تأیید نشد. نمایش سایت را بررسی کنید.');return;}
        read();verifyTimer.current=setTimeout(verify,2000);
      };
      verifyTimer.current=setTimeout(verify,1000);
      return;
    }
    if(['session-lost','day-reserved','target-changed'].includes(value.type))fail('صفحه یا وضعیت رزرو تغییر کرد. دوباره غذا را انتخاب کنید.');
  }
  function onLoadEnd(event) {
    const url=event?.nativeEvent?.url||currentUrl.current;
    if(walletModeRef.current&&walletCheckoutPath(url)){launchWalletPayment({type:'checkout',url});return;}
    try{if(new URL(url).hostname===PORTAL_HOST){webRef.current?.injectJavaScript(beforeLoadScript()+managedWalletBridgeScript());read();}}catch{}
  }
  const launchWalletPayment=useCallback(async(value)=>{
    if(walletHandingOff.current)return;
    if(!['post','get','checkout'].includes(value.type)){setError('فرم درگاه پرداخت معتبر نیست.');return;}
    if(value.type==='get'&&!/^https?:\/\//i.test(value.url||'')){setError('لینک درگاه پرداخت معتبر نیست.');return;}
    walletHandingOff.current=true;walletReturnPending.current=true;
    setWalletTransfer(true);setError('');clearTimeout(transferTimer.current);
    try{
      if(value.type==='checkout'){
        const opened=await openWalletCheckout(value.url,{
          client:qrBackend,open:url=>Linking.openURL(url),
          active:()=>mounted.current&&walletModeRef.current&&walletHandingOff.current,
        });
        if(!opened)return;
      }else if(value.type==='post')await openPaymentForm(value.action,value.fields);
      else await Linking.openURL(value.url);
      // Keep the authenticated WebView idle until Chrome completes the handoff.
      // On returning to this app, AppState refreshHome restores the main panel.
      if(mounted.current&&value.type!=='checkout')returnToMain();
    }catch(reason){
      walletHandingOff.current=false;walletReturnPending.current=false;setWalletTransfer(false);
      webRef.current?.injectJavaScript(retryWalletHandoffScript);
      if(mounted.current)setError(/[\u0600-\u06ff]/.test(reason?.message||'')?reason.message:'مرورگر پرداخت باز نشد. به برنامه برگردید و دوباره تلاش کنید.');
    }
  },[returnToMain,qrBackend]);
  async function startMonitoring(foods,start) {
    const attempt=++monitorAttempt.current;
    setError('');setChecks(0);setBoughtIndex(null);setReserved(false);setPhase('boot');
    try {
      const snapshot=await client.ensureWeek(start);
      if(!mounted.current||attempt!==monitorAttempt.current)return;
      const rows=foods.map(food=>snapshot.foods.find(item=>item.key===food.key));
      if(!rows.length||rows.some(row=>!canHuntFood(row,snapshot.foods))||snapshot.dirty||snapshot.pending||snapshot.dialog)throw new Error('فهرست غذاهای قابل شکار تغییر کرده است. دوباره انتخاب کنید.');
      if(rows.some(row=>snapshot.foods.some(item=>item.date===row.date&&item.reserved)))throw new Error('برای یکی از روزهای انتخابی غذا رزرو شده است.');
      nativeHunt.current=Platform.OS==='android';
      monitor.current={foods:rows,start};watchingRef.current=true;huntPage.current=snapshot.pageId;setFoods(snapshot.foods);setSelected(rows.map(row=>row.index));setPhase('watching');
      if(Platform.OS==='android'){
        if(!(await ensureNotificationPermission()))throw new Error('برای شکار پس‌زمینه، مجوز اعلان را فعال کنید.');
        if(!mounted.current||attempt!==monitorAttempt.current)return;
        nativeHunt.current=true;
        await startBackgroundHunt(rows,start,session.selfId);
        if(!mounted.current||attempt!==monitorAttempt.current){await stopBackgroundHunt();nativeHunt.current=false;return;}
      }else webRef.current?.injectJavaScript(huntScript(rows.map(row=>row.index),'',null,rows));
    } catch(error){if(mounted.current&&attempt===monitorAttempt.current)fail(error.message||'صفحه سایت آماده نشد.');}
  }
  function openSite(){setShowSite(true);read();}
  function closeSite(){returnToMain();}
  function openSamad(){openSite();}
  async function openOutside(url){try{await Linking.openURL(url);}catch{Alert.alert('مرورگر باز نشد','لینک را دوباره از سایت باز کنید.');}}
  async function openCredit(){
    if(walletOpening.current)return;
    walletOpening.current=true;
    stopWatching();
    setShowSite(false);setPhase('choosing');setLowBalance(null);
    try {
      await assertVpnOff();
      await client.ensureWeek(selectedWeek);
      if(!mounted.current||AppState.currentState!=='active')return;
      beginWalletMode();
      webRef.current?.injectJavaScript(websiteCreditClickScript());
    } catch(reason) {
      walletReturnPending.current=false;
      if(mounted.current)Alert.alert('افزایش اعتبار باز نشد',/[\u0600-\u06ff]/.test(reason?.message||'')?reason.message:'صفحه سایت آماده نیست. دوباره تلاش کنید.');
    } finally {walletOpening.current=false;}
  }
  function reloadFoods(){stopWatching();refreshHome();}
  const nativeHuntActive=Platform.OS==='android'&&['watching','verifying'].includes(phase);
  const boughtFood=foods.find(food=>food.index===boughtIndex);
  const selectedFoods=selected.map(index=>foods.find(food=>food.index===index)).filter(Boolean);

  return (
    <View style={styles.root}>
      {Platform.OS !== 'web' && showSite ? (
        <SafeAreaView style={styles.siteHeader} edges={['top']}>
          <Pressable style={styles.siteBack} onPress={closeSite}>
            <Text style={styles.siteBackText}>بازگشت به برنامه</Text>
          </Pressable>
          {walletMode?<Text style={styles.headerTitle}>افزایش اعتبار</Text>:<View style={styles.siteControls}>
            <Pressable disabled={!canGoBack||nativeHuntActive} onPress={() => webRef.current?.goBack()}><Text style={[styles.siteControl, (!canGoBack||nativeHuntActive) && styles.disabled]}>قبلی</Text></Pressable>
            <Pressable disabled={!canGoForward||nativeHuntActive} onPress={() => webRef.current?.goForward()}><Text style={[styles.siteControl, (!canGoForward||nativeHuntActive) && styles.disabled]}>بعدی</Text></Pressable>
            <Pressable disabled={nativeHuntActive} onPress={refreshHome}><Text style={[styles.siteControl,nativeHuntActive&&styles.disabled]}>تازه‌سازی</Text></Pressable>
            <Pressable onPress={() => openOutside(siteUrl || startUrl)}><Text style={styles.siteControl}>مرورگر</Text></Pressable>
          </View>}
          {error ? <Text style={styles.centerText}>{error}</Text> : null}
        </SafeAreaView>
      ) : null}
      {Platform.OS === 'web' || !webActivated ? null : (
      <View style={showSite ? styles.webSlot : styles.webHidden} pointerEvents={showSite ? 'auto' : 'none'}>
      <WebView
        key={webGeneration}
        ref={webRef}
        style={styles.web}
        androidLayerType="software"
        source={webSource}
        userAgent={DESKTOP_UA}
        javaScriptEnabled domStorageEnabled incognito sharedCookiesEnabled={false} thirdPartyCookiesEnabled
        cacheEnabled={false} cacheMode="LOAD_NO_CACHE" setSupportMultipleWindows={false}
        originWhitelist={['*']}
        mixedContentMode="compatibility"
        injectedJavaScriptBeforeContentLoaded={beforeLoadScript()+managedWalletBridgeScript()}
        onLoadStart={() => { clearReload(); }}
        onLoadEnd={onLoadEnd} onMessage={onMessage}
        onNavigationStateChange={(nav) => {
          currentUrl.current=nav.url||'';setSiteUrl(nav.url||'');setCanGoBack(nav.canGoBack);setCanGoForward(nav.canGoForward);
        }}
        onError={(event) => {
          if(event.nativeEvent.code===-3)return;
          const message='بارگذاری سایت قدیمی انجام نشد ('+event.nativeEvent.code+'). '+safePagePath(event.nativeEvent.url||currentUrl.current);
          if(nativeHunt.current)return;
          client.rejectSync(message);if(watchingRef.current)fail(message);else setError(message);
        }}
        onHttpError={(event) => {const code=event.nativeEvent.statusCode;if(code>=400&&!(walletModeRef.current&&walletCheckoutPath(event.nativeEvent.url)))setError(httpErrorMessage(code));}}
        onRenderProcessGone={() => {stopWatching();client.rejectSync('صفحه مرورگر بسته شد. دوباره تازه‌سازی کنید.');setWebGeneration(value=>value+1);}}
        onShouldStartLoadWithRequest={(request) => {
          if(walletModeRef.current){
            if(walletCheckoutPath(request.url)){launchWalletPayment({type:'checkout',url:request.url});return false;}
            if(request.url==='about:blank')return false;
            try{
              const next=new URL(request.url);
              if(['http:','https:'].includes(next.protocol)&&next.hostname!==PORTAL_HOST){
                webRef.current?.injectJavaScript(walletDestinationScript(request.url));return false;
              }
            }catch{}
          }
          const next=portalNavigation(request.url);
          if(next.action==='external')openOutside(next.url);
          return next.action==='allow';
        }}
      />
      {walletMode&&walletTransfer?<View style={styles.transferCover} pointerEvents="auto">
        <ActivityIndicator color={colors.green} size="large" />
        <Text style={styles.centerText}>در حال انتقال به صفحه پرداخت در مرورگر…</Text>
      </View>:null}
      </View>
      )}

      {showSite ? null : (
        <View style={styles.overlay}>
          <SafeAreaView style={styles.flex} edges={['top', 'bottom']}>
            <View style={styles.header}>
              <Pressable onPress={['watching', 'boot', 'verifying'].includes(phase) ? stopWatching : onBack} hitSlop={8}>
                <Text style={styles.headerLink}>{['watching', 'boot', 'verifying'].includes(phase) ? 'توقف' : 'بازگشت'}</Text>
              </Pressable>
              <View style={styles.headerText}>
                <Text style={styles.headerTitle}>
                  {phase === 'watching' ? 'شکار غذا' : phase === 'done' ? 'نتیجه خرید' : phase === 'verifying' ? 'بررسی رزرو' : phase === 'boot' ? 'آماده‌سازی' : 'غذاهای من'}
                </Text>
                <Text style={styles.headerSub}>{selfName(session.selfId)} · {session.username}</Text>
              </View>
            </View>

            {Platform.OS !== 'web' ? <View style={styles.walletStrip}>
              <Pressable onPress={openCredit} hitSlop={6}><Text style={styles.walletLink}>+ افزایش اعتبار</Text></Pressable>
              <Text style={styles.walletAmount}>کیف پول: {balanceRials === null ? '—' : tomanPrice(balanceRials)}</Text>
            </View> : null}

            {Platform.OS === 'web' ? (
              <View style={styles.center}>
                <Text style={styles.errorTitle}>این کار روی گوشی انجام می‌شود</Text>
                <Text style={styles.centerText}>
                  ورود به سامانه و تازه کردن دکمه خرید داخل اپ موبایل است. در پوشه پروژه دستور npm start را بزن و با Expo Go کد را اسکن کن.
                </Text>
                <Pressable style={styles.primary} onPress={onBack}>
                  <Text style={styles.primaryText}>بازگشت</Text>
                </Pressable>
              </View>
            ) : null}

            {Platform.OS !== 'web' && ['boot', 'verifying'].includes(phase) ? (
              <View style={styles.center}>
                <ActivityIndicator color={colors.green} size="large" />
                <Text style={styles.centerText}>{phase === 'verifying' ? 'در حال بررسی رزرو در سماد…' : 'در حال آماده‌سازی صفحه…'}</Text>
                <Pressable onPress={openSite}>
                  <Text style={styles.footerLink}>نمایش سایت</Text>
                </Pressable>
              </View>
            ) : null}

            {phase === 'error' ? (
              <View style={styles.center}>
                <Text style={styles.errorTitle}>عملیات متوقف شد</Text>
                <Text style={styles.centerText}>{error}</Text>
                <Pressable style={styles.secondary} onPress={openSite}>
                  <Text style={styles.secondaryText}>نمایش سایت</Text>
                </Pressable>
                <Pressable style={styles.primary} onPress={onBack}>
                  <Text style={styles.primaryText}>اصلاح شماره و رمز</Text>
                </Pressable>
                <Pressable onPress={() => { setError(''); setPhase('choosing'); }}><Text style={styles.footerLink}>بازگشت به غذاها</Text></Pressable>
              </View>
            ) : null}

            {phase === 'choosing' ? (
              <View style={styles.flex}>
                <WeeklyReservations
                  session={session}
                  revision={reservationRevision}
                  selectedWeek={selectedWeek}
                  onWeekChange={setSelectedWeek}
                  onRefresh={refreshHome}
                  onOpenSamad={openSamad}
                  onMonitor={startMonitoring}
                  apiClient={client}
                />
                <View style={styles.footer}>
                  <Pressable onPress={openSite}><Text style={styles.footerLink}>نمایش سایت</Text></Pressable>
                </View>
              </View>
            ) : null}

            {phase === 'watching' ? (
              <View style={styles.flex}>
                <View style={styles.watch}>
                  <ActivityIndicator color={colors.terracotta} size="large" />
                  <Text style={styles.watchCount}>{checks.toLocaleString('fa-IR')}</Text>
                  <Text style={styles.centerText}>در انتظار موجود شدن غذا</Text>
                  {selectedFoods.map((food) => (
                    <Text key={food.index} style={styles.watchFood}>{food.name}</Text>
                  ))}
                </View>
                <View style={styles.footer}>
                  <Pressable onPress={openSite}>
                    <Text style={styles.footerLink}>نمایش سایت</Text>
                  </Pressable>
                  <Pressable style={styles.stop} onPress={stopWatching}>
                    <Text style={styles.primaryText}>توقف</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}

            {phase === 'done' ? (
              <View style={styles.center}>
                <Text style={styles.doneMark}>✓</Text>
                <Text style={styles.errorTitle}>{boughtFood ? boughtFood.name : 'غذا'}</Text>
                <Text style={styles.centerText}>
                  {reserved
                    ? 'رزرو غذا در سایت تأیید شد.'
                    : 'دکمه خرید زده شد. اگر ثبت نهایی نشد، سایت را باز کن.'}
                </Text>
                <Pressable style={styles.secondary} onPress={openSite}>
                  <Text style={styles.secondaryText}>نمایش سایت</Text>
                </Pressable>
                <Pressable style={styles.primary} onPress={() => { setBoughtIndex(null); reloadFoods(); }}>
                  <Text style={styles.primaryText}>غذای دیگر</Text>
                </Pressable>
              </View>
            ) : null}
          </SafeAreaView>
        </View>
      )}
      <LowBalanceSheet
        visible={lowBalance !== null}
        balance={lowBalance?.balance}
        onDismiss={() => setLowBalance(null)}
        onTopUp={() => {
          const url = lowBalance?.creditUrl || '';
          setLowBalance(null);
          openCredit(url);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  walletStrip: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 6 },
  walletLink: { fontFamily: font, color: colors.green, fontSize: 11, paddingVertical: 4 },
  walletAmount: { fontFamily: font, color: colors.muted, fontSize: 11 },
  root: { flex: 1, backgroundColor: colors.paper },
  flex: { flex: 1 },
  webSlot: { flex: 1 },
  transferCover: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: colors.paper, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 },
  webHidden: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, opacity: 0.01 },
  web: { flex: 1, backgroundColor: colors.white },
  overlay: { flex: 1, backgroundColor: colors.paper },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: 4,
    paddingBottom: 8,
  },
  headerText: { flex: 1, marginLeft: 12 },
  headerTitle: { fontFamily: font, fontSize: 18, color: colors.ink, textAlign: 'right' },
  headerSub: { fontFamily: font, fontSize: 11, color: colors.muted, textAlign: 'right', marginTop: 2 },
  headerLink: { fontFamily: font, color: colors.greenBright, fontSize: 13 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 12 },
  centerText: { fontFamily: font, color: colors.muted, fontSize: 15, textAlign: 'center', lineHeight: 26 },
  errorTitle: { fontFamily: font, color: colors.ink, fontSize: 22, textAlign: 'center' },
  list: { paddingHorizontal: 16, paddingBottom: 16 },
  dayBlock: { marginBottom: 8 },
  dayTitle: {
    fontFamily: font,
    color: colors.green,
    fontSize: 18,
    textAlign: 'right',
    marginTop: 10,
    marginBottom: 8,
  },
  dayEmpty: {
    fontFamily: font,
    color: colors.muted,
    fontSize: 13,
    textAlign: 'right',
    marginBottom: 8,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1.5,
    borderColor: colors.line,
  },
  cardOn: { borderColor: colors.green, backgroundColor: colors.leaf },
  badge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.paper,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeOn: { backgroundColor: colors.green },
  badgeText: { fontFamily: font, color: colors.ink, fontSize: 14 },
  badgeTextOn: { color: colors.white },
  cardBody: { flex: 1 },
  foodName: { fontFamily: font, color: colors.ink, fontSize: 16, textAlign: 'right' },
  reservedLabel: { fontFamily: font, color: colors.green, fontSize: 13, textAlign: 'right', marginTop: 6 },
  foodDetail: { fontFamily: font, color: colors.muted, fontSize: 12, textAlign: 'right', marginTop: 4 },
  footer: { paddingHorizontal: 16, paddingBottom: 8, gap: 10 },
  footerLink: { fontFamily: font, color: colors.greenBright, textAlign: 'center', fontSize: 14 },
  primary: {
    backgroundColor: colors.terracotta,
    borderRadius: 16,
    minHeight: 54,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  primaryOff: { opacity: 0.45 },
  primaryText: { fontFamily: font, color: colors.white, fontSize: 17 },
  secondary: {
    borderRadius: 16,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  secondaryText: { fontFamily: font, color: colors.greenBright, fontSize: 15 },
  watch: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 8 },
  watchCount: { fontFamily: font, fontSize: 48, color: colors.ink },
  watchFood: { fontFamily: font, fontSize: 18, color: colors.green, textAlign: 'center' },
  stop: {
    backgroundColor: colors.ink,
    borderRadius: 16,
    minHeight: 54,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneMark: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.leaf,
    color: colors.green,
    fontSize: 32,
    textAlign: 'center',
    lineHeight: 64,
    fontFamily: font,
    overflow: 'hidden',
  },
  siteHeader: {
    backgroundColor: colors.paper,
    paddingTop: 8,
    paddingBottom: 12,
    alignItems: 'center',
  },
  siteBack: {
    backgroundColor: colors.green,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  siteBackText: { fontFamily: font, color: colors.white, fontSize: 14 },
  siteControls: { flexDirection: 'row', justifyContent: 'space-around', alignSelf: 'stretch', marginTop: 10 },
  siteControl: { fontFamily: font, color: colors.green, fontSize: 14, padding: 6 },
  disabled: { opacity: 0.35 },
});

