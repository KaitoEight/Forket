import Ionicons from '@expo/vector-icons/Ionicons';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { colors, radius } from '@/constants/theme';
import type { Profile } from '@/lib/auth';

type Props = {
  visible: boolean;
  /** Danh sách để chọn (tôi + bạn bè) */
  people: (Profile & { isMe?: boolean })[];
  selected: string[];
  onChange: (ids: string[]) => void;
  onClose: () => void;
};

/** Chọn những người muốn xem quán họ đã đi */
export function FriendFilterSheet({ visible, people, selected, onChange, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={styles.flex} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text style={styles.title}>Quán ai đã đi?</Text>
            {selected.length > 0 && (
              <Pressable onPress={() => onChange([])} hitSlop={8}>
                <Text style={styles.clear}>Bỏ chọn</Text>
              </Pressable>
            )}
          </View>
          <Text style={styles.sub}>Chỉ hiện bạn bè đang chia sẻ hoạt động.</Text>
          <ScrollView contentContainerStyle={styles.list}>
            {people.length === 0 && <Text style={styles.sub}>Chưa có bạn bè nào.</Text>}
            {people.map((p) => {
              const on = selected.includes(p.id);
              return (
                <Pressable key={p.id} style={styles.row} onPress={() => toggle(p.id)}>
                  <Avatar name={p.display_name} seed={p.username} uri={p.avatar_url} size={40} />
                  <Text style={styles.name} numberOfLines={1}>
                    {p.isMe ? 'Tôi' : p.display_name}
                  </Text>
                  <Ionicons
                    name={on ? 'checkmark-circle' : 'ellipse-outline'}
                    size={24}
                    color={on ? colors.accent : colors.border}
                  />
                </Pressable>
              );
            })}
          </ScrollView>
          <Pressable style={styles.done} onPress={onClose}>
            <Text style={styles.doneText}>
              {selected.length > 0 ? `Xem quán của ${selected.length} người` : 'Xong'}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  backdrop: { flex: 1, backgroundColor: colors.overlay },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 10,
    paddingHorizontal: 16,
    maxHeight: '75%',
    gap: 8,
  },
  handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: colors.border },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: colors.text, fontSize: 18, fontWeight: '800' },
  clear: { color: colors.accent, fontWeight: '700' },
  sub: { color: colors.textMuted, fontSize: 13 },
  list: { paddingVertical: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  name: { flex: 1, color: colors.text, fontWeight: '700', fontSize: 15 },
  done: {
    backgroundColor: colors.accent,
    height: 50,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  doneText: { color: colors.onAccent, fontWeight: '800', fontSize: 15 },
});
