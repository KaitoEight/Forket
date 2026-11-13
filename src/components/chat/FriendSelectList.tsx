import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { colors } from '@/constants/theme';
import type { Profile } from '@/lib/auth';

/** Danh sách bạn bè có ô chọn (tạo nhóm, thêm thành viên) */
export function FriendSelectList({
  friends,
  selected,
  onToggle,
  emptyText,
}: {
  friends: Profile[];
  selected: string[];
  onToggle: (id: string) => void;
  emptyText: string;
}) {
  if (friends.length === 0) return <Text style={styles.empty}>{emptyText}</Text>;
  return (
    <View>
      {friends.map((f) => {
        const on = selected.includes(f.id);
        return (
          <Pressable
            key={f.id}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            onPress={() => onToggle(f.id)}
            accessibilityState={{ checked: on }}
          >
            <Avatar name={f.display_name} seed={f.username} uri={f.avatar_url} size={42} />
            <View style={styles.flex}>
              <Text style={styles.name} numberOfLines={1}>
                {f.display_name}
              </Text>
              <Text style={styles.user}>@{f.username}</Text>
            </View>
            <Ionicons
              name={on ? 'checkmark-circle' : 'ellipse-outline'}
              size={24}
              color={on ? colors.accent : colors.border}
            />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  empty: { color: colors.textMuted, fontSize: 14, textAlign: 'center', paddingVertical: 24, lineHeight: 20 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, borderRadius: 12 },
  pressed: { backgroundColor: colors.surface },
  name: { color: colors.text, fontWeight: '700', fontSize: 15 },
  user: { color: colors.textMuted, fontSize: 13 },
});
