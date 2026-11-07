import { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { DESKTOP_UA } from './pageScripts';
import { PORTAL_HOST } from './portal';
import { WALLET_BRIDGE, walletDestinationScript } from './walletScripts';
import { openPaymentForm } from './deviceNetwork';
import { colors, font } from './theme';

export default function WalletScreen({ url, onClose, onPaymentStart, onPaymentError }) {
  const web = useRef(null), handingOff = useRef(false);
  const source = useMemo(() => ({ uri: url }), [url]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  async function message(event) {
    try {
      if (new URL(event.nativeEvent.url || url).hostname !== PORTAL_HOST) return;
      const value = JSON.parse(event.nativeEvent.data);
      if (value.scope !== 'degan-wallet' || handingOff.current) return;
      handingOff.current = true;
      onPaymentStart?.();
      if (value.type === 'post') await openPaymentForm(value.action, value.fields);
      else if (value.type === 'get' && /^https?:/i.test(value.url)) await Linking.openURL(value.url);
      else throw new Error('لینک درگاه پرداخت معتبر نیست.');
      onClose({payment:true});
    } catch (reason) { handingOff.current = false;onPaymentError?.(); setError(reason.message || 'مرورگر پرداخت باز نشد. دوباره تلاش کنید.'); }
  }
  return <SafeAreaView style={styles.root}>
    <View style={styles.header}>
      <Pressable onPress={onClose} style={styles.close}><Text style={styles.link}>بازگشت</Text></Pressable>
      <Text style={styles.title}>افزایش اعتبار</Text>
    </View>
    {loading ? <ActivityIndicator color={colors.green} style={styles.loading} /> : null}
    {error ? <View style={styles.errorBox}><Text style={styles.error}>{error}</Text><Pressable onPress={() => { setError(''); web.current?.reload(); }}><Text style={styles.link}>تلاش دوباره</Text></Pressable></View> : null}
    <WebView ref={web} source={source} style={styles.web} userAgent={DESKTOP_UA}
      javaScriptEnabled domStorageEnabled thirdPartyCookiesEnabled setSupportMultipleWindows={false}
      originWhitelist={['*']} mixedContentMode="compatibility" cacheEnabled={false}
      injectedJavaScriptBeforeContentLoaded={WALLET_BRIDGE} injectedJavaScript={WALLET_BRIDGE}
      onMessage={message} onLoadStart={() => setLoading(true)} onLoadEnd={() => { setLoading(false); web.current?.injectJavaScript(WALLET_BRIDGE); }}
      onError={(event) => { if (event.nativeEvent.code !== -3) { setLoading(false); setError('صفحه افزایش اعتبار بارگذاری نشد.'); } }}
      onShouldStartLoadWithRequest={(request) => {
        if (request.url === 'about:blank') return true;
        try {
          const next = new URL(request.url);
          if (!['http:', 'https:'].includes(next.protocol)) return false;
          if (next.hostname === PORTAL_HOST) return true;
          web.current?.injectJavaScript(walletDestinationScript(request.url));
        } catch { setError('لینک درگاه پرداخت معتبر نیست.'); }
        return false;
      }} />
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper }, web: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 8 },
  title: { fontFamily: font, fontSize: 16, color: colors.green }, link: { fontFamily: font, fontSize: 13, color: colors.green },
  close: { paddingVertical: 12 }, loading: { margin: 10 }, errorBox: { padding: 12, gap: 8 },
  error: { fontFamily: font, color: colors.danger, fontSize: 12, textAlign: 'right' },
});

