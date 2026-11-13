import { router } from 'expo-router';
import type { ComponentProps } from 'react';
import type Ionicons from '@expo/vector-icons/Ionicons';

import { formatMoney } from '../lib/money';
import { requireUserId } from '../lib/auth';
import { supabase } from '../lib/supabase';

export type NotificationType =
  | 'friend_request'
  | 'friend_accepted'
  | 'reaction'
  | 'group_added'
  | 'mention'
  | 'mention_all'
  | 'bill_item'
  | 'comment';

export type AppNotification = {
  id: string;
  type: NotificationType;
  actor: { id: string; username: string; display_name: string; avatar_url: string | null } | null;
  post_id: string | null;
  conversation_id: string | null;
  message_id: string | null;
  data: Record<string, any>;
  read_at: string | null;
  created_at: string;
};

const NEEDS_SQL =
  'Server chưa bật thông báo: hãy chạy file SQL 20261113000000_notifications_mentions.sql trong Supabase.';

const FIELDS =
  'id, type, post_id, conversation_id, message_id, data, read_at, created_at, ' +
  'actor:profiles!notifications_actor_id_fkey(id, username, display_name, avatar_url)';

export async function fetchNotifications(limit = 100): Promise<AppNotification[]> {
  const me = await requireUserId();
  const { data, error } = await supabase
    .from('notifications')
    .select(FIELDS)
    .eq('user_id', me)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    if (error.code === 'PGRST205' || error.code === '42P01' || error.code === 'PGRST200') throw new Error(NEEDS_SQL);
    throw error;
  }
  return (data ?? []) as unknown as AppNotification[];
}

/** Số thông báo chưa đọc (chưa chạy SQL → 0, không báo lỗi) */
export async function countUnreadNotifications() {
  const me = await requireUserId();
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', me)
    .is('read_at', null);
  if (error) return 0;
  return count ?? 0;
}

/** Đánh dấu đã đọc: không truyền ids → tất cả */
export async function markNotificationsRead(ids?: string[]) {
  const { error } = await supabase.rpc('mark_notifications_read', { ids: ids ?? null });
  if (error) console.warn('Không đánh dấu đã đọc được:', error.message);
}

export async function deleteNotification(id: string) {
  const { error } = await supabase.from('notifications').delete().eq('id', id);
  if (error) throw error;
}

/**
 * Lắng nghe thông báo của tôi.
 * onInsert: thông báo mới (id) · onChange: bất kỳ thay đổi nào (để cập nhật số chưa đọc)
 */
export function subscribeToNotifications(
  userId: string,
  handlers: { onInsert?: (notificationId: string) => void; onChange?: () => void }
) {
  const channel = supabase
    .channel(`notifications-${userId}-${Math.random().toString(36).slice(2)}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
      (payload) => {
        const id = (payload.new as { id?: string }).id;
        if (id) handlers.onInsert?.(id);
        handlers.onChange?.();
      }
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
      () => handlers.onChange?.()
    )
    .on(
      'postgres_changes',
      // Sự kiện DELETE không lọc theo cột được; RLS đã chỉ gửi thông báo của tôi
      { event: 'DELETE', schema: 'public', table: 'notifications' },
      () => handlers.onChange?.()
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}

export async function fetchNotificationById(id: string): Promise<AppNotification | null> {
  const { data, error } = await supabase.from('notifications').select(FIELDS).eq('id', id).maybeSingle();
  if (error) return null;
  return data as unknown as AppNotification | null;
}

type IconName = ComponentProps<typeof Ionicons>['name'];

/** Nội dung hiển thị của 1 thông báo */
export function describeNotification(n: AppNotification): { text: string; icon: IconName; tint: 'accent' | 'caramel' | 'danger' } {
  const who = n.actor?.display_name ?? 'Ai đó';
  const preview = typeof n.data?.preview === 'string' && n.data.preview ? `: “${n.data.preview}”` : '';
  switch (n.type) {
    case 'friend_request':
      return { text: `${who} muốn kết bạn với bạn`, icon: 'person-add', tint: 'caramel' };
    case 'friend_accepted':
      return { text: `${who} đã chấp nhận lời mời kết bạn`, icon: 'people', tint: 'accent' };
    case 'reaction':
      return { text: `${who} đã thả ${n.data?.emoji ?? '❤️'} vào ảnh của bạn`, icon: 'heart', tint: 'danger' };
    case 'group_added':
      return {
        text: `${who} đã thêm bạn vào nhóm${n.data?.name ? ` “${n.data.name}”` : ''}`,
        icon: 'people-circle',
        tint: 'accent',
      };
    case 'mention':
      return { text: `${who} đã nhắc đến bạn${preview}`, icon: 'at', tint: 'accent' };
    case 'mention_all':
      return { text: `${who} đã nhắc mọi người trong nhóm${preview}`, icon: 'megaphone', tint: 'caramel' };
    case 'comment':
      return { text: `${who} đã bình luận ảnh của bạn${preview}`, icon: 'chatbubble', tint: 'accent' };
    case 'bill_item': {
      const amount = Number(n.data?.amount);
      return {
        text: `${who} ghi bạn vào bảng tính tiền${Number.isFinite(amount) ? `: ${formatMoney(amount)}` : ''}`,
        icon: 'receipt',
        tint: 'caramel',
      };
    }
  }
}

/** Mở màn tương ứng với thông báo */
export function openNotification(n: AppNotification) {
  switch (n.type) {
    case 'friend_request':
      router.push('/friends');
      return;
    case 'friend_accepted':
      if (n.actor) router.push({ pathname: '/user/[id]', params: { id: n.actor.id } });
      return;
    case 'reaction':
    case 'comment':
      router.navigate('/feed');
      return;
    case 'group_added':
    case 'mention':
    case 'mention_all':
    case 'bill_item':
      if (n.conversation_id) router.push({ pathname: '/chat/[id]', params: { id: n.conversation_id } });
      return;
  }
}
