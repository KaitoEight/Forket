import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
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

import { IconButton } from '@/components/IconButton';
import { colors, radius, statusBarStyle } from '@/constants/theme';
import { signIn, signUp } from '@/lib/auth';
import { appAlert } from '@/lib/appAlert';

type Mode = 'signin' | 'signup';

export default function SignInScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ mode?: Mode }>();
  const [mode, setMode] = useState<Mode>(params.mode === 'signup' ? 'signup' : 'signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSignUp = mode === 'signup';

  const submit = async () => {
    setError(null);
    if (!email.trim() || password.length < 6) {
      setError('Nhập email và mật khẩu (ít nhất 6 ký tự).');
      return;
    }
    setBusy(true);
    try {
      if (isSignUp) {
        const { needsEmailConfirm } = await signUp({ email, password, username, displayName });
        if (needsEmailConfirm) {
          appAlert(
            'Kiểm tra email',
            'Mở link xác nhận trong email rồi quay lại đăng nhập nhé.'
          );
          setMode('signin');
        }
      } else {
        await signIn(email, password);
      }
      // Đăng nhập thành công → layout tự chuyển sang màn camera
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior="padding"
    >
      <StatusBar style={statusBarStyle} />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 24 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.backRow}>
          {router.canGoBack() && <IconButton icon="chevron-back" label="Quay lại" onPress={() => router.back()} />}
        </View>
        <Text style={styles.logo}>🍜</Text>
        <Text style={styles.title}>Forket</Text>
        <Text style={styles.subtitle}>Review chân thật, từ bạn bè</Text>

        <View style={styles.tabs}>
          {(['signin', 'signup'] as const).map((m) => (
            <Pressable
              key={m}
              style={[styles.tab, mode === m && styles.tabActive]}
              onPress={() => {
                setMode(m);
                setError(null);
              }}
            >
              <Text style={[styles.tabText, mode === m && styles.tabTextActive]}>
                {m === 'signin' ? 'Đăng nhập' : 'Đăng ký'}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.form}>
          <Field
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="ban@email.com"
            keyboardType="email-address"
            autoComplete="email"
          />
          <Field
            label="Mật khẩu"
            value={password}
            onChangeText={setPassword}
            placeholder="Ít nhất 6 ký tự"
            secureTextEntry
            autoComplete={isSignUp ? 'new-password' : 'current-password'}
          />
          {isSignUp && (
            <>
              <Field
                label="Username"
                value={username}
                onChangeText={(t) => setUsername(t.toLowerCase().replace(/\s/g, ''))}
                placeholder="vd: an.nguyen"
                hint="Bạn bè tìm bạn bằng @username"
                autoComplete="username"
              />
              <Field
                label="Tên hiển thị"
                value={displayName}
                onChangeText={setDisplayName}
                placeholder="vd: An Nguyễn"
                autoCapitalize="words"
                autoComplete="name"
              />
            </>
          )}

          {error && <Text style={styles.error}>{error}</Text>}

          <Pressable
            style={({ pressed }) => [styles.submit, (pressed || busy) && styles.dim]}
            onPress={submit}
            disabled={busy}
          >
            {busy ? (
              <ActivityIndicator color={colors.onAccent} />
            ) : (
              <Text style={styles.submitText}>{isSignUp ? 'Tạo tài khoản' : 'Đăng nhập'}</Text>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({
  label,
  hint,
  ...input
}: { label: string; hint?: string } & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        placeholderTextColor={colors.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
        {...input}
      />
      {hint && <Text style={styles.hint}>{hint}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 24, alignItems: 'center' },
  backRow: { alignSelf: 'stretch', height: 52, marginBottom: 8 },
  logo: { fontSize: 56 },
  title: { color: colors.text, fontSize: 34, fontWeight: '900', marginTop: 8 },
  subtitle: { color: colors.textMuted, fontSize: 15, marginTop: 6, textAlign: 'center' },
  tabs: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    padding: 4,
    marginTop: 32,
    alignSelf: 'stretch',
  },
  tab: { flex: 1, paddingVertical: 10, borderRadius: radius.pill, alignItems: 'center' },
  tabActive: { backgroundColor: colors.accent },
  tabText: { color: colors.textMuted, fontWeight: '700' },
  tabTextActive: { color: colors.onAccent },
  form: { alignSelf: 'stretch', marginTop: 24, gap: 14 },
  field: { gap: 6 },
  label: { color: colors.text, fontWeight: '700', fontSize: 14 },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 48,
    fontSize: 16,
  },
  hint: { color: colors.textMuted, fontSize: 12 },
  error: { color: colors.danger, fontSize: 14 },
  submit: {
    marginTop: 8,
    backgroundColor: colors.accent,
    height: 52,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitText: { color: colors.onAccent, fontWeight: '800', fontSize: 16 },
  dim: { opacity: 0.7 },
});
