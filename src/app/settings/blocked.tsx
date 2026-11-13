import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { ScreenHeader } from '@/components/SettingsUI';
import { colors, radius, statusBarStyle } from '@/constants/theme';
import { fetchBlockedUsers, unblockUser, type Profile } from '@/services/friendService';
import { appAlert } from '@/lib/appAlert';

export default function BlockedScreen() {
  const insets = useSafeAreaInsets();
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchBlockedUsers()
      .then(setUsers)
      .catch((e) => setError(e?.message ?? String(e)))
      .finally(() => setLoading(false));
  }, []);

  const unblock = (u: Profile) =>
    appAlert(`Bỏ chặn ${u.display_name}?`, 'Hai bạn sẽ tìm thấy nhau và gửi lời mời kết bạn được.', [
      { text: 'Thôi', style: 'cancel' },
      {
        text: 'Bỏ chặn',
        onPress: async () => {
          try {
            await unblockUser(u.id);
            setUsers((list) => list.filter((x) => x.id !== u.id));
          } catch (e: any) {
            appAlert('Không bỏ chặn được', e?.message ?? String(e));
          }
        },
      },
    ]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <StatusBar style={statusBarStyle} />
      <ScreenHeader title="Người đã chặn" />
      {loading ? (
        <ActivityIndicator color={colors.accent} style={styles.loader} />
      ) : (
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
          {error ? (
            <Text style={styles.empty}>
              {error.includes('get_blocked_users')
                ? 'Server chưa bật tính năng chặn: hãy chạy file SQL 20261112000000_profile_privacy.sql.'
                : `Không tải được: ${error}`}
            </Text>
          ) : users.length === 0 ? (
            <Text style={styles.empty}>
              Bạn chưa chặn ai. Người bị chặn không tìm được bạn, không nhắn tin và không thêm bạn vào nhóm được.
            </Text>
          ) : (
            users.map((u) => (
              <View key={u.id} style={styles.row}>
                <Avatar name={u.display_name} seed={u.username} uri={u.avatar_url} />
                <View style={styles.flex}>
                  <Text style={styles.name} numberOfLines={1}>
                    {u.display_name}
                  </Text>
                  <Text style={styles.user}>@{u.username}</Text>
                </View>
                <Pressable style={styles.btn} onPress={() => unblock(u)}>
                  <Text style={styles.btnText}>Bỏ chặn</Text>
                </Pressable>
              </View>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  loader: { marginTop: 32 },
  content: { padding: 16, gap: 4 },
  empty: { color: colors.textMuted, fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: 24 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  name: { color: colors.text, fontWeight: '700', fontSize: 15 },
  user: { color: colors.textMuted, fontSize: 13 },
  btn: {
    backgroundColor: colors.surfaceHigh,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.pill,
  },
  btnText: { color: colors.text, fontWeight: '700', fontSize: 13 },
});
