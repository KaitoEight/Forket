import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { requireUserId } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { readBytes } from './postService';

export type Conversation = {
  friend_id: string;
  username: string;
  display_name: string;
  last_body: string | null;
  last_image_url?: string | null;
  last_sender_id: string | null;
  last_post_id: string | null;
  last_at: string | null;
  unread: number;
};

export type Message = {
  id: string;
  sender_id: string;
  receiver_id: string;
  body: string | null;
  /** Ảnh gửi trong chat */
  image_url?: string | null;
  post_id: string | null;
  created_at: string;
  read_at: string | null;
  /** Ảnh được trả lời (nếu có) */
  post: { id: string; image_url: string; thumb_url: string | null } | null;
};

const MESSAGE_FIELDS =
  'id, sender_id, receiver_id, body, image_url, post_id, created_at, read_at, post:posts(id, image_url, thumb_url)';
// Server chưa chạy migration ảnh trong chat (chưa có cột image_url)
const MESSAGE_FIELDS_NO_IMAGE = MESSAGE_FIELDS.replace(' image_url,', '');

async function selectMessages<T>(
  build: (fields: string) => PromiseLike<{ data: T; error: { code?: string } | null }>
) {
  let res = await build(MESSAGE_FIELDS);
  if (res.error?.code === '42703') res = await build(MESSAGE_FIELDS_NO_IMAGE);
  if (res.error) throw res.error;
  return res.data;
}

export async function fetchConversations(): Promise<Conversation[]> {
  const { data, error } = await supabase.rpc('get_conversations');
  if (error) throw error;
  return ((data ?? []) as Conversation[]).map((c) => ({ ...c, unread: Number(c.unread ?? 0) }));
}

/** Tin nhắn giữa tôi và 1 người bạn, mới nhất trước */
export async function fetchMessages(friendId: string, limit = 60): Promise<Message[]> {
  const me = await requireUserId();
  const data = await selectMessages((fields) =>
    supabase
      .from('messages')
      .select(fields)
      .or(
        `and(sender_id.eq.${me},receiver_id.eq.${friendId}),and(sender_id.eq.${friendId},receiver_id.eq.${me})`
      )
      .order('created_at', { ascending: false })
      .limit(limit)
  );
  return (data ?? []) as unknown as Message[];
}

export async function fetchMessageById(id: string): Promise<Message | null> {
  const data = await selectMessages((fields) =>
    supabase.from('messages').select(fields).eq('id', id).maybeSingle()
  );
  return data as unknown as Message | null;
}

export async function sendMessage(receiverId: string, body: string, postId?: string | null) {
  const me = await requireUserId();
  const text = body.trim();
  if (!text) return null;
  const data = await selectMessages((fields) =>
    supabase
      .from('messages')
      .insert({ sender_id: me, receiver_id: receiverId, body: text, post_id: postId ?? null })
      .select(fields)
      .single()
  );
  return data as unknown as Message;
}

const CHAT_IMAGE_MAX = 1280;

/** Gửi ảnh (từ thư viện hoặc camera) trong chat, kèm chữ nếu có */
export async function sendImageMessage(
  receiverId: string,
  image: { uri: string; width: number; height: number },
  body?: string
) {
  const me = await requireUserId();

  // Thu nhỏ cạnh dài nhất còn 1280px để gửi nhanh, tiết kiệm dung lượng
  let context = ImageManipulator.manipulate(image.uri);
  const longest = Math.max(image.width, image.height);
  if (longest > CHAT_IMAGE_MAX) {
    context =
      image.width >= image.height
        ? context.resize({ width: CHAT_IMAGE_MAX })
        : context.resize({ height: CHAT_IMAGE_MAX });
  }
  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({ compress: 0.75, format: SaveFormat.JPEG });

  const bytes = await readBytes(saved.uri);
  if (bytes.byteLength < 1024) throw new Error('Đọc ảnh thất bại, thử lại nhé.');
  const path = `chat/${me}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  const { error: uploadError } = await supabase.storage
    .from('photos')
    .upload(path, bytes, { contentType: 'image/jpeg' });
  if (uploadError) throw uploadError;
  const imageUrl = supabase.storage.from('photos').getPublicUrl(path).data.publicUrl;

  const { data, error } = await supabase
    .from('messages')
    .insert({ sender_id: me, receiver_id: receiverId, body: body?.trim() || null, image_url: imageUrl })
    .select(MESSAGE_FIELDS)
    .single();
  if (error?.code === 'PGRST204' || error?.code === '42703') {
    throw new Error(
      'Server chưa bật gửi ảnh trong chat: hãy chạy file SQL 20261110050000_chat_images.sql trong Supabase.'
    );
  }
  if (error) throw error;
  return data as unknown as Message;
}

export async function markChatRead(friendId: string) {
  const { error } = await supabase.rpc('mark_chat_read', { friend: friendId });
  if (error) console.warn('Không đánh dấu đã đọc được:', error.message);
}

export async function countUnreadMessages() {
  const me = await requireUserId();
  const { count, error } = await supabase
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('receiver_id', me)
    .is('read_at', null);
  if (error) throw error;
  return count ?? 0;
}

/** Lắng nghe tin nhắn gửi tới tôi. Trả về hàm huỷ. */
export function subscribeToIncomingMessages(userId: string, onMessage: (messageId: string, senderId: string) => void) {
  const channel = supabase
    .channel(`messages-${userId}-${Math.random().toString(36).slice(2)}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages', filter: `receiver_id=eq.${userId}` },
      (payload) => {
        const row = payload.new as { id?: string; sender_id?: string };
        if (row.id && row.sender_id) onMessage(row.id, row.sender_id);
      }
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}

export function previewText(c: Pick<Conversation, 'last_body' | 'last_post_id' | 'last_image_url' | 'last_at'>) {
  if (!c.last_at) return 'Nhắn tin cho bạn này nhé 👋';
  if (c.last_image_url) return c.last_body ? `🖼️ ${c.last_body}` : '🖼️ Đã gửi một ảnh';
  if (c.last_post_id) return `💬 Trả lời ảnh: ${c.last_body ?? ''}`;
  return c.last_body ?? '';
}
