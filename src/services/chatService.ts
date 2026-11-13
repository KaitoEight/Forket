import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { router } from 'expo-router';

import { requireUserId } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { readBytes } from './postService';
import { uploadSquareImage } from './profileService';

const NEEDS_CHAT_SQL =
  'Server chưa bật chat nhóm: hãy chạy file SQL 20261112020000_group_chat.sql trong Supabase.';

function chatError(e: { code?: string; message?: string }) {
  if (e.code === 'PGRST202' || e.code === '42703' || e.code === 'PGRST204') return new Error(NEEDS_CHAT_SQL);
  return new Error(e.message ?? String(e));
}

export type Conversation = {
  /** null = bạn bè chưa từng nhắn (bấm vào sẽ tạo cuộc trò chuyện) */
  conversation_id: string | null;
  is_group: boolean;
  title: string;
  other_id: string | null;
  other_username: string | null;
  other_avatar_url: string | null;
  member_count: number;
  last_body: string | null;
  last_kind: MessageKind | null;
  last_image_url: string | null;
  last_sender_id: string | null;
  last_sender_name: string | null;
  last_post_id: string | null;
  last_at: string | null;
  unread: number;
};

export type MessageKind = 'text' | 'image' | 'place' | 'invite' | 'bill' | 'wheel';

export type ChatPlace = {
  id: string;
  name: string;
  address: string | null;
  lat: number;
  lng: number;
  tags: string[] | null;
};

export type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  kind: MessageKind;
  body: string | null;
  image_url: string | null;
  post_id: string | null;
  place_id: string | null;
  created_at: string;
  /** Giờ hẹn của lời "Rủ đi" (nếu có) */
  invite_at?: string | null;
  /** Người được nhắc tên (@tên) trong tin này (chat nhóm) */
  mentions?: string[];
  /** @all: nhắc mọi người trong nhóm */
  mention_all?: boolean;
  sender: { id: string; username: string; display_name: string; avatar_url: string | null } | null;
  /** Ảnh được trả lời (nếu có) */
  post: { id: string; image_url: string; thumb_url: string | null } | null;
  place: ChatPlace | null;
};

export type ConversationInfo = {
  id: string;
  is_group: boolean;
  name: string | null;
  avatar_url?: string | null;
  created_by: string | null;
  members: {
    user_id: string;
    role: 'admin' | 'member';
    profile: { id: string; username: string; display_name: string; avatar_url: string | null };
  }[];
};

const BASE_MESSAGE_FIELDS =
  'id, conversation_id, sender_id, kind, body, image_url, post_id, place_id, created_at, ' +
  'sender:profiles!messages_sender_id_fkey(id, username, display_name, avatar_url), ' +
  'post:posts(id, image_url, thumb_url), place:places(id, name, address, lat, lng, tags)';
const MENTION_MESSAGE_FIELDS = BASE_MESSAGE_FIELDS.replace(
  'place_id, created_at,',
  'place_id, created_at, mentions, mention_all,'
);
const MESSAGE_FIELDS = MENTION_MESSAGE_FIELDS.replace('mention_all,', 'mention_all, invite_at,');

/** Thử từ đầy đủ cột → ít cột dần, để app vẫn chạy khi server chưa chạy hết các file SQL mới */
async function withFieldFallback<T>(
  run: (fields: string) => PromiseLike<{ data: T | null; error: { code?: string; message?: string } | null }>
) {
  let res = await run(MESSAGE_FIELDS);
  if (res.error?.code === '42703') res = await run(MENTION_MESSAGE_FIELDS);
  if (res.error?.code === '42703') res = await run(BASE_MESSAGE_FIELDS);
  return res;
}


// ---------- Danh sách / mở cuộc trò chuyện ----------

export async function fetchConversations(): Promise<Conversation[]> {
  const { data, error } = await supabase.rpc('get_conversations');
  if (error) throw chatError(error);
  return ((data ?? []) as Conversation[]).map((c) => ({
    ...c,
    unread: Number(c.unread ?? 0),
    member_count: Number(c.member_count ?? 0),
  }));
}

/** Id chat 1-1 với 1 người bạn (tạo nếu chưa có) */
export async function getDirectConversation(friendId: string): Promise<string> {
  const { data, error } = await supabase.rpc('get_or_create_direct', { friend: friendId });
  if (error) throw chatError(error);
  return data as string;
}

/** Mở khung chat 1-1 với 1 người bạn */
export async function openChatWith(friendId: string) {
  const id = await getDirectConversation(friendId);
  router.push({ pathname: '/chat/[id]', params: { id } });
}

const INFO_FIELDS =
  'id, is_group, name, avatar_url, created_by, members:conversation_members(user_id, role, profile:profiles(id, username, display_name, avatar_url))';

export async function fetchConversationInfo(conversationId: string): Promise<ConversationInfo | null> {
  const query = (fields: string) =>
    supabase.from('conversations').select(fields).eq('id', conversationId).maybeSingle();
  let res = await query(INFO_FIELDS);
  // Chưa chạy migration ảnh nhóm → tải không kèm ảnh
  if (res.error?.code === '42703') res = await query(INFO_FIELDS.replace(' avatar_url,', ''));
  if (res.error) throw chatError(res.error);
  return res.data as unknown as ConversationInfo | null;
}

// ---------- Tin nhắn ----------

export async function fetchMessages(conversationId: string, limit = 60): Promise<Message[]> {
  const res = await withFieldFallback((fields) =>
    supabase
      .from('messages')
      .select(fields)
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(limit)
  );
  if (res.error) throw chatError(res.error);
  return (res.data ?? []) as unknown as Message[];
}

export async function fetchMessageById(id: string): Promise<Message | null> {
  const res = await withFieldFallback((fields) => supabase.from('messages').select(fields).eq('id', id).maybeSingle());
  if (res.error) throw chatError(res.error);
  return res.data as unknown as Message | null;
}

async function insertMessage(row: Record<string, unknown>) {
  const me = await requireUserId();
  const { data, error } = await withFieldFallback((fields) =>
    supabase
      .from('messages')
      .insert({ sender_id: me, ...row })
      .select(fields)
      .single()
  );
  if (error) {
    if (error.code === '42501') throw new Error('Không gửi được: hai bạn không còn là bạn bè hoặc bạn đã rời nhóm.');
    // Cột của tính năng mới chưa có trên server → giữ nguyên lời báo để nơi gọi nói rõ file SQL cần chạy
    if (error.code === 'PGRST204' && /invite_at|mention/i.test(error.message ?? '')) throw new Error(error.message);
    throw chatError(error);
  }
  return data as unknown as Message;
}

export async function sendMessage(
  conversationId: string,
  body: string,
  postId?: string | null,
  mentions?: { userIds: string[]; all: boolean }
) {
  const text = body.trim();
  if (!text) return null;
  const row: Record<string, unknown> = {
    conversation_id: conversationId,
    kind: 'text',
    body: text,
    post_id: postId ?? null,
  };
  if (mentions && (mentions.userIds.length > 0 || mentions.all)) {
    row.mentions = mentions.userIds;
    row.mention_all = mentions.all;
  }
  try {
    return await insertMessage(row);
  } catch (e: any) {
    // Chưa chạy SQL nhắc tên → báo rõ thay vì "Could not find column"
    if (row.mentions && /mention/i.test(String(e?.message))) {
      throw new Error('Server chưa bật nhắc tên: hãy chạy file SQL 20261113000000_notifications_mentions.sql trong Supabase.');
    }
    throw e;
  }
}

/** Trả lời 1 ảnh trên Bảng tin → gửi vào chat 1-1 với chủ ảnh */
export async function replyToPost(authorId: string, postId: string, body: string) {
  const conv = await getDirectConversation(authorId);
  return sendMessage(conv, body, postId);
}

/** Gửi card quán: 'place' = chia sẻ, 'invite' = rủ đi ăn (có vote) */
export async function sendPlaceMessage(
  conversationId: string,
  placeId: string,
  kind: 'place' | 'invite',
  body?: string,
  inviteAt?: Date | null
) {
  const row: Record<string, unknown> = {
    conversation_id: conversationId,
    kind,
    place_id: placeId,
    body: body?.trim() || null,
  };
  if (kind === 'invite' && inviteAt) row.invite_at = inviteAt.toISOString();
  try {
    return await insertMessage(row);
  } catch (e: any) {
    if (row.invite_at && /invite_at/i.test(String(e?.message))) {
      throw new Error('Server chưa bật giờ hẹn: hãy chạy file SQL 20261114010000_wishlist_invite_time.sql trong Supabase.');
    }
    throw e;
  }
}

const CHAT_IMAGE_MAX = 1280;

/** Gửi ảnh (từ thư viện hoặc camera) trong chat, kèm chữ nếu có */
export async function sendImageMessage(
  conversationId: string,
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

  return insertMessage({
    conversation_id: conversationId,
    kind: 'image',
    body: body?.trim() || null,
    image_url: imageUrl,
  });
}

export async function markConversationRead(conversationId: string) {
  const { error } = await supabase.rpc('mark_conversation_read', { conv: conversationId });
  if (error) console.warn('Không đánh dấu đã đọc được:', error.message);
}

export async function countUnreadMessages() {
  const { data, error } = await supabase.rpc('count_unread_messages');
  if (error) throw chatError(error);
  return Number(data ?? 0);
}

// ---------- Nhóm ----------

export async function createGroup(name: string, memberIds: string[]) {
  const { data, error } = await supabase.rpc('create_group', { group_name: name, member_ids: memberIds });
  if (error) throw chatError(error);
  return data as string;
}

export async function addGroupMembers(conversationId: string, memberIds: string[]) {
  const { error } = await supabase.rpc('add_group_members', { conv: conversationId, member_ids: memberIds });
  if (error) throw chatError(error);
}

export async function removeGroupMember(conversationId: string, userId: string) {
  const { error } = await supabase.rpc('remove_group_member', { conv: conversationId, member: userId });
  if (error) throw chatError(error);
}

/** Đổi ảnh nhóm (trưởng nhóm); image = null → gỡ ảnh */
export async function setGroupAvatar(
  conversationId: string,
  image: { uri: string; width: number; height: number } | null
) {
  const url = image ? await uploadSquareImage(image, `groups/${conversationId}/${Date.now()}.jpg`) : null;
  const { error } = await supabase.rpc('set_group_avatar', { conv: conversationId, url });
  if (error) {
    if (error.code === 'PGRST202') {
      throw new Error('Server chưa bật ảnh nhóm: hãy chạy file SQL 20261112030000_group_avatar.sql trong Supabase.');
    }
    throw chatError(error);
  }
}

export async function renameGroup(conversationId: string, name: string) {
  const { error } = await supabase.rpc('rename_group', { conv: conversationId, group_name: name });
  if (error) throw chatError(error);
}

// ---------- Bảng tính tiền ----------

export type BillItem = {
  id: string;
  message_id: string;
  person_name: string;
  user_id: string | null;
  item_name: string | null;
  amount: number;
  created_by: string;
  created_at: string;
  /** Đã trả tiền chưa */
  paid: boolean;
};

const BILL_SQL = 'Server chưa bật bảng tính tiền: hãy chạy file SQL 20261112040000_bill_split.sql trong Supabase.';

function billError(e: { code?: string; message?: string }) {
  if (e.code === '42P01' || e.code === 'PGRST205') return new Error(BILL_SQL);
  if (e.code === '42501') return new Error('Bạn không có quyền sửa dòng này.');
  return new Error(e.message ?? String(e));
}

/** Gửi 1 bảng tính tiền (tiêu đề lưu ở body) vào cuộc trò chuyện */
export async function sendBillMessage(conversationId: string, title: string) {
  try {
    return await insertMessage({ conversation_id: conversationId, kind: 'bill', body: title.trim() || 'Tính tiền' });
  } catch (e: any) {
    // Chưa chạy migration → ràng buộc kind từ chối loại tin 'bill'
    if (String(e?.message).includes('messages_kind_check')) throw new Error(BILL_SQL);
    throw e;
  }
}

const BILL_FIELDS = 'id, message_id, person_name, user_id, item_name, amount, created_by, created_at, paid';

export async function fetchBillItems(messageIds: string[]): Promise<BillItem[]> {
  if (messageIds.length === 0) return [];
  const query = (fields: string) =>
    supabase.from('bill_items').select(fields).in('message_id', messageIds).order('created_at', { ascending: true });
  let res = await query(BILL_FIELDS);
  // Chưa chạy migration "đã trả" (chưa có cột paid) → tải không kèm paid
  if (res.error?.code === '42703') res = await query(BILL_FIELDS.replace(', paid', ''));
  if (res.error) throw billError(res.error);
  return ((res.data ?? []) as unknown as BillItem[]).map((i) => ({
    ...i,
    amount: Number(i.amount),
    paid: !!i.paid,
  }));
}

const BILL_PAID_SQL =
  'Server chưa bật tính năng này: hãy chạy file SQL 20261112050000_bill_paid_rename.sql trong Supabase.';

/** Tick / bỏ tick "đã trả" của 1 dòng */
export async function setBillItemPaid(itemId: string, paid: boolean) {
  const { error } = await supabase.rpc('set_bill_item_paid', { item: itemId, is_paid: paid });
  if (error) {
    if (error.code === 'PGRST202') throw new Error(BILL_PAID_SQL);
    throw new Error(error.message);
  }
}

/** Đổi tên bảng (người tạo bảng) */
export async function renameBill(messageId: string, title: string) {
  const { error } = await supabase.rpc('rename_bill', { msg: messageId, new_title: title });
  if (error) {
    if (error.code === 'PGRST202') throw new Error(BILL_PAID_SQL);
    throw new Error(error.message);
  }
}

export type BillItemInput = {
  person_name: string;
  user_id: string | null;
  amount: number;
  item_name: string | null;
};

export async function addBillItem(messageId: string, input: BillItemInput) {
  const me = await requireUserId();
  const { error } = await supabase.from('bill_items').insert({ ...input, message_id: messageId, created_by: me });
  if (error) throw billError(error);
}

export async function updateBillItem(itemId: string, input: BillItemInput) {
  const { data, error } = await supabase.from('bill_items').update(input).eq('id', itemId).select('id');
  if (error) throw billError(error);
  // RLS từ chối thì không báo lỗi mà trả về 0 dòng
  if (!data || data.length === 0) throw new Error('Bạn không có quyền sửa dòng này.');
}

export async function deleteBillItem(itemId: string) {
  const { data, error } = await supabase.from('bill_items').delete().eq('id', itemId).select('id');
  if (error) throw billError(error);
  if (!data || data.length === 0) throw new Error('Bạn không có quyền xoá dòng này.');
}

/** Lắng nghe dòng bảng tính tiền thay đổi (thêm/sửa/xoá). Trả về hàm huỷ. */
export function subscribeToBillItems(onChange: (messageId: string | null) => void) {
  const channel = supabase
    .channel(`bill-items-${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'bill_items' }, (payload) => {
      const row = (payload.new as { message_id?: string }) ?? {};
      const old = (payload.old as { message_id?: string }) ?? {};
      onChange(row.message_id ?? old.message_id ?? null);
    })
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}

// ---------- Vote "Rủ đi" ----------

export type Vote = { message_id: string; user_id: string; choice: 'go' | 'no' };

export async function fetchVotes(messageIds: string[]): Promise<Vote[]> {
  if (messageIds.length === 0) return [];
  const { data, error } = await supabase
    .from('invite_votes')
    .select('message_id, user_id, choice')
    .in('message_id', messageIds);
  if (error) throw chatError(error);
  return (data ?? []) as Vote[];
}

/** Bấm "Đi"/"Thôi": chưa chọn → chọn; bấm lại đúng lựa chọn cũ → bỏ */
export async function castVote(messageId: string, choice: 'go' | 'no', current: 'go' | 'no' | null) {
  const me = await requireUserId();
  if (current === choice) {
    const { error } = await supabase.from('invite_votes').delete().eq('message_id', messageId).eq('user_id', me);
    if (error) throw chatError(error);
    return;
  }
  const { error } = await supabase
    .from('invite_votes')
    .upsert({ message_id: messageId, user_id: me, choice, updated_at: new Date().toISOString() });
  if (error) throw chatError(error);
}

// ---------- Realtime ----------

/** Lắng nghe tin nhắn mới trong mọi cuộc trò chuyện của tôi (RLS tự lọc). Trả về hàm huỷ. */
export function subscribeToMessages(onMessage: (messageId: string, conversationId: string, senderId: string) => void) {
  const channel = supabase
    .channel(`messages-${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
      const row = payload.new as { id?: string; conversation_id?: string; sender_id?: string };
      if (row.id && row.conversation_id && row.sender_id) onMessage(row.id, row.conversation_id, row.sender_id);
    })
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}

/** Lắng nghe tin nhắn bị sửa (VD: đổi tên bảng tính tiền). Trả về hàm huỷ. */
export function subscribeToMessageUpdates(onUpdate: (messageId: string, conversationId: string) => void) {
  const channel = supabase
    .channel(`message-updates-${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, (payload) => {
      const row = payload.new as { id?: string; conversation_id?: string };
      if (row.id && row.conversation_id) onUpdate(row.id, row.conversation_id);
    })
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}

/** Lắng nghe vote thay đổi (thêm/sửa/xoá). Trả về hàm huỷ. */
export function subscribeToVotes(onChange: (messageId: string | null) => void) {
  const channel = supabase
    .channel(`votes-${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'invite_votes' }, (payload) => {
      const row = (payload.new as { message_id?: string }) ?? {};
      const old = (payload.old as { message_id?: string }) ?? {};
      onChange(row.message_id ?? old.message_id ?? null);
    })
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}

export function previewText(c: Pick<Conversation, 'last_body' | 'last_kind' | 'last_post_id' | 'last_image_url' | 'last_at'>) {
  if (!c.last_at) return 'Nhắn tin cho bạn này nhé 👋';
  if (c.last_kind === 'bill') return `🧾 ${c.last_body?.trim() || 'Bảng tính tiền'}`;
  if (c.last_kind === 'wheel') return `🎡 ${c.last_body?.trim() || 'Vòng quay'}`;
  if (c.last_kind === 'invite') return '🍽️ Rủ đi ăn';
  if (c.last_kind === 'place') return '📍 Đã chia sẻ một quán';
  if (c.last_image_url) return c.last_body ? `🖼️ ${c.last_body}` : '🖼️ Đã gửi một ảnh';
  if (c.last_post_id) return `💬 Trả lời ảnh: ${c.last_body ?? ''}`;
  return c.last_body ?? '';
}
