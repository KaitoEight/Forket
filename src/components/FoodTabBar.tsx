import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { useEffect, useState, type ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { countUnreadMessages, subscribeToIncomingMessages } from '@/services/chatService';
import { countIncomingRequests, subscribeToFriendships } from '@/services/friendService';

type IconName = ComponentProps<typeof Ionicons>['name'];

const TAB_META: Record<string, { label: string; icon: IconName; iconActive: IconName }> = {
  index: { label: 'Bản đồ', icon: 'map-outline', iconActive: 'map' },
  feed: { label: 'Bảng tin', icon: 'leaf-outline', iconActive: 'leaf' },
  messages: { label: 'Tin nhắn', icon: 'chatbubbles-outline', iconActive: 'chatbubbles' },
  profile: { label: 'Hồ sơ', icon: 'person-circle-outline', iconActive: 'person-circle' },
};

/** Thanh tab dưới: 4 tab + nút Check-in (mở camera) nổi ở giữa */
export function FoodTabBar({ state, emitter, navigateToTab, insets }: BottomTabBarProps) {
  const { session } = useAuth();
  const userId = session?.user.id;
  const [unread, setUnread] = useState(0);
  const [requests, setRequests] = useState(0);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    const refreshUnread = () =>
      countUnreadMessages()
        .then((n) => active && setUnread(n))
        .catch(() => {});
    const refreshRequests = () =>
      countIncomingRequests()
        .then((n) => active && setRequests(n))
        .catch(() => {});
    refreshUnread();
    refreshRequests();
    const unsubMessages = subscribeToIncomingMessages(userId, refreshUnread);
    const unsubRequests = subscribeToFriendships(userId, refreshRequests);
    return () => {
      active = false;
      unsubMessages();
      unsubRequests();
    };
  }, [userId]);

  // Mở tab Tin nhắn → tải lại số tin chưa đọc (vừa đọc xong ở khung chat)
  const focusedName = state.routes[state.index]?.name;
  useEffect(() => {
    if (focusedName !== 'messages' || !userId) return;
    countUnreadMessages()
      .then(setUnread)
      .catch(() => {});
  }, [focusedName, userId]);

  const badges: Record<string, number> = { messages: unread, profile: requests };

  const renderTab = (index: number) => {
    const route = state.routes[index];
    if (!route) return null;
    const meta = TAB_META[route.name] ?? { label: route.name, icon: 'ellipse-outline', iconActive: 'ellipse' };
    const focused = state.index === index;
    const badge = badges[route.name] ?? 0;

    const onPress = () => {
      const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
      if (!focused && !event.defaultPrevented) navigateToTab(route.key);
    };

    return (
      <Pressable
        key={route.key}
        accessibilityRole="tab"
        accessibilityState={{ selected: focused }}
        accessibilityLabel={meta.label}
        style={styles.tab}
        onPress={onPress}
      >
        <View>
          <Ionicons
            name={focused ? meta.iconActive : meta.icon}
            size={24}
            color={focused ? colors.accent : colors.textMuted}
          />
          {badge > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{badge > 9 ? '9+' : badge}</Text>
            </View>
          )}
        </View>
        <Text style={[styles.label, focused && styles.labelActive]}>{meta.label}</Text>
      </Pressable>
    );
  };

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      {renderTab(0)}
      {renderTab(1)}

      <View style={styles.centerSlot}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Check-in món mới"
          style={({ pressed }) => [styles.checkin, pressed && styles.pressed]}
          onPress={() => router.push('/camera')}
        >
          <Ionicons name="camera" size={28} color={colors.onAccent} />
        </Pressable>
        <Text style={[styles.label, styles.checkinLabel]}>Check-in</Text>
      </View>

      {renderTab(2)}
      {renderTab(3)}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 8,
    paddingHorizontal: 6,
  },
  tab: { flex: 1, alignItems: 'center', gap: 3, paddingVertical: 2 },
  label: { fontSize: 11, fontWeight: '600', color: colors.textMuted },
  labelActive: { color: colors.accent, fontWeight: '800' },
  centerSlot: { flex: 1, alignItems: 'center', gap: 3 },
  checkin: {
    width: 62,
    height: 62,
    borderRadius: 31,
    marginTop: -30,
    backgroundColor: colors.accent,
    borderWidth: 4,
    borderColor: colors.caramel,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.accentDark,
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  checkinLabel: { color: colors.accent, fontWeight: '800' },
  pressed: { transform: [{ scale: 0.94 }] },
  badge: {
    position: 'absolute',
    top: -4,
    right: -10,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: colors.caramel,
    borderWidth: 2,
    borderColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
});
