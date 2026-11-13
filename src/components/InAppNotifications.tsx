import Ionicons from '@expo/vector-icons/Ionicons';
import { router, usePathname } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { GroupAvatar } from '@/components/GroupAvatar';
import { colors } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { fetchMessageById, previewText, subscribeToMessages } from '@/services/chatService';
import {
  describeNotification,
  fetchNotificationById,
  markNotificationsRead,
  openNotification,
  subscribeToNotifications,
} from '@/services/notificationService';

type Notice = {
  id: number;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  tint: string;
  title: string;
  body: string;
  person?: { username: string; display_name: string; avatar_url: string | null };
  group?: { avatar_url: string | null };
  open: () => void;
};

const SHOW_MS = 4500;

/** Banner trên đầu màn hình khi có thông báo mới hoặc tin nhắn mới (lúc app đang mở) */
export function InAppNotifications({ userId }: { userId: string }) {
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const pathRef = useRef(pathname);
  const [notice, setNotice] = useState<Notice | null>(null);
  // Giá trị animation tạo 1 lần (useState thay vì useRef để được đọc trong lúc render)
  const [slide] = useState(() => new Animated.Value(0));
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const counter = useRef(0);

  useEffect(() => {
    pathRef.current = pathname;
  }, [pathname]);

  useEffect(() => {
    let active = true;

    const show = (n: Omit<Notice, 'id'>) => {
      if (!active) return;
      if (hideTimer.current) clearTimeout(hideTimer.current);
      setNotice({ ...n, id: ++counter.current });
      slide.setValue(0);
      Animated.spring(slide, { toValue: 1, useNativeDriver: true, friction: 8 }).start();
      hideTimer.current = setTimeout(() => {
        Animated.timing(slide, { toValue: 0, duration: 200, useNativeDriver: true }).start(
          () => active && setNotice(null)
        );
      }, SHOW_MS);
    };

    // Thông báo mới (lời mời kết bạn, cảm xúc, nhắc tên, thêm vào nhóm…)
    const unsubNotifications = subscribeToNotifications(userId, {
      onInsert: async (notificationId) => {
        const n = await fetchNotificationById(notificationId);
        if (!n) return;
        const path = pathRef.current;
        if (path === '/notifications') return; // đang xem danh sách rồi
        if (n.type === 'friend_request' && path === '/friends') return;
        if (n.conversation_id && path === `/chat/${n.conversation_id}`) {
          markNotificationsRead([n.id]); // đang ở đúng cuộc trò chuyện → coi như đã đọc
          return;
        }
        const d = describeNotification(n);
        const name = n.actor?.display_name ?? '';
        show({
          icon: d.icon,
          tint: d.tint === 'danger' ? colors.danger : d.tint === 'caramel' ? colors.caramel : colors.accent,
          title: name || 'Forket',
          body: name && d.text.startsWith(name) ? d.text.slice(name.length).trim() : d.text,
          person: n.actor ?? undefined,
          open: () => {
            if (n.type !== 'friend_request') markNotificationsRead([n.id]);
            openNotification(n);
          },
        });
      },
    });

    // Tin nhắn mới
    const unsubMessages = subscribeToMessages(async (messageId, conversationId, senderId) => {
      if (senderId === userId) return;
      // Đang mở đúng cuộc trò chuyện đó, hoặc đang ở danh sách tin nhắn → khỏi báo
      const path = pathRef.current;
      if (path === `/chat/${conversationId}` || path === '/messages') return;
      try {
        const [msg, conv] = await Promise.all([
          fetchMessageById(messageId),
          supabase.from('conversations').select('is_group, name, avatar_url').eq('id', conversationId).maybeSingle(),
        ]);
        if (!msg?.sender) return;
        // Tin có nhắc tên mình đã có thông báo riêng → không báo thêm lần nữa
        if (msg.mention_all || msg.mentions?.includes(userId)) return;
        const isGroup = !!conv.data?.is_group;
        const preview = previewText({
          last_at: msg.created_at,
          last_body: msg.body,
          last_kind: msg.kind,
          last_post_id: msg.post_id,
          last_image_url: msg.image_url,
        });
        show({
          icon: 'chatbubble',
          tint: colors.accent,
          title: isGroup ? (conv.data?.name ?? 'Nhóm') : msg.sender.display_name,
          body: isGroup ? `${msg.sender.display_name}: ${preview}` : preview,
          person: isGroup ? undefined : msg.sender,
          group: isGroup ? { avatar_url: (conv.data as { avatar_url?: string | null })?.avatar_url ?? null } : undefined,
          open: () => router.push({ pathname: '/chat/[id]', params: { id: conversationId } }),
        });
      } catch {}
    });

    return () => {
      active = false;
      unsubNotifications();
      unsubMessages();
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [userId, slide]);

  if (!notice) return null;

  const dismiss = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    Animated.timing(slide, { toValue: 0, duration: 160, useNativeDriver: true }).start(() => setNotice(null));
  };

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        styles.wrap,
        {
          top: insets.top + 8,
          opacity: slide,
          transform: [{ translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [-120, 0] }) }],
        },
      ]}
    >
      <Pressable
        style={({ pressed }) => [styles.card, { borderLeftColor: notice.tint }, pressed && styles.pressed]}
        onPress={() => {
          dismiss();
          notice.open();
        }}
        accessibilityRole="button"
        accessibilityLabel={`${notice.title}: ${notice.body}`}
      >
        <View>
          {notice.group ? (
            <GroupAvatar uri={notice.group.avatar_url} size={44} />
          ) : notice.person ? (
            <Avatar
              name={notice.person.display_name}
              seed={notice.person.username}
              uri={notice.person.avatar_url}
              size={44}
            />
          ) : (
            <View style={styles.noPerson} />
          )}
          <View style={[styles.kindBadge, { backgroundColor: notice.tint }]}>
            <Ionicons name={notice.icon} size={11} color={colors.onAccent} />
          </View>
        </View>
        <View style={styles.flex}>
          <Text style={styles.title} numberOfLines={1}>
            {notice.title}
          </Text>
          <Text style={styles.body} numberOfLines={2}>
            {notice.body}
          </Text>
        </View>
        <Pressable hitSlop={10} onPress={dismiss} accessibilityLabel="Ẩn thông báo">
          <Ionicons name="close" size={18} color={colors.textMuted} />
        </Pressable>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 12, right: 12, alignItems: 'center', zIndex: 1000, elevation: 20 },
  card: {
    width: '100%',
    maxWidth: 520,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 4,
    borderRadius: 20,
    paddingVertical: 12,
    paddingHorizontal: 14,
    shadowColor: '#3B2A14',
    shadowOpacity: 0.2,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
  },
  pressed: { opacity: 0.9 },
  flex: { flex: 1 },
  noPerson: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surfaceHigh },
  kindBadge: {
    position: 'absolute',
    right: -4,
    bottom: -4,
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { color: colors.text, fontWeight: '800', fontSize: 15 },
  body: { color: colors.textMuted, fontSize: 14, marginTop: 1 },
});
