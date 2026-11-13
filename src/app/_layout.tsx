import { DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';

import { InAppNotifications } from '@/components/InAppNotifications';
import { colors, isDark } from '@/constants/theme';
import { AlertHost } from '@/lib/appAlert';
import { AuthProvider, useAuth } from '@/lib/auth';
import { openFromPush, registerForPush } from '@/lib/push';
import { loadCategories } from '@/services/categoryService';
import { clearMustTry, loadMustTry } from '@/services/mustTryService';
import { clearWishlist, loadWishlist } from '@/services/wishlistService';

const navTheme = {
  ...DefaultTheme,
  dark: isDark,
  colors: {
    ...DefaultTheme.colors,
    background: colors.bg,
    card: colors.bg,
    text: colors.text,
    primary: colors.accent,
    border: colors.border,
  },
};

// Tab bar (Bản đồ · Bảng tin · Check-in · Tin nhắn · Hồ sơ) là màn chính.
// Camera mở toàn màn hình từ nút Check-in; Bạn bè, chat, hồ sơ, cài đặt mở chồng lên trên.
export default function RootLayout() {
  return (
    <ThemeProvider value={navTheme}>
      <AuthProvider>
        <RootStack />
      </AuthProvider>
      {/* Hộp thoại xác nhận/menu trên web (Alert của react-native-web không hiện nhiều nút) */}
      <AlertHost />
    </ThemeProvider>
  );
}

function RootStack() {
  const { session, loading } = useAuth();
  const userId = session?.user.id;

  // Đăng nhập xong → nạp danh sách loại quán từ server (lỗi thì dùng danh sách dự phòng trong app)
  useEffect(() => {
    if (userId) loadCategories().catch((e) => console.warn('Không nạp được loại quán:', e?.message ?? e));
  }, [userId]);

  // Đăng nhập xong → đăng ký nhận thông báo đẩy cho máy này
  useEffect(() => {
    if (userId) registerForPush();
  }, [userId]);

  // Danh sách "Muốn đi" và "Must try" của tài khoản đang dùng (đăng xuất thì xoá khỏi bộ nhớ)
  useEffect(() => {
    if (userId) {
      loadWishlist().catch(() => {});
      loadMustTry().catch(() => {});
    } else {
      clearWishlist();
      clearMustTry();
    }
  }, [userId]);

  if (loading) {
    return (
      <View style={styles.splash}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  const signedIn = !!session;
  return (
    <>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Protected guard={signedIn}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen
            name="camera"
            options={{
              presentation: 'fullScreenModal',
              animation: 'slide_from_bottom',
            }}
          />
          <Stack.Screen name="friends" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="chat/[id]" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="chat/new-group" options={{ animation: 'slide_from_bottom' }} />
          <Stack.Screen name="chat/info/[id]" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="share-place" options={{ animation: 'slide_from_bottom' }} />
          <Stack.Screen name="user/[id]" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="notifications" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="wishlist" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="must-try" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="wrapped" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="qr" options={{ animation: 'slide_from_bottom' }} />
          <Stack.Screen name="add/[code]" />
          <Stack.Screen name="settings/index" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="settings/profile" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="settings/privacy" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="settings/blocked" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="settings/password" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen
            name="intro"
            options={{
              presentation: 'fullScreenModal',
              animation: 'slide_from_bottom',
            }}
          />
        </Stack.Protected>
        {/* Chưa đăng nhập: màn chào (người mới / chào lại) → đăng nhập, đăng ký */}
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="welcome" />
          <Stack.Screen name="sign-in" options={{ animation: 'slide_from_right' }} />
        </Stack.Protected>
      </Stack>
      {/* Banner khi có lời mời kết bạn / tin nhắn mới */}
      {session && <InAppNotifications userId={session.user.id} />}
      {session && Platform.OS !== 'web' && <PushTaps />}
    </>
  );
}

/** Bấm vào thông báo đẩy (kể cả lúc app đang đóng) → mở đúng màn */
function PushTaps() {
  const response = Notifications.useLastNotificationResponse();
  useEffect(() => {
    if (!response) return;
    if (response.actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER) {
      openFromPush(response.notification.request.content.data as Parameters<typeof openFromPush>[0]);
    }
    Notifications.clearLastNotificationResponseAsync();
  }, [response]);
  return null;
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
