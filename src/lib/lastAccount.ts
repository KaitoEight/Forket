import AsyncStorage from '@react-native-async-storage/async-storage';

/** Tài khoản đăng nhập gần nhất trên máy này → hiện màn "Chào lại" sau khi đăng xuất */
export type LastAccount = {
  email: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
};

const KEY = 'forket.lastAccount';

export async function getLastAccount(): Promise<LastAccount | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as LastAccount) : null;
  } catch {
    return null;
  }
}

export async function saveLastAccount(account: LastAccount) {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(account));
  } catch (e) {
    console.warn('Không lưu được tài khoản gần nhất:', e);
  }
}

export async function forgetLastAccount() {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {}
}
