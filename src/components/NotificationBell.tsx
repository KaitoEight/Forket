import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { IconButton } from '@/components/IconButton';
import { colors } from '@/constants/theme';
import { useUnreadNotifications } from '@/hooks/useUnreadNotifications';

/** Nút chuông thông báo có chấm số chưa đọc */
export function NotificationBell() {
  const unread = useUnreadNotifications();
  return (
    <View>
      <IconButton
        icon={unread > 0 ? 'notifications' : 'notifications-outline'}
        label={unread > 0 ? `Thông báo, ${unread} chưa đọc` : 'Thông báo'}
        onPress={() => router.push('/notifications')}
      />
      {unread > 0 && (
        <View style={styles.badge} pointerEvents="none">
          <Text style={styles.badgeText}>{unread > 9 ? '9+' : unread}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: 10,
    backgroundColor: colors.danger,
    borderWidth: 2,
    borderColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
});
