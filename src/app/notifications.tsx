import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { ScreenHeader } from '@/components/SettingsUI';
import { colors, radius, statusBarStyle } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { appAlert } from '@/lib/appAlert';
import { acceptFriendRequest, removeFriendship } from '@/services/friendService';
import {
  describeNotification,
  fetchNotifications,
  markNotificationsRead,
  openNotification,
  subscribeToNotifications,
  type AppNotification,
} from '@/services/notificationService';
import { timeAgo } from '@/services/postService';

/** Đánh dấu đã đọc, trừ lời mời kết bạn đang chờ (chỉ hết "chưa đọc" khi chấp nhận / từ chối) */
function markSeen(list: AppNotification[]) {
  const ids = list.filter((i) => !i.read_at && i.type !== 'friend_request').map((i) => i.id);
  if (ids.length > 0) markNotificationsRead(ids);
}

const TINT = { accent: colors.accent, caramel: colors.caramel, danger: colors.danger } as const;

export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const userId = session?.user.id;

  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const itemsRef = useRef<AppNotification[]>([]);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const load = useCallback(async () => {
    try {
      setItems(await fetchNotifications());
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    }
  }, []);

  // Mở màn → tải + nghe thông báo mới; rời màn → đánh dấu tất cả đã đọc (chấm đỏ trên chuông tắt)
  useFocusEffect(
    useCallback(() => {
      let active = true;
      load().finally(() => active && setLoading(false));
      const unsubscribe = userId ? subscribeToNotifications(userId, { onInsert: () => load() }) : () => {};
      return () => {
        active = false;
        unsubscribe();
        markSeen(itemsRef.current);
      };
    }, [load, userId])
  );

  const unreadCount = items.filter((i) => !i.read_at && i.type !== 'friend_request').length;

  const markAll = () => {
    markSeen(items);
    const now = new Date().toISOString();
    setItems((list) => list.map((i) => (i.type === 'friend_request' ? i : { ...i, read_at: i.read_at ?? now })));
  };

  const answerRequest = async (n: AppNotification, accept: boolean) => {
    const friendshipId = n.data?.friendship_id as string | undefined;
    if (!friendshipId) return;
    setBusyId(n.id);
    try {
      if (accept) await acceptFriendRequest(friendshipId);
      else await removeFriendship(friendshipId);
      await load();
    } catch (e: any) {
      appAlert('Không thực hiện được', e?.message ?? String(e));
    } finally {
      setBusyId(null);
    }
  };

  const renderItem = ({ item }: { item: AppNotification }) => {
    const d = describeNotification(item);
    const unread = !item.read_at;
    // Lời mời còn chờ: lời mời đã được chấp nhận thì thông báo đã được đánh dấu đã đọc
    const pendingRequest = item.type === 'friend_request' && unread;
    return (
      <View style={[styles.row, unread && styles.rowUnread]}>
        <Pressable
          style={styles.rowMain}
          onPress={() => {
            if (item.type !== 'friend_request') {
              markNotificationsRead([item.id]);
              setItems((list) =>
                list.map((i) => (i.id === item.id ? { ...i, read_at: i.read_at ?? new Date().toISOString() } : i))
              );
            }
            openNotification(item);
          }}
          accessibilityLabel={d.text}
        >
          <View>
            {item.actor ? (
              <Avatar
                name={item.actor.display_name}
                seed={item.actor.username}
                uri={item.actor.avatar_url}
                size={46}
              />
            ) : (
              <View style={styles.noActor} />
            )}
            <View style={[styles.typeBadge, { backgroundColor: TINT[d.tint] }]}>
              <Ionicons name={d.icon} size={11} color={colors.onAccent} />
            </View>
          </View>
          <View style={styles.flex}>
            <Text style={[styles.text, unread && styles.textUnread]} numberOfLines={3}>
              {d.text}
            </Text>
            <Text style={styles.time}>{timeAgo(item.created_at)}</Text>
            {pendingRequest && (
              <View style={styles.requestActions}>
                <Pressable
                  style={[styles.acceptBtn, busyId === item.id && styles.dim]}
                  disabled={busyId === item.id}
                  onPress={() => answerRequest(item, true)}
                >
                  <Text style={styles.acceptText}>Chấp nhận</Text>
                </Pressable>
                <Pressable
                  style={[styles.declineBtn, busyId === item.id && styles.dim]}
                  disabled={busyId === item.id}
                  onPress={() => answerRequest(item, false)}
                >
                  <Text style={styles.declineText}>Từ chối</Text>
                </Pressable>
              </View>
            )}
          </View>
          {unread && !pendingRequest && <View style={styles.dot} />}
        </Pressable>
      </View>
    );
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <StatusBar style={statusBarStyle} />
      <ScreenHeader
        title="Thông báo"
        right={
          <Pressable
            style={[styles.readAll, unreadCount === 0 && styles.dim]}
            onPress={markAll}
            disabled={unreadCount === 0}
            accessibilityLabel="Đánh dấu tất cả đã đọc"
          >
            <Ionicons name="checkmark-done" size={20} color={colors.accent} />
          </Pressable>
        }
      />

      {loading ? (
        <ActivityIndicator color={colors.accent} style={styles.loader} />
      ) : error ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>{error}</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(n) => n.id}
          renderItem={renderItem}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 24 }, items.length === 0 && styles.flex]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              tintColor={colors.accent}
              onRefresh={async () => {
                setRefreshing(true);
                await load();
                setRefreshing(false);
              }}
            />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="notifications-outline" size={44} color={colors.textMuted} />
              <Text style={styles.emptyTitle}>Chưa có thông báo nào</Text>
              <Text style={styles.emptyText}>
                Lời mời kết bạn, người thả cảm xúc vào ảnh, được nhắc tên trong nhóm… sẽ hiện ở đây.
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  loader: { marginTop: 32 },
  list: { paddingHorizontal: 12, gap: 6 },
  row: { borderRadius: 18, overflow: 'hidden' },
  rowUnread: { backgroundColor: colors.accentSoft },
  rowMain: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 12 },
  noActor: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.surfaceHigh },
  typeBadge: {
    position: 'absolute',
    right: -4,
    bottom: -4,
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { color: colors.text, fontSize: 15, lineHeight: 21 },
  textUnread: { fontWeight: '700' },
  time: { color: colors.textMuted, fontSize: 12, marginTop: 3 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.accent, marginTop: 6 },
  requestActions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  acceptBtn: { backgroundColor: colors.accent, paddingHorizontal: 16, height: 36, borderRadius: radius.pill, justifyContent: 'center' },
  acceptText: { color: colors.onAccent, fontWeight: '800', fontSize: 14 },
  declineBtn: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 16,
    height: 36,
    borderRadius: radius.pill,
    justifyContent: 'center',
  },
  declineText: { color: colors.text, fontWeight: '700', fontSize: 14 },
  dim: { opacity: 0.5 },
  readAll: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 32 },
  emptyTitle: { color: colors.text, fontSize: 17, fontWeight: '800' },
  emptyText: { color: colors.textMuted, fontSize: 14, textAlign: 'center', lineHeight: 20 },
});
