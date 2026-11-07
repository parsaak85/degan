import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, font } from './theme';

export default function LowBalanceSheet({ visible, balance, onDismiss, onTopUp }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onDismiss}>
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onDismiss} accessibilityLabel="بستن یادآوری موجودی" />
        <View style={styles.sheet} accessibilityViewIsModal>
          <ScrollView bounces={false} contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 16) + 12 }]}>
            <View style={styles.handle} />
            <View style={styles.topRow}>
              <Pressable onPress={onDismiss} style={styles.close} accessibilityLabel="بستن" hitSlop={8}>
                <Text style={styles.closeText}>×</Text>
              </Pressable>
              <View style={styles.pill}><View style={styles.statusDot} /><Text style={styles.pillText}>یادآوری موجودی</Text></View>
            </View>

            <View style={styles.illustration} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <View style={styles.walletBack} />
              <View style={styles.coin}><Text style={styles.coinPlus}>+</Text></View>
              <View style={styles.wallet}><View style={styles.walletStitch} /><View style={styles.walletTab}><View style={styles.walletDot} /></View></View>
            </View>
            <Text style={styles.title} accessibilityRole="header">اعتبارت رو شارژ کن</Text>
            <Text style={styles.description}>برای رزرو غذای بعدی، کمی اعتبار به حسابت اضافه کن.</Text>

            <View style={styles.balanceCard}>
              <Text style={styles.balanceLabel}>موجودی فعلی شما</Text>
              <View style={styles.amountRow}>
                <Text style={styles.currency}>ریال</Text>
                <Text style={styles.amount}>{Number(balance || 0).toLocaleString('fa-IR')}</Text>
              </View>
            </View>

            <Pressable onPress={onTopUp} style={({ pressed }) => [styles.primary, pressed && styles.pressed]} accessibilityRole="button">
              <Text style={styles.primaryText}>افزایش اعتبار</Text>
            </Pressable>
            <Pressable onPress={onDismiss} style={styles.later} accessibilityRole="button">
              <Text style={styles.laterText}>فعلاً ادامه می‌دم</Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end', alignItems: 'center' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(16, 33, 26, 0.50)' },
  sheet: { width: '100%', maxWidth: 460, maxHeight: '94%', borderTopLeftRadius: 32, borderTopRightRadius: 32, overflow: 'hidden', backgroundColor: colors.paper },
  content: { paddingHorizontal: 24, paddingTop: 10 },
  handle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: '#D4D2C8', marginBottom: 18 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  close: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 17, backgroundColor: '#EAE5DB' },
  closeText: { color: colors.muted, fontSize: 25, lineHeight: 28 },
  pill: { flexDirection: 'row-reverse', alignItems: 'center', gap: 7, paddingHorizontal: 11, paddingVertical: 6, backgroundColor: '#EEE1CB', borderRadius: 20 },
  statusDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#A57135' },
  pillText: { fontFamily: font, fontSize: 11, color: '#855D32' },
  illustration: { width: 100, height: 88, alignSelf: 'center', marginTop: 12, marginBottom: 14 },
  walletBack: { position: 'absolute', width: 70, height: 47, top: 18, left: 11, borderRadius: 12, backgroundColor: '#A1B3A1', transform: [{ rotate: '-12deg' }] },
  coin: { position: 'absolute', top: 0, right: 6, width: 34, height: 34, borderRadius: 17, backgroundColor: '#E1B268', borderWidth: 3, borderColor: '#F4D39F', alignItems: 'center', justifyContent: 'center' },
  coinPlus: { fontSize: 24, lineHeight: 26, color: '#8C612E' },
  wallet: { position: 'absolute', top: 29, left: 9, width: 80, height: 52, borderRadius: 13, backgroundColor: colors.green },
  walletStitch: { position: 'absolute', left: 9, top: 8, bottom: 8, width: 2, borderRadius: 1, backgroundColor: '#698277' },
  walletTab: { position: 'absolute', right: -4, top: 17, width: 26, height: 21, borderRadius: 7, backgroundColor: '#E1D7BE', alignItems: 'center', justifyContent: 'center' },
  walletDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.green },
  title: { fontFamily: font, fontSize: 25, lineHeight: 38, color: colors.ink, textAlign: 'center' },
  description: { fontFamily: font, fontSize: 14, lineHeight: 25, color: colors.muted, textAlign: 'center', marginTop: 6, marginHorizontal: 8, marginBottom: 22 },
  balanceCard: { backgroundColor: '#E8ECE3', borderColor: '#DDE3D5', borderWidth: 1, borderRadius: 20, padding: 18, marginBottom: 22 },
  balanceLabel: { fontFamily: font, fontSize: 12, color: '#657062', textAlign: 'center' },
  amountRow: { flexDirection: 'row', gap: 8, justifyContent: 'center', alignItems: 'baseline', marginVertical: 5 },
  amount: { fontFamily: font, fontSize: 33, lineHeight: 49, color: colors.green },
  currency: { fontFamily: font, fontSize: 13, color: '#657062' },
  divider: { height: 1, backgroundColor: '#D5DDCF', marginVertical: 10 },
  minimum: { fontFamily: font, fontSize: 11, lineHeight: 21, color: '#657062', textAlign: 'center' },
  primary: { height: 55, borderRadius: 17, backgroundColor: colors.green, justifyContent: 'center', alignItems: 'center' },
  primaryText: { fontFamily: font, fontSize: 17, color: colors.white },
  pressed: { opacity: 0.85 },
  later: { minHeight: 49, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  laterText: { fontFamily: font, fontSize: 13, color: colors.muted },
});
