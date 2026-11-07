import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'degan-profiles-v1';
const LEGACY_KEY = 'degan-account';

function accountValue(data) {
  if (!data || typeof data.username !== 'string' || !data.username.trim()) return null;
  return {
    username: data.username.trim(),
    password: typeof data.password === 'string' ? data.password : '',
    selfId: Number(data.selfId) || 1,
    remember: true,
  };
}

export async function loadAccounts() {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) {
      const data = JSON.parse(raw);
      const profiles = Array.isArray(data.profiles) ? data.profiles.map(accountValue).filter(Boolean) : [];
      return { profiles, selectedUsername: typeof data.selectedUsername === 'string' ? data.selectedUsername : '' };
    }
    const old = await AsyncStorage.getItem(LEGACY_KEY);
    const account = old ? accountValue(JSON.parse(old)) : null;
    return { profiles: account ? [account] : [], selectedUsername: account?.username || '' };
  } catch {
    return { profiles: [], selectedUsername: '' };
  }
}

export async function loadAccount() {
  const data = await loadAccounts();
  return data.profiles.find((profile) => profile.username === data.selectedUsername) || null;
}

export async function saveAccount(account) {
  const value = accountValue(account);
  if (!value) throw new Error('نام کاربری را وارد کنید.');
  const saved = await loadAccounts();
  const profiles = saved.profiles.filter((item) => item.username !== value.username);
  if (account.remember) profiles.push(value);
  const data = { profiles, selectedUsername: account.remember ? value.username : '' };
  await AsyncStorage.setItem(KEY, JSON.stringify(data));
  await AsyncStorage.removeItem(LEGACY_KEY);
  return data;
}
