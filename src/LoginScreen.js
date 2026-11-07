import { useEffect, useState } from 'react';
import {
  Image,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { loadAccounts, saveAccount } from './storage';
import { SELVES, selfName } from './selves';
import { colors, font } from './theme';
import { assertVpnOff } from './deviceNetwork';

export default function LoginScreen({ onSubmit }) {
  const [ready, setReady] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [selfId, setSelfId] = useState(1);
  const [remember, setRemember] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [focused, setFocused] = useState('');
  const [profiles, setProfiles] = useState([]);
  const [picker, setPicker] = useState('');
  const [profileMessage, setProfileMessage] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    loadAccounts().then((data) => {
      if (!alive) return;
      setProfiles(data.profiles);
      const saved = data.profiles.find((item) => item.username === data.selectedUsername);
      if (saved) {
        setUsername(saved.username);
        setPassword(saved.password);
        setSelfId(saved.selfId);
        setRemember(true);
      }
      setReady(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  const canSubmit = username.trim().length > 0 && password.length > 0;

  async function storeProfile(enter = false) {
    if (!canSubmit || saving) return;
    setSaving(true);
    setProfileMessage('');
    const account = {
      username: username.trim(),
      password,
      selfId,
      remember: enter ? remember : true,
    };
    try {
      if (enter) await assertVpnOff();
      const data = await saveAccount(account);
      if (enter) { onSubmit(account); return; }
      setProfiles(data.profiles);
      setRemember(true);
      setProfileMessage('پروفایل ذخیره شد.');
    } catch (error) {
      setProfileMessage(error.message || 'ذخیره پروفایل انجام نشد. دوباره تلاش کنید.');
    } finally { setSaving(false); }
  }

  function addProfile() {
    setUsername(''); setPassword(''); setSelfId(1); setRemember(true);
    setShowPassword(false); setProfileMessage(''); setPicker('');
  }

  function chooseProfile(profile) {
    setUsername(profile.username); setPassword(profile.password); setSelfId(profile.selfId);
    setRemember(true); setShowPassword(false); setProfileMessage(''); setPicker('');
  }

  if (!ready) {
    return <View style={styles.boot} />;
  }

  return (
    <View style={styles.root}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.scroll}
          bounces={false}
        >
          <SafeAreaView edges={['top']} style={styles.hero}>
            <Image source={require('../assets/icon-selected.png')} style={styles.mark} resizeMode="contain" />
            <Text style={styles.brand}>سوپر اپلیکیشن دگان</Text>
          </SafeAreaView>
          <View style={styles.sheet}>
            <Text style={styles.label}>پروفایل</Text>
            <View style={styles.profileRow}>
              <Pressable disabled={saving} style={[styles.selfOption, styles.profileSelect]} onPress={() => setPicker('profiles')} accessibilityLabel="انتخاب پروفایل">
                <Text style={styles.link}>⌄</Text>
                <Text numberOfLines={1} style={styles.profileName}>{profiles.some((item) => item.username === username.trim()) ? username.trim() : 'انتخاب پروفایل'}</Text>
              </Pressable>
              <Pressable disabled={saving} onPress={addProfile} style={styles.profileAction}><Text style={styles.profileActionText}>+ افزودن</Text></Pressable>
              <Pressable disabled={!canSubmit || saving} onPress={() => storeProfile()} style={styles.profileAction}><Text style={[styles.profileActionText, (!canSubmit || saving) && styles.muted]}>ذخیره</Text></Pressable>
            </View>
            {profileMessage ? <Text style={styles.profileMessage}>{profileMessage}</Text> : null}
            <Text style={styles.label}>نام کاربری</Text>
            <TextInput
              value={username}
              onChangeText={setUsername}
              keyboardType="default"
              autoCapitalize="none"
              autoCorrect={false}
              textAlign="right"
              placeholder="نام کاربری"
              placeholderTextColor={colors.muted}
              style={[styles.input, focused === 'user' && styles.inputOn]}
              onFocus={() => setFocused('user')}
              onBlur={() => setFocused('')}
            />

            <View style={styles.labelRow}>
              <Pressable onPress={() => setShowPassword((v) => !v)} hitSlop={8}>
                <Text style={styles.link}>{showPassword ? 'پنهان' : 'نمایش'}</Text>
              </Pressable>
              <Text style={styles.label}>رمز عبور</Text>
            </View>
            <TextInput
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoCorrect={false}
              textAlign="right"
              placeholder="رمز سامانه"
              placeholderTextColor={colors.muted}
              style={[styles.input, focused === 'pass' && styles.inputOn]}
              onFocus={() => setFocused('pass')}
              onBlur={() => setFocused('')}
            />

            <Text style={styles.label}>سلف</Text>
            <Pressable style={[styles.selfOption, styles.selfSelect]} onPress={() => setPicker('selves')} accessibilityLabel="انتخاب سلف">
              <Text style={styles.profileActionText}>⌄</Text>
              <Text style={styles.selfName}>{selfName(selfId)}</Text>
            </Pressable>

            <Pressable style={styles.remember} onPress={() => setRemember((v) => !v)}>
              <Text style={styles.rememberText}>ذخیره روی همین گوشی</Text>
              <View style={[styles.box, remember && styles.boxOn]}>
                {remember ? <Text style={styles.tick}>✓</Text> : null}
              </View>
            </Pressable>

            <Pressable
              style={[styles.button, (!canSubmit || saving) && styles.buttonOff]}
              onPress={() => storeProfile(true)}
              disabled={!canSubmit || saving}
            >
              <Text style={styles.buttonText}>ورود و دیدن غذاها</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
      <Modal transparent animationType="fade" visible={Boolean(picker)} onRequestClose={() => setPicker('')}>
        <View style={styles.pickerBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setPicker('')} accessibilityLabel="بستن انتخاب‌ها" />
          <View style={styles.pickerSheet}>
            <Text style={styles.label}>{picker === 'selves' ? 'انتخاب سلف' : 'انتخاب پروفایل'}</Text>
            <ScrollView keyboardShouldPersistTaps="handled">
              {(picker === 'selves' ? SELVES : profiles).map((item) => {
                const key = picker === 'selves' ? item.id : item.username;
                const selected = picker === 'selves' ? item.id === selfId : item.username === username.trim();
                return <Pressable key={key} style={[styles.selfOption, styles.pickerOption, selected && styles.selfOptionOn]}
                  onPress={() => { if (picker === 'selves') { setSelfId(item.id); setPicker(''); } else chooseProfile(item); }}>
                  <Text style={styles.selfName}>{picker === 'selves' ? item.name : item.username}</Text>
                  {selected ? <Text style={styles.profileActionText}>✓</Text> : null}
                </Pressable>;
              })}
              {picker === 'profiles' ? <Pressable onPress={addProfile} style={styles.profileAction}><Text style={styles.profileActionText}>+ افزودن پروفایل</Text></Pressable> : null}
            </ScrollView>
            <Pressable onPress={() => setPicker('')} style={styles.profileAction}><Text style={styles.profileActionText}>بستن</Text></Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  boot: { flex: 1, backgroundColor: colors.green },
  root: { flex: 1, backgroundColor: colors.green },
  flex: { flex: 1 },
  scroll: { flexGrow: 1, paddingBottom: 28 },
  hero: {
    backgroundColor: colors.green,
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 28,
    paddingHorizontal: 24,
  },
  mark: {
    width: 132,
    height: 132,
    alignSelf: 'center',
    marginBottom: 14,
  },
  brand: {
    fontFamily: font,
    color: colors.white,
    fontSize: 26,
    textAlign: 'center',
  },
  sheet: {
    flexGrow: 1,
    marginTop: -16,
    backgroundColor: colors.paper,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 8,
  },
  label: {
    fontFamily: font,
    color: colors.ink,
    fontSize: 14,
    textAlign: 'right',
    marginBottom: 8,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  link: {
    fontFamily: font,
    color: colors.green,
    fontSize: 13,
    marginBottom: 8,
  },
  input: {
    fontFamily: font,
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: colors.ink,
    marginBottom: 16,
    backgroundColor: colors.card,
  },
  inputOn: { borderColor: colors.green },
  profileRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, marginBottom: 16 },
  profileSelect: { flex: 1, paddingVertical: 10 },
  profileName: { flex: 1, fontFamily: font, fontSize: 13, color: colors.ink, textAlign: 'right', marginLeft: 8 },
  profileAction: { minHeight: 44, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 4 },
  profileActionText: { fontFamily: font, fontSize: 13, color: colors.green },
  profileMessage: { fontFamily: font, fontSize: 12, color: colors.green, textAlign: 'right', marginBottom: 12 },
  muted: { color: colors.muted },
  selfSelect: { marginBottom: 16 },
  pickerBackdrop: { flex: 1, backgroundColor: '#0008', justifyContent: 'center', padding: 24 },
  pickerSheet: { backgroundColor: colors.paper, borderRadius: 20, padding: 18, maxHeight: '75%' },
  pickerOption: { marginBottom: 8 },
  selfList: { gap: 8, marginBottom: 16 },
  selfOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: 16,
    backgroundColor: colors.card,
    paddingVertical: 13,
    paddingHorizontal: 14,
  },
  selfOptionOn: { borderColor: colors.green, backgroundColor: colors.leaf },
  selfName: { fontFamily: font, fontSize: 16, color: colors.ink, textAlign: 'right', flex: 1 },
  selfNameOn: { color: colors.green },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
    backgroundColor: colors.card,
  },
  radioOn: { borderColor: colors.green },
  radioDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.green },
  remember: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 10,
    marginBottom: 18,
  },
  box: {
    width: 22,
    height: 22,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
  },
  boxOn: { backgroundColor: colors.green, borderColor: colors.green },
  tick: { color: colors.white, fontSize: 14, fontFamily: font },
  rememberText: { fontFamily: font, color: colors.ink, fontSize: 14 },
  button: {
    backgroundColor: colors.green,
    borderRadius: 16,
    minHeight: 54,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonOff: { backgroundColor: '#C5CDC8' },
  buttonText: { fontFamily: font, color: colors.white, fontSize: 17 },
});
