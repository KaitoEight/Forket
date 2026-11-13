import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { GroupAvatar } from '@/components/GroupAvatar';
import { IconButton } from '@/components/IconButton';
import { colors, radius, statusBarStyle } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import {
  fetchConversations,
  getDirectConversation,
  previewText,
  subscribeToMessages,
  type Conversation,
} from '@/services/chatService';
import { timeAgo } from '@/services/postService';
import { appAlert } from '@/lib/appAlert';

export default function ChatListScreen() {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const meId = session?.user.id;
  const [items, setItems] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState<string | null>(null);

  // Tải lại mỗi khi quay về màn này (VD: vừa đọc xong 1 cuộc trò chuyện) + khi có tin mới
  useFocusEffect(
    useCallback(() => {
      if (!meId) return;
      let active = true;
      const load = () =>
        fetchConversations()
          .then((data) => {
            if (!active) return;
            setItems(data);
            setError(null);
          })
          .catch((e) => active && setError(e?.message ?? String(e)))
          .finally(() => active && setLoading(false));
      load();
      const unsubscribe = subscribeToMessages(() => load());
      return () => {
        active = false;
        unsubscribe();
      };
    }, [meId])
  );

  const open = async (c: Conversation) => {
    if (c.conversation_id) {
      router.push({ pathname: '/chat/[id]', params: { id: c.conversation_id } });
      return;
    }
    // Bạn bè chưa từng nhắn → tạo cuộc trò chuyện rồi mở
    if (!c.other_id) return;
    setOpening(c.other_id);
    try {
      const id = await getDirectConversation(c.other_id);
      router.push({ pathname: '/chat/[id]', params: { id } });
    } catch (e: any) {
      appAlert('Không mở được chat', e?.message ?? String(e));
    } finally {
      setOpening(null);
    }
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <StatusBar style={statusBarStyle} />
      <View style={styles.header}>
        <View style={styles.brand}>
          <Ionicons name="chatbubbles" size={20} color={colors.accent} />
          <Text style={styles.title}>Tin nhắn</Text>
        </View>
        <View style={styles.headerActions}>
          <IconButton icon="people-outline" label="Tạo nhóm" onPress={() => router.push('/chat/new-group')} />
          <IconButton icon="person-add" label="Kết bạn" onPress={() => router.push('/friends')} />
        </View>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.text} style={styles.loader} />
      ) : error ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>{`Không tải được: ${error}`}</Text>
        </View>
      ) : items.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyEmoji}>💬</Text>
          <Text style={styles.emptyText}>Kết bạn để bắt đầu trò chuyện và rủ nhau đi ăn.</Text>
          <Pressable style={styles.primaryBtn} onPress={() => router.push('/friends')}>
            <Text style={styles.primaryText}>Tìm bạn bè</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(c) => c.conversation_id ?? `friend-${c.other_id}`}
          contentContainerStyle={{ paddingBottom: 16 }}
          renderItem={({ item }) => {
            const unread = item.unread > 0;
            // Chỉ dòng bạn bè (chưa có cuộc trò chuyện) mới có trạng thái "đang mở"; nhóm có other_id = null
            const isOpening = !!item.other_id && opening === item.other_id;
            const fromMe = item.last_sender_id === meId;
            const prefix = !item.last_at
              ? ''
              : fromMe
                ? 'Bạn: '
                : item.is_group && item.last_sender_name
                  ? `${item.last_sender_name}: `
                  : '';
            return (
              <Pressable
                style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                onPress={() => open(item)}
                disabled={isOpening}
              >
                {item.is_group ? (
                  <GroupAvatar uri={item.other_avatar_url} size={52} />
                ) : (
                  <Avatar
                    name={item.title}
                    seed={item.other_username ?? item.title}
                    uri={item.other_avatar_url}
                    size={52}
                  />
                )}
                <View style={styles.flex}>
                  <View style={styles.rowTop}>
                    <Text style={styles.name} numberOfLines={1}>
                      {item.title}
                    </Text>
                    {item.is_group && <Text style={styles.time}>{item.member_count} người</Text>}
                    {item.last_at && <Text style={styles.time}>{timeAgo(item.last_at)}</Text>}
                  </View>
                  <View style={styles.rowTop}>
                    <Text style={[styles.preview, unread && styles.previewUnread]} numberOfLines={1}>
                      {item.is_group && !item.last_at ? 'Nhóm mới — nhắn gì đó đi!' : `${prefix}${previewText(item)}`}
                    </Text>
                    {isOpening && <ActivityIndicator size="small" color={colors.accent} />}
                    {unread && (
                      <View style={styles.unread}>
                        <Text style={styles.unreadText}>{item.unread > 9 ? '9+' : item.unread}</Text>
                      </View>
                    )}
                  </View>
                </View>
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1, gap: 4 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  headerActions: { flexDirection: 'row', gap: 8 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { color: colors.text, fontSize: 22, fontWeight: '900' },
  loader: { marginTop: 32 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  emptyEmoji: { fontSize: 48 },
  emptyText: { color: colors.textMuted, fontSize: 15, textAlign: 'center', lineHeight: 22 },
  primaryBtn: {
    backgroundColor: colors.accent,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: radius.pill,
  },
  primaryText: { color: colors.onAccent, fontWeight: '800' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 10 },
  rowPressed: { backgroundColor: colors.surface },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { color: colors.text, fontWeight: '800', fontSize: 16, flex: 1 },
  time: { color: colors.textMuted, fontSize: 12 },
  preview: { color: colors.textMuted, fontSize: 14, flex: 1 },
  previewUnread: { color: colors.text, fontWeight: '700' },
  unread: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadText: { color: colors.onAccent, fontWeight: '800', fontSize: 12 },
});
