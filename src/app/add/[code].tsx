import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius } from '@/constants/theme';
import { findUserByCode } from '@/services/friendService';

/** Mở từ link forket://add/CODE (VD: quét QR bằng camera của máy) → chuyển tới trang người đó */
export default function AddByCodeScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!code) return;
    findUserByCode(code)
      .then((user) => {
        if (user) router.replace({ pathname: '/user/[id]', params: { id: user.id } });
        else setError('Mã kết bạn này không còn dùng được.');
      })
      .catch((e) => setError(e?.message ?? String(e)));
  }, [code]);

  return (
    <View style={styles.screen}>
      {error ? (
        <>
          <Text style={styles.text}>{error}</Text>
          <Pressable style={styles.btn} onPress={() => router.replace('/')}>
            <Text style={styles.btnText}>Về trang chính</Text>
          </Pressable>
        </>
      ) : (
        <ActivityIndicator color={colors.accent} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 32 },
  text: { color: colors.textMuted, fontSize: 15, textAlign: 'center' },
  btn: { backgroundColor: colors.accent, paddingHorizontal: 22, paddingVertical: 12, borderRadius: radius.pill },
  btnText: { color: colors.onAccent, fontWeight: '800' },
});
