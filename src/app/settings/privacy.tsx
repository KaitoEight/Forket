import Ionicons from '@expo/vector-icons/Ionicons';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenHeader, SettingsSection } from '@/components/SettingsUI';
import { colors, statusBarStyle } from '@/constants/theme';
import { useAuth, type MyProfile } from '@/lib/auth';
import { updateMyProfile } from '@/services/profileService';
import { appAlert } from '@/lib/appAlert';

export default function PrivacyScreen() {
  const insets = useSafeAreaInsets();
  const { profile, refreshProfile } = useAuth();
  // Hiện ngay lựa chọn mới, gửi lên server sau (lỗi thì quay về như cũ)
  const [share, setShare] = useState(profile?.share_activity ?? true);
  const [discoverable, setDiscoverable] = useState<MyProfile['discoverable']>(profile?.discoverable ?? 'everyone');

  const save = async (patch: Partial<MyProfile>, rollback: () => void) => {
    try {
      await updateMyProfile(patch);
      await refreshProfile();
    } catch (e: any) {
      rollback();
      appAlert('Không lưu được', e?.message ?? String(e));
    }
  };

  const toggleShare = (value: boolean) => {
    const apply = () => {
      setShare(value);
      save({ share_activity: value }, () => setShare(!value));
    };
    if (value) return apply();
    appAlert(
      'Bật chế độ riêng tư?',
      'Bạn bè sẽ không thấy ảnh check-in, quán bạn đã đi và đánh giá của bạn nữa. Bạn vẫn xem được của họ.',
      [
        { text: 'Thôi', style: 'cancel' },
        { text: 'Bật riêng tư', style: 'destructive', onPress: apply },
      ]
    );
  };

  const chooseDiscoverable = (value: MyProfile['discoverable']) => {
    if (value === discoverable) return;
    const prev = discoverable;
    setDiscoverable(value);
    save({ discoverable: value }, () => setDiscoverable(prev));
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <StatusBar style={statusBarStyle} />
      <ScreenHeader title="Quyền riêng tư" />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        <SettingsSection
          title="Hoạt động"
          footer={
            share
              ? 'Bạn bè thấy ảnh check-in, lịch sử quán đã đi và đánh giá của bạn.'
              : 'Chế độ riêng tư: chỉ mình bạn thấy ảnh, quán đã đi và đánh giá của bạn.'
          }
        >
          <View style={styles.switchRow}>
            <View style={styles.flex}>
              <Text style={styles.label}>Chia sẻ hoạt động với bạn bè</Text>
              <Text style={styles.sub}>Ảnh, quán đã đi, đánh giá</Text>
            </View>
            <Switch
              value={share}
              onValueChange={toggleShare}
              trackColor={{ true: colors.accent, false: colors.surfaceHigh }}
              thumbColor={colors.surface}
            />
          </View>
        </SettingsSection>

        <SettingsSection
          title="Ai tìm được tôi bằng @username"
          footer="Chọn “Chỉ qua QR” thì người khác chỉ kết bạn được khi bạn đưa mã QR cho họ."
        >
          <Choice
            label="Mọi người"
            selected={discoverable === 'everyone'}
            onPress={() => chooseDiscoverable('everyone')}
          />
          <Choice
            label="Chỉ qua mã QR"
            selected={discoverable === 'qr_only'}
            onPress={() => chooseDiscoverable('qr_only')}
            last
          />
        </SettingsSection>
      </ScrollView>
    </View>
  );
}

function Choice({
  label,
  selected,
  onPress,
  last,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  last?: boolean;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.choice, !last && styles.border, pressed && styles.pressed]}
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
    >
      <Text style={styles.label}>{label}</Text>
      <Ionicons
        name={selected ? 'radio-button-on' : 'radio-button-off'}
        size={22}
        color={selected ? colors.accent : colors.textMuted}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  content: { padding: 16, gap: 22 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  label: { color: colors.text, fontSize: 15, fontWeight: '600' },
  sub: { color: colors.textMuted, fontSize: 13, marginTop: 2 },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    minHeight: 52,
  },
  border: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  pressed: { backgroundColor: colors.surfaceHigh },
});
