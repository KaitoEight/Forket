import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenHeader } from '@/components/SettingsUI';
import { colors, radius, statusBarStyle } from '@/constants/theme';
import { changePassword } from '@/services/profileService';
import { appAlert } from '@/lib/appAlert';
import { goBack } from '@/lib/navigation';

export default function PasswordScreen() {
  const insets = useSafeAreaInsets();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (password !== confirm) {
      setError('Hai mật khẩu chưa khớp.');
      return;
    }
    setBusy(true);
    try {
      await changePassword(password);
      appAlert('Đã đổi mật khẩu', 'Lần sau đăng nhập dùng mật khẩu mới nhé.');
      goBack();
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { paddingTop: insets.top + 8 }]}
      behavior="padding"
    >
      <StatusBar style={statusBarStyle} />
      <ScreenHeader title="Đổi mật khẩu" />
      <View style={styles.content}>
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          placeholder="Mật khẩu mới (ít nhất 6 ký tự)"
          placeholderTextColor={colors.textMuted}
          secureTextEntry
          autoComplete="new-password"
          autoFocus
        />
        <TextInput
          style={styles.input}
          value={confirm}
          onChangeText={setConfirm}
          placeholder="Nhập lại mật khẩu mới"
          placeholderTextColor={colors.textMuted}
          secureTextEntry
          autoComplete="new-password"
          onSubmitEditing={submit}
        />
        {error && <Text style={styles.error}>{error}</Text>}
        <Pressable
          style={[styles.submit, (busy || password.length < 6) && styles.dim]}
          onPress={submit}
          disabled={busy || password.length < 6}
        >
          {busy ? <ActivityIndicator color={colors.onAccent} /> : <Text style={styles.submitText}>Đổi mật khẩu</Text>}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, gap: 12 },
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
  error: { color: colors.danger, fontSize: 14 },
  submit: {
    marginTop: 4,
    backgroundColor: colors.accent,
    height: 52,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitText: { color: colors.onAccent, fontWeight: '800', fontSize: 16 },
  dim: { opacity: 0.6 },
});
