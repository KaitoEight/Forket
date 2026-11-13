import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import { router } from 'expo-router';
import { Platform } from 'react-native';

import { supabase } from './supabase';

const isWeb = Platform.OS === 'web';

if (!isWeb) {
  // App đang mở → đã có banner trong app (InAppNotifications) nên không hiện thêm banner của hệ điều hành.
  // Riêng lời nhắc giờ hẹn (đặt trên máy) vẫn hiện.
  Notifications.setNotificationHandler({
    handleNotification: async (n) => {
      const local = n.request.content.data?.local === true;
      return {
        shouldShowBanner: local,
        shouldShowList: local,
        shouldPlaySound: false,
        shouldSetBadge: false,
      };
    },
  });
}

let currentToken: string | null = null;

/** Expo Go trên Android không nhận push từ xa (cần development build) */
function pushSupported() {
  if (isWeb || !Device.isDevice) return false;
  if (Platform.OS === 'android' && Constants.executionEnvironment === ExecutionEnvironment.StoreClient) return false;
  return true;
}

/** Xin quyền + lấy token + gửi lên server. Lỗi thì chỉ cảnh báo (push là tính năng thêm, không chặn app). */
export async function registerForPush() {
  if (!pushSupported()) return;
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Thông báo',
        importance: AndroidImportance.HIGH,
      });
    }
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') ({ status } = await Notifications.requestPermissionsAsync());
    if (status !== 'granted') return;

    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) {
      console.warn('Chưa có EAS projectId nên chưa bật được thông báo đẩy: chạy "npx eas-cli@latest init" một lần.');
      return;
    }
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    currentToken = token;
    const { error } = await supabase.rpc('register_push_token', { tok: token, plat: Platform.OS });
    if (error) console.warn('Không đăng ký được thông báo đẩy (đã chạy 20261114000000_push_notifications.sql chưa?):', error.message);
  } catch (e: any) {
    console.warn('Không bật được thông báo đẩy:', e?.message ?? e);
  }
}

/** Đăng xuất → máy này không nhận push của tài khoản cũ nữa (gọi TRƯỚC khi đăng xuất) */
export async function unregisterPush() {
  const token = currentToken;
  currentToken = null;
  if (!token) return;
  try {
    await supabase.rpc('remove_push_token', { tok: token });
  } catch {
    // mất mạng… bỏ qua; token sẽ được chuyển sang tài khoản kế tiếp khi họ đăng nhập
  }
}

type PushData = {
  type?: string;
  conversation_id?: string | null;
  post_id?: string | null;
  actor_id?: string | null;
};

/** Bấm vào push (hoặc lời nhắc giờ hẹn) → mở đúng màn */
export function openFromPush(data: PushData | undefined) {
  if (!data) return;
  if (data.conversation_id) {
    router.push({ pathname: '/chat/[id]', params: { id: data.conversation_id } });
    return;
  }
  switch (data.type) {
    case 'friend_request':
      router.push('/friends');
      return;
    case 'friend_accepted':
      if (data.actor_id) router.push({ pathname: '/user/[id]', params: { id: data.actor_id } });
      return;
    case 'reaction':
    case 'comment':
      router.navigate('/feed');
      return;
    default:
      router.push('/notifications');
  }
}

// ---------- Lời nhắc giờ hẹn "Rủ đi" (đặt trên máy, không cần server) ----------

const REMIND_BEFORE_MS = 30 * 60 * 1000;
const reminderId = (messageId: string) => `invite-${messageId}`;

/** Nhắc trước 30 phút. Giờ hẹn đã qua / còn dưới 1 phút thì bỏ qua. */
export async function scheduleInviteReminder(input: {
  messageId: string;
  conversationId: string;
  placeName: string;
  at: Date;
}) {
  if (isWeb) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(reminderId(input.messageId));
    const when = new Date(Math.max(input.at.getTime() - REMIND_BEFORE_MS, Date.now() + 60 * 1000));
    if (input.at.getTime() <= Date.now() + 60 * 1000) return;
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted' && (await Notifications.requestPermissionsAsync()).status !== 'granted') return;
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Thông báo',
        importance: AndroidImportance.HIGH,
      });
    }
    const time = input.at.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    await Notifications.scheduleNotificationAsync({
      identifier: reminderId(input.messageId),
      content: {
        title: 'Sắp đến giờ đi ăn 🍽️',
        body: `${input.placeName} lúc ${time}`,
        data: { local: true, type: 'invite_reminder', conversation_id: input.conversationId },
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: when },
    });
  } catch (e: any) {
    console.warn('Không đặt được lời nhắc:', e?.message ?? e);
  }
}

export async function cancelInviteReminder(messageId: string) {
  if (isWeb) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(reminderId(messageId));
  } catch {
    // chưa đặt lời nhắc nào → bỏ qua
  }
}
