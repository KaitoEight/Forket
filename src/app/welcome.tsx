import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { Onboarding } from '@/components/Onboarding';
import { colors, radius, statusBarStyle } from '@/constants/theme';
import { signIn } from '@/lib/auth';
import { forgetLastAccount, getLastAccount, type LastAccount } from '@/lib/lastAccount';
import { appAlert } from '@/lib/appAlert';

/**
 * Màn đầu tiên khi chưa đăng nhập:
 *  - Máy nhớ tài khoản gần nhất (vừa đăng xuất) → "Chào lại", chỉ cần nhập mật khẩu
 *  - Người mới → 3 slide giới thiệu → Tạo tài khoản / Đã có tài khoản
 */
export default function WelcomeScreen() {
  const [last, setLast] = useState<LastAccount | null | undefined>(undefined);

  useEffect(() => {
    getLastAccount().then(setLast);
  }, []);

  if (last === undefined) {
    return (
      <View style={[styles.screen, styles.centered]}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (last) {
    return (
      <WelcomeBack
        account={last}
        onForget={async () => {
          await forgetLastAccount();
          setLast(null);
        }}
      />
    );
  }

  return (
    <>
      <StatusBar style={statusBarStyle} />
      <Onboarding
        footer={
          <View style={styles.footer}>
            <Pressable
              style={styles.primary}
              onPress={() => router.push({ pathname: '/sign-in', params: { mode: 'signup' } })}
            >
              <Text style={styles.primaryText}>Tạo tài khoản</Text>
            </Pressable>
            <Pressable
              style={styles.secondary}
              onPress={() => router.push({ pathname: '/sign-in', params: { mode: 'signin' } })}
            >
              <Text style={styles.secondaryText}>Tôi đã có tài khoản</Text>
            </Pressable>
          </View>
        }
      />
    </>
  );
}

function WelcomeBack({ account, onForget }: { account: LastAccount; onForget: () => void }) {
  const insets = useSafeAreaInsets();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (password.length < 6 || busy) return;
    setBusy(true);
    setError(null);
    try {
      await signIn(account.email, password);
      // Đăng nhập xong → layout tự chuyển vào app
    } catch (e: any) {
      setError(e?.message ?? String(e));
      setBusy(false);
    }
  };

  const confirmForget = () =>
    appAlert('Quên tài khoản này?', `Máy sẽ không nhớ ${account.email} nữa.`, [
      { text: 'Thôi', style: 'cancel' },
      { text: 'Quên', style: 'destructive', onPress: onForget },
    ]);

  const firstName = account.display_name.trim().split(/\s+/).pop() ?? account.display_name;

  return (
    <KeyboardAvoidingView style={styles.screen} behavior="padding">
      <StatusBar style={statusBarStyle} />
      <ScrollView
        contentContainerStyle={[styles.backContent, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.brand}>
          <Ionicons name="leaf" size={18} color={colors.accent} />
          <Text style={styles.brandText}>Forket</Text>
        </View>

        <View style={styles.avatarRing}>
          <Avatar name={account.display_name} seed={account.username} uri={account.avatar_url} size={96} />
        </View>
        <Text style={styles.hello}>Chào lại, {firstName}</Text>
        <Text style={styles.sub}>Hôm nay ăn gì? Bạn bè đang chờ review của bạn đó.</Text>

        <View style={styles.accountPill}>
          <Ionicons name="mail-outline" size={15} color={colors.textMuted} />
          <Text style={styles.accountText} numberOfLines={1}>
            {account.email}
          </Text>
        </View>

        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          placeholder="Mật khẩu"
          placeholderTextColor={colors.textMuted}
          secureTextEntry
          autoComplete="current-password"
          returnKeyType="go"
          onSubmitEditing={submit}
          autoFocus
        />
        {error && <Text style={styles.error}>{error}</Text>}

        <Pressable style={[styles.primary, styles.full, (busy || password.length < 6) && styles.dim]} onPress={submit} disabled={busy}>
          {busy ? <ActivityIndicator color={colors.onAccent} /> : <Text style={styles.primaryText}>Đăng nhập</Text>}
        </Pressable>

        <View style={styles.links}>
          <Pressable onPress={() => router.push({ pathname: '/sign-in', params: { mode: 'signin' } })} hitSlop={8}>
            <Text style={styles.link}>Dùng tài khoản khác</Text>
          </Pressable>
          <Text style={styles.linkDot}>·</Text>
          <Pressable onPress={() => router.push({ pathname: '/sign-in', params: { mode: 'signup' } })} hitSlop={8}>
            <Text style={styles.link}>Tạo tài khoản mới</Text>
          </Pressable>
        </View>
        <Pressable onPress={confirmForget} hitSlop={8}>
          <Text style={styles.forget}>Quên tài khoản này trên máy</Text>
        </Pressable>

        <View style={styles.promise}>
          <Ionicons name="shield-checkmark" size={15} color={colors.accent} />
          <Text style={styles.promiseText}>Review chân thật, từ bạn bè</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  centered: { alignItems: 'center', justifyContent: 'center' },
  footer: { gap: 10 },
  primary: {
    backgroundColor: colors.accent,
    height: 54,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: { color: colors.onAccent, fontWeight: '800', fontSize: 16 },
  secondary: {
    height: 54,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  secondaryText: { color: colors.text, fontWeight: '800', fontSize: 16 },
  backContent: { paddingHorizontal: 24, alignItems: 'center', gap: 12 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 20 },
  brandText: { color: colors.text, fontSize: 20, fontWeight: '900' },
  avatarRing: { padding: 5, borderRadius: 60, borderWidth: 3, borderColor: colors.accent },
  hello: { color: colors.text, fontSize: 28, fontWeight: '900', marginTop: 8 },
  sub: { color: colors.textMuted, fontSize: 15, textAlign: 'center', lineHeight: 21 },
  accountPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surfaceHigh,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.pill,
    marginTop: 12,
    maxWidth: '100%',
  },
  accountText: { color: colors.text, fontWeight: '600', fontSize: 14, flexShrink: 1 },
  input: {
    alignSelf: 'stretch',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 50,
    fontSize: 16,
    marginTop: 4,
  },
  error: { color: colors.danger, fontSize: 14, alignSelf: 'stretch' },
  full: { alignSelf: 'stretch' },
  dim: { opacity: 0.6 },
  links: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  link: { color: colors.accent, fontWeight: '700', fontSize: 14 },
  linkDot: { color: colors.textMuted },
  forget: { color: colors.textMuted, fontSize: 13, marginTop: 4 },
  promise: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 28 },
  promiseText: { color: colors.accent, fontWeight: '800', fontSize: 13 },
});
