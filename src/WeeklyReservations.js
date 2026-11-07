import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { toQR } from 'toqr';
import { bookingWeeks, clampBookingWeek } from './siteWeek';
import { dayHasReservation, mergeMenuReservations } from './foodWeek';
import { pageFoods } from './legacyPageClient';
import { colors, font } from './theme';
import { jalaliDateLabel, shiftWeek, weekDateRange } from './dates';
import { tomanPrice } from './prices';
import { canHuntFood } from './huntWindow';

function PickupQR({ code }) {
  const matrix = useMemo(() => toQR(code), [code]);
  const side = Math.sqrt(matrix.length);
  const unit = Math.floor(240 / (side + 8));
  return <View accessibilityLabel="کد QR تحویل غذا" style={{ padding: unit * 4, backgroundColor: '#fff', alignSelf: 'center' }}>
    {Array.from({ length: side }, (_, y) => <View key={y} style={{ flexDirection: 'row' }}>
      {Array.from({ length: side }, (_, x) => <View key={x} style={{ width: unit, height: unit, backgroundColor: matrix[y * side + x] ? '#000' : '#fff' }} />)}
    </View>)}
  </View>;
}
const labels = { buy: 'رزرو غذا', cancel: 'لغو رزرو', sell: 'عرضه برای فروش', withdraw: 'برداشتن از فروش', monitor: 'شروع شکار غذا' };
const money = tomanPrice;
const message = (error) => error?.message && error.message !== 'samad-request' ? error.message : 'ارتباط با سایت برقرار نشد. دوباره تازه‌سازی کنید.';

export default function WeeklyReservations({ session, revision, onOpenSamad, onMonitor, selectedWeek, onWeekChange, onRefresh, apiClient }) {
  const client = apiClient;
  const [mode, setMode] = useState('reserve');
  const [huntSelected, setHuntSelected] = useState([]);
  const [now, setNow] = useState(Date.now);
  useEffect(() => { const timer = setTimeout(() => setNow(Date.now()), 60000 - now % 60000); return () => clearTimeout(timer); }, [now]);
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState({ key: '', rows: [], reservations: [], failed: false });
  const [dialog, setDialog] = useState(null);
  const [code, setCode] = useState('');
  const [qrError, setQrError] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const alive = useRef(true);
  const qrRequest = useRef(0);
  const actionLock = useRef(false);
  const weekLock = useRef(false);
  const start = selectedWeek;
  const {current:currentWeek,next:nextWeek}=bookingWeeks(now);
  const queryKey = `${start}:${retry}:${revision}`;
  const loading = result.key !== queryKey;
  const rows = loading ? [] : result.rows;
  const changeWeek = (date) => {
    if (weekLock.current || actionLock.current || busy || loading) return;
    if(date!==currentWeek&&date!==nextWeek)return;
    weekLock.current = true;
    close();
    setActionError('');
    setHuntSelected([]);
    onWeekChange(date);
  };
  useEffect(()=>{
    if(!busy&&start!==currentWeek&&start!==nextWeek){client.reset?.();onWeekChange(clampBookingWeek(start,now));}
  },[busy,client,currentWeek,nextWeek,now,onWeekChange,start]);

  useEffect(() => {
    // On calendar rollover the clamping effect updates the parent first. Never
    // start a website navigation for the now-out-of-range old render.
    if(start!==currentWeek&&start!==nextWeek)return;
    let current = true;
    const unsubscribe = client.subscribe?.((snapshot) => {
      if (!current || snapshot.navigating || snapshot.kind !== 'panel' || snapshot.weekStart !== start) return;
      const rows = pageFoods(snapshot);
      setResult({key:queryKey,rows,reservations:rows.filter((food)=>food.reserved),failed:false,menuFailed:false});
    });
    Promise.allSettled([client.programs(session.selfId, start), client.reservations(start)]).then(([programs, reservations]) => {
      if (!current) return;
      const reportsOK = reservations.status === 'fulfilled';
      const menuOK = programs.status === 'fulfilled';
      const actual=client.getSnapshot?.();
      if(actual?.kind==='panel'&&actual.weekStart===start&&!actual.navigating){
        const rows=pageFoods(actual);setResult({key:queryKey,rows,reservations:rows.filter(food=>food.reserved),failed:false,menuFailed:false});weekLock.current=false;return;
      }
      setResult({ key: queryKey,
        rows: reportsOK ? mergeMenuReservations(menuOK ? programs.value : [], reservations.value) : [],
        reservations: reportsOK ? reservations.value : [], failed: !reportsOK, menuFailed: !menuOK,
        error:!reportsOK?message(reservations.reason):'' });
      weekLock.current = false;
    });
    return () => { current = false; unsubscribe?.(); };
  }, [client, session.selfId, start, queryKey,currentWeek,nextWeek]);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; qrRequest.current += 1; };
  }, []);
  const close = useCallback(() => { if (actionLock.current) return; qrRequest.current += 1; setDialog(null); setCode(''); setQrError(''); }, []);

  async function showQR(food) {
    const request = ++qrRequest.current;
    setDialog({ kind: 'qr', food });
    setCode('');
    setQrError('');
    try {
      const value = await client.qr(food);
      if (alive.current && qrRequest.current === request) setCode(value);
    } catch (error) { if (alive.current && qrRequest.current === request) setQrError(message(error)); }
  }
  async function perform(kind, food) {
    if (actionLock.current) return;
    actionLock.current = true;
    setBusy(true);
    setActionError('');
    try {
      if (kind === 'monitor') {
        const targets = dialog?.targets || [food];
        const latest = await client.reservations(start);
        if (targets.some(item => dayHasReservation(latest, item.date))) throw new Error('برای یکی از روزهای انتخابی غذا رزرو شده است.');
        await onMonitor(targets, start);
      } else if (kind === 'buy') await client.buy(food, start);
      else if (kind === 'cancel') await client.cancel(food, start);
      else await client.sell(food, start, kind === 'withdraw');
      if (alive.current) { setDialog(null); setRetry((value) => value + 1); }
    } catch (error) { if (alive.current) setActionError(message(error)); }
    finally { actionLock.current = false; if (alive.current) setBusy(false); }
  }

  const huntFoods = rows.filter(food => canHuntFood(food, result.reservations, now));
  const selectedTargets = huntFoods.filter(food => huntSelected.includes(food.key));
  const shownRows = mode === 'hunt' ? huntFoods : rows;
  const dates = [...new Set(shownRows.map((row) => row.date))];
  return <View style={styles.root}>
    <View style={styles.week}>
      <Pressable disabled={busy || loading || start<=currentWeek} onPress={() => changeWeek(currentWeek)} style={styles.nav} accessibilityLabel="این هفته"><Text style={[styles.link,start<=currentWeek&&{opacity:0.35}]}>‹ این هفته</Text></Pressable>
      <Pressable disabled={busy || loading || start === currentWeek} onPress={() => changeWeek(currentWeek)} style={styles.weekCenter} accessibilityLabel={start === currentWeek ? 'این هفته' : 'بازگشت به این هفته'}>
        <Text style={styles.weekTitle}>{start === currentWeek ? 'این هفته' : start === shiftWeek(currentWeek, 1) ? 'هفته آینده' : 'برنامه هفتگی'}</Text>
        <Text style={styles.caption}>{weekDateRange(start)}</Text>
        {start !== currentWeek ? <Text style={styles.today}>بازگشت به این هفته</Text> : null}
      </Pressable>
      <Pressable disabled={busy || loading || start>=nextWeek} onPress={() => changeWeek(nextWeek)} style={styles.nav} accessibilityLabel="هفته بعد"><Text style={[styles.link,start>=nextWeek&&{opacity:0.35}]}>هفته بعد ›</Text></Pressable>
    </View>
    <View style={styles.tabs} accessibilityRole="tablist">
      <Pressable disabled={busy} accessibilityRole="tab" accessibilityState={{ selected: mode === 'reserve' }} onPress={() => { close(); setMode('reserve'); }} style={[styles.tab, mode === 'reserve' && styles.tabOn]}><Text style={[styles.tabText, mode === 'reserve' && styles.tabTextOn]}>رزرو و QR</Text></Pressable>
      <Pressable disabled={busy} accessibilityRole="tab" accessibilityState={{ selected: mode === 'hunt' }} onPress={() => { close(); setMode('hunt'); }} style={[styles.tab, mode === 'hunt' && styles.huntTabOn]}><Text style={[styles.tabText, mode === 'hunt' && styles.huntTabTextOn]}>شکار غذا</Text></Pressable>
    </View>
    <View style={styles.listHeader}>
      <Pressable disabled={busy || loading} onPress={() => {if(weekLock.current)return;weekLock.current=true;setActionError('');close();setHuntSelected([]);onRefresh();}} style={styles.refresh} accessibilityLabel="تازه‌سازی غذاها و اعتبار"><Text style={styles.refreshText}>↻ تازه‌سازی</Text></Pressable>
      {mode === 'hunt' ? <Text style={styles.hint}>موجود شد، خودکار می‌خرد.</Text> : null}
    </View>
    {mode === 'hunt' ? <Pressable disabled={busy || loading || !selectedTargets.length} onPress={() => { setActionError(''); setDialog({ kind: 'monitor', food: selectedTargets[0], targets: selectedTargets }); }} style={[styles.huntStart, (!selectedTargets.length || busy || loading) && styles.huntStartOff]}>
      <Text style={styles.huntButtonText}>شروع شکار{selectedTargets.length ? ` (${selectedTargets.length.toLocaleString('fa-IR')})` : ''}</Text>
    </Pressable> : null}
    {actionError && !dialog ? <Text style={styles.error}>{actionError}</Text> : null}
    {loading ? <ActivityIndicator color={colors.green} style={styles.loading} /> :
      result.failed ? <View style={styles.empty}><Text style={styles.caption}>{result.error||'فهرست سایت هنوز آماده نشده است.'}</Text><Pressable onPress={onOpenSamad}><Text style={styles.link}>نمایش سایت</Text></Pressable></View> :
      <ScrollView contentContainerStyle={styles.list}>
        {result.menuFailed ? <Text style={styles.error}>برنامه غذایی دریافت نشد؛ رزروهای ثبت‌شده نمایش داده می‌شوند.</Text> : null}
        {dates.length === 0 ? <Text style={styles.emptyText}>{mode === 'hunt' ? 'غذایی برای شکار در این هفته نیست.' : 'برنامه‌ای برای این هفته ثبت نشده است.'}</Text> : null}
        {dates.map((date) => <View key={date} style={styles.day}>
          <Text style={styles.dayTitle}>{jalaliDateLabel(date)}</Text>
          {shownRows.filter((food) => food.date === date).map((food) => {
            const blocked = !food.reserved && dayHasReservation(result.reservations, food.date);
            const canCancel = food.reserved && !food.reportOnly && !food.cancelRuleViolated && !food.consumed && !food.forSale;
            const canSell = food.reserved && !food.consumed && (food.saleableFreeFood || food.forSale) && !food.sold;
            const Card = mode === 'hunt' ? Pressable : View;
            return <Card key={food.key} {...(mode === 'hunt' ? {disabled:busy,accessibilityRole:'button',accessibilityState:{selected:huntSelected.includes(food.key)},onPress:()=>setHuntSelected(current=>current.includes(food.key)?current.filter(key=>key!==food.key):[...current,food.key])} : {})} style={[styles.card, food.reserved && styles.reserved, mode === 'hunt' && huntSelected.includes(food.key) && styles.huntSelected]}>
              <View style={styles.foodHeading}>
                <Text style={styles.price}>{money(food.price)}</Text>
                <Text style={[styles.name, food.reserved && styles.green]}>{food.name}</Text>
              </View>
              <View style={styles.meta}>
                <Text style={styles.caption}>{food.reserved ? food.consumed ? 'تحویل گرفته شده' : '✓ رزرو شده' : food.meal}</Text>
                {food.reserved && food.forSale ? <Text accessibilityLabel="برای فروش گذاشته شده" style={styles.saleBadge}>● در فروش</Text> : null}
                {mode === 'reserve' && food.reserved && !food.consumed ? <Pressable disabled={busy} onPress={() => showQR(food)} style={styles.qrButton}><Text style={styles.smallText}>QR تحویل</Text></Pressable> : null}
                {mode === 'reserve' && (canCancel || canSell) ? <Pressable disabled={busy} onPress={() => { setActionError(''); setDialog({ kind: 'manage', food, canCancel, canSell }); }} style={styles.smallButton}><Text style={styles.smallText}>مدیریت</Text></Pressable> : null}
                {mode === 'reserve' && !food.reserved && !blocked ? <>
                  {!food.reserveRuleViolated && !food.reportOnly && food.validTotalCount !== 0 && food.validMaxCount !== 0 ? <Pressable disabled={busy} style={styles.buy} onPress={() => { setActionError(''); setDialog({ kind: 'buy', food }); }}><Text style={styles.buyText}>رزرو</Text></Pressable> : <Text style={styles.closed}>رزرو عادی بسته است</Text>}
                </> : null}
                {blocked ? <Text style={styles.closed}>برای این روز رزرو دارید</Text> : null}
              </View>
            </Card>;
          })}
        </View>)}
      </ScrollView>}
    <Modal transparent animationType="fade" visible={dialog !== null} onRequestClose={close}>
      <View style={styles.backdrop}><View style={styles.modal}>
        <Text style={styles.dialogTitle}>{dialog?.targets ? 'شروع شکار غذا' : dialog?.food.name}</Text>
        <Text style={styles.caption}>{dialog ? jalaliDateLabel(dialog.food.date) : ''} · {dialog?.food.meal}</Text>
        {dialog?.kind === 'qr' ? <>
          {code ? <><PickupQR code={code} /><Text selectable style={styles.code}>{code}</Text></> : qrError ? <Text style={styles.error}>{qrError}</Text> : <ActivityIndicator color={colors.green} style={styles.loading} />}
        </> : dialog?.kind === 'manage' ? <>
          {dialog.canCancel ? <Pressable disabled={busy} style={styles.confirm} onPress={() => { setActionError(''); setDialog({ kind: 'cancel', food: dialog.food }); }}><Text style={styles.buyText}>لغو رزرو و بازگشت اعتبار</Text></Pressable> : null}
          {dialog.canSell ? <Pressable disabled={busy} style={styles.confirm} onPress={() => { setActionError(''); setDialog({ kind: dialog.food.forSale ? 'withdraw' : 'sell', food: dialog.food }); }}><Text style={styles.buyText}>{dialog.food.forSale ? 'برداشتن از فروش' : 'عرضه برای فروش'}</Text></Pressable> : null}
        </> : dialog ? <>
          <Text style={styles.dialogText}>{dialog.kind === 'buy' ? money(dialog.food.price) : dialog.kind === 'sell' ? `کارمزد فروش: ${money(dialog.food.saleableFreeFoodToll)}` : dialog.kind === 'cancel' ? 'رزرو این غذا لغو می‌شود. بازگشت اعتبار طبق مقررات سماد است.' : dialog.kind === 'monitor' ? 'اولین غذای موجود از انتخاب‌های شما خریده می‌شود؛ سپس شکار متوقف می‌شود.' : 'این غذا از فهرست فروش برداشته می‌شود.'}</Text>
          {dialog.targets ? dialog.targets.map(food => <Text key={food.key} style={styles.caption}>{food.name} · {jalaliDateLabel(food.date)}</Text>) : null}
          <Pressable disabled={busy} style={styles.confirm} onPress={() => perform(dialog.kind, dialog.food)}>{busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buyText}>{labels[dialog.kind]}</Text>}</Pressable>
        </> : null}
        {actionError && dialog ? <Text style={styles.error}>{actionError}</Text> : null}
        <Pressable disabled={busy} onPress={close} style={styles.close}><Text style={styles.link}>بستن</Text></Pressable>
      </View></View>
    </Modal>
  </View>;
}
const styles = StyleSheet.create({
  root: { flex: 1 }, week: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingBottom: 7, borderBottomWidth: 1, borderColor: colors.line },
  weekCenter: { flex: 1, alignItems: 'center', gap: 2 }, weekTitle: { fontFamily: font, fontSize: 14, color: colors.ink },
  nav: { minWidth: 64, minHeight: 48, justifyContent: 'center' }, refresh: { minHeight: 40, justifyContent: 'center' },
  tabs: { marginHorizontal: 14, marginTop: 12, flexDirection: 'row-reverse', gap: 6, padding: 4, backgroundColor: '#E9E7DF', borderRadius: 13 },
  tab: { flex: 1, paddingVertical: 11, alignItems: 'center', borderRadius: 10 }, tabOn: { backgroundColor: colors.green }, huntTabOn: { backgroundColor: colors.terracotta },
  tabText: { fontFamily: font, fontSize: 14, color: colors.muted }, tabTextOn: { color: '#fff' }, huntTabTextOn: { color: '#fff' },
  listHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16 },
  hint: { fontFamily: font, fontSize: 11, color: colors.muted }, refreshText: { fontFamily: font, fontSize: 11, color: colors.green },
  today: { fontFamily: font, fontSize: 10, color: colors.green },
  link: { fontFamily: font, fontSize: 14, color: colors.green, textAlign: 'center' }, caption: { fontFamily: font, color: colors.muted, fontSize: 10, textAlign: 'right', lineHeight: 18 },
  list: { padding: 12, paddingTop: 4, paddingBottom: 14 }, day: { marginBottom: 5 }, dayTitle: { fontFamily: font, fontSize: 12, color: colors.green, textAlign: 'right', marginBottom: 6, marginTop: 8 },
  card: { backgroundColor: '#fff', borderWidth: 1, borderColor: colors.line, borderRadius: 12, paddingHorizontal: 11, paddingVertical: 9, marginBottom: 6 },
  reserved: { backgroundColor: '#E1EDE4', borderColor: '#9ABAA4' }, green: { color: '#27583D' },
  huntSelected: { backgroundColor: '#F8E4D9', borderColor: colors.terracotta, borderWidth: 2 },
  foodHeading: { flexDirection: 'row', alignItems: 'center', gap: 10 }, name: { flex: 1, fontFamily: font, fontSize: 14, color: colors.ink, textAlign: 'right' },
  price: { fontFamily: font, fontSize: 10, color: colors.muted }, meta: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginTop: 5, flexWrap: 'wrap' },
  smallButton: { paddingVertical: 8, paddingHorizontal: 6 }, smallText: { fontFamily: font, color: colors.green, fontSize: 11 }, closed: { fontFamily: font, fontSize: 10, color: colors.muted },
  buy: { paddingVertical: 8, paddingHorizontal: 15, borderRadius: 8, backgroundColor: colors.green }, buyText: { fontFamily: font, fontSize: 13, color: '#fff', textAlign: 'center' },
  huntButton: { marginTop: 10, borderRadius: 9, backgroundColor: colors.terracotta, paddingVertical: 11, alignItems: 'center' }, huntButtonText: { fontFamily: font, fontSize: 13, color: '#fff' },
  huntStart: { marginHorizontal: 12, marginBottom: 8, borderRadius: 9, backgroundColor: colors.terracotta, paddingVertical: 12, alignItems: 'center' },
  huntStartOff: { opacity: 0.45 }, huntChoice: { marginTop: 4, paddingVertical: 10, alignItems: 'flex-end' },
  qrButton: { borderRadius: 8, backgroundColor: '#fff', paddingHorizontal: 13, paddingVertical: 9 },
  saleBadge: { fontFamily: font, fontSize: 10, color: '#855D32', backgroundColor: '#F4E5CD', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 7 },
  loading: { marginVertical: 36 }, empty: { padding: 30, gap: 14 }, emptyText: { fontFamily: font, fontSize: 13, color: colors.muted, padding: 30, textAlign: 'center' },
  error: { fontFamily: font, fontSize: 12, color: colors.danger, padding: 10, lineHeight: 22, textAlign: 'right' },
  backdrop: { flex: 1, backgroundColor: '#0008', justifyContent: 'center', padding: 24 }, modal: { borderRadius: 20, padding: 20, backgroundColor: '#fff', gap: 12 },
  dialogTitle: { fontFamily: font, fontSize: 16, color: colors.green, textAlign: 'right' }, dialogText: { fontFamily: font, fontSize: 13, color: colors.ink, textAlign: 'right', lineHeight: 24 },
  code: { color: '#000', fontSize: 28, letterSpacing: 3, textAlign: 'center' }, confirm: { backgroundColor: colors.green, padding: 14, borderRadius: 11 }, close: { padding: 10 },
});
