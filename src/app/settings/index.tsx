import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { ScreenHeader, SettingsRow, SettingsSection } from '@/components/SettingsUI';
import { colors, statusBarStyle } from '@/constants/theme';
import { signOut, useAuth } from '@/lib/auth';
import { forgetLastAccount } from '@/lib/lastAccount';
import { deleteMyAccount } from '@/services/profileService';
import { appAlert } from '@/lib/appAlert';

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { profile, session } = useAuth();
  const [deleting, setDeleting] = useState(false);

  const confirmSignOut = () =>
    appAlert('Đăng xuất?', 'Lần sau mở app, bạn chỉ cần nhập lại mật khẩu.', [
      { text: 'Thôi', style: 'cancel' },
      { text: 'Đăng xuất', style: 'destructive', onPress: () => signOut() },
    ]);

  const confirmForget = () =>
    appAlert(
      'Đăng xuất và quên tài khoản?',
      'Máy này sẽ không nhớ email của bạn nữa. Dùng khi đăng nhập trên máy người khác.',
      [
        { text: 'Thôi', style: 'cancel' },
        {
          text: 'Quên tài khoản',
          style: 'destructive',
          onPress: async () => {
            await signOut();
            await forgetLastAccount();
          },
        },
      ]
    );

  const runDelete = async () => {
    setDeleting(true);
    try {
      await deleteMyAccount();
      await forgetLastAccount();
    } catch (e: any) {
      setDeleting(false);
      appAlert('Không xoá được tài khoản', e?.message ?? String(e));
    }
  };

  // Hỏi 2 lần vì không khôi phục được
  const confirmDelete = () =>
    appAlert(
      'Xoá tài khoản?',
      'Toàn bộ ảnh, đánh giá, tin nhắn và bạn bè của bạn sẽ bị xoá vĩnh viễn. Không thể khôi phục.',
      [
        { text: 'Thôi', style: 'cancel' },
        {
          text: 'Tiếp tục',
          style: 'destructive',
          onPress: () =>
            appAlert('Chắc chắn xoá?', `Tài khoản @${profile?.username ?? ''} sẽ biến mất.`, [
              { text: 'Thôi', style: 'cancel' },
              { text: 'Xoá vĩnh viễn', style: 'destructive', onPress: runDelete },
            ]),
        },
      ]
    );

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <StatusBar style={statusBarStyle} />
      <ScreenHeader title="Cài đặt" />

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        {profile && (
          <View style={styles.me}>
            <Avatar name={profile.display_name} seed={profile.username} uri={profile.avatar_url} size={56} />
            <View style={styles.flex}>
              <Text style={styles.meName} numberOfLines={1}>
                {profile.display_name}
              </Text>
              <Text style={styles.meSub} numberOfLines={1}>
                @{profile.username} · {session?.user.email}
              </Text>
            </View>
          </View>
        )}

        <SettingsSection title="Tài khoản">
          <SettingsRow icon="person-outline" label="Sửa hồ sơ" onPress={() => router.push('/settings/profile')} />
          <SettingsRow icon="qr-code-outline" label="Mã QR kết bạn" onPress={() => router.push('/qr')} />
          <SettingsRow
            icon="key-outline"
            label="Đổi mật khẩu"
            onPress={() => router.push('/settings/password')}
            last
          />
        </SettingsSection>

        <SettingsSection title="Quyền riêng tư">
          <SettingsRow
            icon="eye-outline"
            label="Chia sẻ hoạt động"
            value={profile?.share_activity === false ? 'Đang tắt' : 'Bạn bè'}
            onPress={() => router.push('/settings/privacy')}
          />
          <SettingsRow
            icon="search-outline"
            label="Ai tìm được tôi"
            value={profile?.discoverable === 'qr_only' ? 'Chỉ qua QR' : 'Mọi người'}
            onPress={() => router.push('/settings/privacy')}
          />
          <SettingsRow
            icon="ban-outline"
            label="Người đã chặn"
            onPress={() => router.push('/settings/blocked')}
            last
          />
        </SettingsSection>

        <SettingsSection title="Khác">
          <SettingsRow
            icon="sparkles-outline"
            label="Giới thiệu Forket"
            onPress={() => router.push('/intro')}
            last
          />
        </SettingsSection>

        <SettingsSection>
          <SettingsRow icon="log-out-outline" label="Đăng xuất" onPress={confirmSignOut} />
          <SettingsRow icon="person-remove-outline" label="Đăng xuất và quên tài khoản" onPress={confirmForget} />
          <SettingsRow
            icon="trash-outline"
            label="Xoá tài khoản"
            danger
            onPress={deleting ? undefined : confirmDelete}
            right={deleting ? <ActivityIndicator color={colors.danger} /> : undefined}
            last
          />
        </SettingsSection>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  content: { padding: 16, gap: 22 },
  me: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  meName: { color: colors.text, fontSize: 18, fontWeight: '800' },
  meSub: { color: colors.textMuted, fontSize: 13, marginTop: 2 },
});
