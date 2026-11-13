import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { FriendSelectList } from '@/components/chat/FriendSelectList';
import { GroupAvatar } from '@/components/GroupAvatar';
import { ScreenHeader, SettingsRow, SettingsSection } from '@/components/SettingsUI';
import { colors, radius, statusBarStyle } from '@/constants/theme';
import { useAuth, type Profile } from '@/lib/auth';
import { confirmAction, showError } from '@/lib/confirm';
import {
  addGroupMembers,
  fetchConversationInfo,
  removeGroupMember,
  renameGroup,
  setGroupAvatar,
  type ConversationInfo,
} from '@/services/chatService';
import { fetchFriends } from '@/services/friendService';

type Member = ConversationInfo['members'][number];

export default function GroupInfoScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const meId = session?.user.id;

  const [info, setInfo] = useState<ConversationInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);
  const [friends, setFriends] = useState<Profile[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setInfo(await fetchConversationInfo(id));
    } catch (e: any) {
      showError('Không tải được nhóm', e?.message ?? String(e));
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      load().finally(() => active && setLoading(false));
      return () => {
        active = false;
      };
    }, [load])
  );

  if (loading) {
    return (
      <View style={[styles.screen, styles.centered]}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }
  if (!info) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
        <ScreenHeader title="Nhóm" />
        <Text style={styles.centerText}>Bạn không còn ở trong nhóm này.</Text>
      </View>
    );
  }

  const isAdmin = info.members.some((m) => m.user_id === meId && m.role === 'admin');
  const memberSet = new Set(info.members.map((m) => m.user_id));
  const candidates = friends.filter((f) => !memberSet.has(f.id));

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
      await load();
    } catch (e: any) {
      showError('Không thực hiện được', e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  const changeAvatar = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.9,
    });
    if (result.canceled || !result.assets?.[0]) return;
    setAvatarBusy(true);
    try {
      await setGroupAvatar(info.id, result.assets[0]);
      await load();
    } catch (e: any) {
      showError('Không đổi được ảnh nhóm', e?.message ?? String(e));
    } finally {
      setAvatarBusy(false);
    }
  };

  const removeAvatar = async () => {
    if (!(await confirmAction('Gỡ ảnh nhóm?', 'Nhóm sẽ quay về icon mặc định.', 'Gỡ ảnh'))) return;
    setAvatarBusy(true);
    try {
      await setGroupAvatar(info.id, null);
      await load();
    } catch (e: any) {
      showError('Không gỡ được ảnh', e?.message ?? String(e));
    } finally {
      setAvatarBusy(false);
    }
  };

  const openAdd = async () => {
    setPicked([]);
    setAdding(true);
    try {
      setFriends(await fetchFriends());
    } catch {}
  };

  const kick = async (m: Member) => {
    const ok = await confirmAction(
      `Xoá ${m.profile.display_name} khỏi nhóm?`,
      'Người này sẽ không xem và nhắn tin trong nhóm được nữa.',
      'Xoá khỏi nhóm'
    );
    if (ok) run(() => removeGroupMember(info.id, m.user_id));
  };

  const leave = async () => {
    if (!(await confirmAction('Rời nhóm?', 'Bạn sẽ không nhận tin nhắn của nhóm này nữa.', 'Rời nhóm'))) return;
    try {
      await removeGroupMember(info.id, meId!);
      router.dismissTo('/messages');
    } catch (e: any) {
      showError('Không rời được', e?.message ?? String(e));
    }
  };

  // Trưởng nhóm lên đầu, còn lại theo tên
  const members = [...info.members].sort(
    (a, b) =>
      Number(b.role === 'admin') - Number(a.role === 'admin') ||
      a.profile.display_name.localeCompare(b.profile.display_name)
  );

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <StatusBar style={statusBarStyle} />
      <ScreenHeader title="Thông tin nhóm" />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        <View style={styles.top}>
          <Pressable
            onPress={isAdmin ? changeAvatar : undefined}
            disabled={!isAdmin || avatarBusy}
            accessibilityLabel={isAdmin ? 'Đổi ảnh nhóm' : undefined}
          >
            <GroupAvatar uri={info.avatar_url} size={96} />
            {avatarBusy ? (
              <View style={styles.avatarBusy}>
                <ActivityIndicator color={colors.onPhoto} />
              </View>
            ) : (
              isAdmin && (
                <View style={styles.cameraBadge}>
                  <Ionicons name="camera" size={16} color={colors.onAccent} />
                </View>
              )
            )}
          </Pressable>
          <Text style={styles.name}>{info.name}</Text>
          <Text style={styles.centerText}>{info.members.length} thành viên</Text>
          {isAdmin && info.avatar_url && !avatarBusy && (
            <Pressable onPress={removeAvatar} hitSlop={8}>
              <Text style={styles.removeLink}>Gỡ ảnh nhóm</Text>
            </Pressable>
          )}
        </View>

        <SettingsSection>
          {isAdmin && (
            <>
              <SettingsRow icon="image-outline" label="Đổi ảnh nhóm" onPress={changeAvatar} />
              <SettingsRow
                icon="create-outline"
                label="Đổi tên nhóm"
                onPress={() => {
                  setNewName(info.name ?? '');
                  setRenaming(true);
                }}
              />
            </>
          )}
          <SettingsRow icon="person-add-outline" label="Thêm bạn bè vào nhóm" onPress={openAdd} last />
        </SettingsSection>

        <SettingsSection title="Thành viên">
          {members.map((m, i) => {
            const isMe = m.user_id === meId;
            return (
              <View key={m.user_id} style={[styles.member, i < members.length - 1 && styles.border]}>
                <Pressable
                  style={({ pressed }) => [styles.memberMain, pressed && !isMe && styles.pressed]}
                  disabled={isMe}
                  onPress={() => router.push({ pathname: '/user/[id]', params: { id: m.user_id } })}
                >
                  <Avatar name={m.profile.display_name} seed={m.profile.username} uri={m.profile.avatar_url} size={40} />
                  <View style={styles.flex}>
                    <Text style={styles.memberName} numberOfLines={1}>
                      {isMe ? `${m.profile.display_name} (bạn)` : m.profile.display_name}
                    </Text>
                    <Text style={styles.memberUser} numberOfLines={1}>
                      @{m.profile.username}
                    </Text>
                  </View>
                  {m.role === 'admin' && (
                    <View style={styles.adminChip}>
                      <Text style={styles.adminText}>Trưởng nhóm</Text>
                    </View>
                  )}
                </Pressable>
                {isAdmin && !isMe && (
                  <Pressable
                    style={styles.kickBtn}
                    hitSlop={6}
                    onPress={() => kick(m)}
                    accessibilityLabel={`Xoá ${m.profile.display_name} khỏi nhóm`}
                  >
                    <Ionicons name="person-remove-outline" size={18} color={colors.danger} />
                  </Pressable>
                )}
              </View>
            );
          })}
        </SettingsSection>

        <SettingsSection>
          <SettingsRow icon="exit-outline" label="Rời nhóm" danger onPress={leave} last />
        </SettingsSection>
      </ScrollView>

      {/* Đổi tên */}
      <Modal visible={renaming} transparent animationType="fade" onRequestClose={() => setRenaming(false)}>
        <View style={styles.dialogBackdrop}>
          <View style={styles.dialog}>
            <Text style={styles.dialogTitle}>Đổi tên nhóm</Text>
            <TextInput
              style={styles.input}
              value={newName}
              onChangeText={setNewName}
              maxLength={60}
              autoFocus
              placeholderTextColor={colors.textMuted}
            />
            <View style={styles.dialogActions}>
              <Pressable style={styles.ghost} onPress={() => setRenaming(false)}>
                <Text style={styles.ghostText}>Huỷ</Text>
              </Pressable>
              <Pressable
                style={[styles.primary, (!newName.trim() || busy) && styles.dim]}
                disabled={!newName.trim() || busy}
                onPress={() =>
                  run(async () => {
                    await renameGroup(info.id, newName);
                    setRenaming(false);
                  })
                }
              >
                <Text style={styles.primaryText}>Lưu</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Thêm thành viên */}
      <Modal visible={adding} transparent animationType="slide" onRequestClose={() => setAdding(false)}>
        <View style={styles.sheetBackdrop}>
          <Pressable style={styles.flex} onPress={() => setAdding(false)} />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
            <Text style={styles.dialogTitle}>Thêm vào nhóm</Text>
            <Text style={styles.sheetHint}>Bạn chỉ thêm được bạn bè của mình.</Text>
            <ScrollView style={styles.sheetList}>
              <FriendSelectList
                friends={candidates}
                selected={picked}
                onToggle={(fid) => setPicked((l) => (l.includes(fid) ? l.filter((x) => x !== fid) : [...l, fid]))}
                emptyText="Tất cả bạn bè của bạn đã ở trong nhóm."
              />
            </ScrollView>
            <Pressable
              style={[styles.primary, styles.sheetBtn, (picked.length === 0 || busy) && styles.dim]}
              disabled={picked.length === 0 || busy}
              onPress={() =>
                run(async () => {
                  await addGroupMembers(info.id, picked);
                  setAdding(false);
                })
              }
            >
              {busy ? (
                <ActivityIndicator color={colors.onAccent} />
              ) : (
                <Text style={styles.primaryText}>Thêm {picked.length > 0 ? `${picked.length} người` : ''}</Text>
              )}
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  centered: { alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 },
  content: { padding: 16, gap: 22 },
  top: { alignItems: 'center', gap: 6 },
  avatarBusy: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraBadge: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.accent,
    borderWidth: 3,
    borderColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { color: colors.text, fontSize: 22, fontWeight: '900', marginTop: 6 },
  centerText: { color: colors.textMuted, fontSize: 13, textAlign: 'center' },
  removeLink: { color: colors.danger, fontSize: 13, fontWeight: '700', marginTop: 2 },
  member: { flexDirection: 'row', alignItems: 'center', paddingRight: 10 },
  memberMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 10 },
  border: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  pressed: { backgroundColor: colors.surfaceHigh },
  memberName: { color: colors.text, fontWeight: '700', fontSize: 15 },
  memberUser: { color: colors.textMuted, fontSize: 13, marginTop: 1 },
  adminChip: { backgroundColor: colors.caramelSoft, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
  adminText: { color: colors.brown, fontSize: 11, fontWeight: '800' },
  kickBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.dangerSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dialogBackdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'center', padding: 24 },
  dialog: { backgroundColor: colors.bg, borderRadius: 24, padding: 20, gap: 14, maxWidth: 480, width: '100%', alignSelf: 'center' },
  dialogTitle: { color: colors.text, fontSize: 18, fontWeight: '800' },
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
  dialogActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
  ghost: { paddingHorizontal: 16, height: 44, justifyContent: 'center' },
  ghostText: { color: colors.textMuted, fontWeight: '700' },
  primary: {
    backgroundColor: colors.accent,
    paddingHorizontal: 22,
    height: 44,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: { color: colors.onAccent, fontWeight: '800', fontSize: 15 },
  dim: { opacity: 0.5 },
  sheetBackdrop: { flex: 1, backgroundColor: colors.overlay },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 16,
    gap: 8,
    maxHeight: '75%',
  },
  sheetHint: { color: colors.textMuted, fontSize: 13 },
  sheetList: { flexGrow: 0 },
  sheetBtn: { height: 50, marginTop: 6 },
});
