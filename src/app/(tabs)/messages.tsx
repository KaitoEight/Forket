import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { IconButton } from '@/components/IconButton';
import { colors, radius } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import {
  fetchConversations,
  previewText,
  subscribeToIncomingMessages,
  type Conversation,
} from '@/services/chatService';
import { timeAgo } from '@/services/postService';

export default function ChatListScreen() {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const meId = session?.user.id;
  const [items, setItems] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      const unsubscribe = subscribeToIncomingMessages(meId, load);
      return () => {
        active = false;
        unsubscribe();
      };
    }, [meId])
  );

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <View style={styles.brand}>
          <Ionicons name="chatbubbles" size={20} color={colors.accent} />
          <Text style={styles.title}>Tin nhắn</Text>
        </View>
        <IconButton icon="person-add" label="Kết bạn" onPress={() => router.push('/friends')} />
      </View>

      {loading ? (
        <ActivityIndicator color={colors.text} style={styles.loader} />
      ) : error ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>
            {error.includes('get_conversations')
              ? 'Server chưa bật tính năng chat: hãy chạy file SQL 20261110040000_chat_reactions.sql trong Supabase.'
              : `Không tải được: ${error}`}
          </Text>
        </View>
      ) : items.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyEmoji}>💬</Text>
          <Text style={styles.emptyText}>Kết bạn để bắt đầu trò chuyện và trả lời ảnh của nhau.</Text>
          <Pressable style={styles.primaryBtn} onPress={() => router.push('/friends')}>
            <Text style={styles.primaryText}>Tìm bạn bè</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(c) => c.friend_id}
          contentContainerStyle={{ paddingBottom: 16 }}
          renderItem={({ item }) => {
            const unread = item.unread > 0;
            const fromMe = item.last_sender_id === meId;
            return (
              <Pressable
                style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                onPress={() => router.push({ pathname: '/chat/[id]', params: { id: item.friend_id } })}
              >
                <Avatar name={item.display_name} seed={item.username} size={52} />
                <View style={styles.flex}>
                  <View style={styles.rowTop}>
                    <Text style={styles.name} numberOfLines={1}>
                      {item.display_name}
                    </Text>
                    {item.last_at && <Text style={styles.time}>{timeAgo(item.last_at)}</Text>}
                  </View>
                  <View style={styles.rowTop}>
                    <Text style={[styles.preview, unread && styles.previewUnread]} numberOfLines={1}>
                      {fromMe && item.last_body ? 'Bạn: ' : ''}
                      {previewText(item)}
                    </Text>
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
