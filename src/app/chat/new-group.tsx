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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FriendSelectList } from '@/components/chat/FriendSelectList';
import { ScreenHeader } from '@/components/SettingsUI';
import { colors, radius, statusBarStyle } from '@/constants/theme';
import type { Profile } from '@/lib/auth';
import { createGroup } from '@/services/chatService';
import { fetchFriends } from '@/services/friendService';
import { appAlert } from '@/lib/appAlert';

export default function NewGroupScreen() {
  const insets = useSafeAreaInsets();
  const [friends, setFriends] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetchFriends()
      .then(setFriends)
      .catch((e) => console.warn('Không tải được bạn bè:', e?.message ?? e))
      .finally(() => setLoading(false));
  }, []);

  const toggle = (id: string) =>
    setSelected((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));

  const ready = name.trim().length > 0 && selected.length > 0;

  const create = async () => {
    if (!ready) return;
    setCreating(true);
    try {
      const id = await createGroup(name, selected);
      router.replace({ pathname: '/chat/[id]', params: { id } });
    } catch (e: any) {
      appAlert('Không tạo được nhóm', e?.message ?? String(e));
      setCreating(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { paddingTop: insets.top + 8 }]}
      behavior="padding"
    >
      <StatusBar style={statusBarStyle} />
      <ScreenHeader
        title="Nhóm mới"
        right={
          <Pressable style={[styles.createBtn, !ready && styles.idle]} onPress={create} disabled={!ready || creating}>
            {creating ? (
              <ActivityIndicator size="small" color={colors.onAccent} />
            ) : (
              <Text style={[styles.createText, !ready && styles.idleText]}>Tạo</Text>
            )}
          </Pressable>
        }
      />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
      >
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="Tên nhóm (vd: Hội ăn đêm)"
          placeholderTextColor={colors.textMuted}
          maxLength={60}
          autoFocus
        />
        <Text style={styles.section}>Thêm bạn bè {selected.length > 0 ? `(${selected.length})` : ''}</Text>
        {loading ? (
          <ActivityIndicator color={colors.accent} />
        ) : (
          <FriendSelectList
            friends={friends}
            selected={selected}
            onToggle={toggle}
            emptyText="Bạn chưa có bạn bè nào. Kết bạn trước rồi tạo nhóm nhé."
          />
        )}
      </ScrollView>
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
    height: 50,
    fontSize: 16,
  },
  section: { color: colors.textMuted, fontWeight: '700', fontSize: 13, textTransform: 'uppercase', marginTop: 8 },
  createBtn: {
    minWidth: 64,
    height: 40,
    paddingHorizontal: 16,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  idle: { backgroundColor: colors.surfaceHigh },
  createText: { color: colors.onAccent, fontWeight: '800' },
  idleText: { color: colors.textMuted },
});
