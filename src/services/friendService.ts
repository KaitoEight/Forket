import { requireUserId, type Profile } from '../lib/auth';
import { supabase } from '../lib/supabase';

export type Relation = 'none' | 'friends' | 'outgoing' | 'incoming';

export type FriendEntry = {
  friendshipId: string;
  relation: Exclude<Relation, 'none'>;
  user: Profile;
};

const PROFILE_FIELDS = 'id, username, display_name, avatar_url';

export type { Profile };

/** Tất cả quan hệ của tôi: bạn bè, lời mời đã gửi, lời mời nhận được */
export async function fetchFriendships(): Promise<FriendEntry[]> {
  const me = await requireUserId();
  const { data, error } = await supabase
    .from('friendships')
    .select(
      `id, status, requester_id, addressee_id,
       requester:profiles!friendships_requester_id_fkey(${PROFILE_FIELDS}),
       addressee:profiles!friendships_addressee_id_fkey(${PROFILE_FIELDS})`
    )
    .order('created_at', { ascending: false });
  if (error) throw error;

  return (data ?? []).map((row: any) => {
    const iAmRequester = row.requester_id === me;
    return {
      friendshipId: row.id,
      relation: row.status === 'accepted' ? 'friends' : iAmRequester ? 'outgoing' : 'incoming',
      user: (iAmRequester ? row.addressee : row.requester) as Profile,
    };
  });
}

/** Tìm người dùng theo username hoặc tên hiển thị (trừ chính mình, người ẩn khỏi tìm kiếm, người đã chặn) */
export async function searchUsers(query: string): Promise<Profile[]> {
  const me = await requireUserId();
  const q = query.trim().replace(/^@/, '').replace(/[%_,()"\\]/g, '');
  if (q.length < 2) return [];
  const rpc = await supabase.rpc('search_users', { q });
  if (!rpc.error) return (rpc.data ?? []) as Profile[];
  if (rpc.error.code !== 'PGRST202') throw rpc.error;

  // Server chưa chạy migration quyền riêng tư → tìm trực tiếp như cũ
  const { data, error } = await supabase
    .from('profiles')
    .select(PROFILE_FIELDS)
    // Bọc giá trị trong "…" để username có dấu chấm (an.nguyen) không làm hỏng bộ lọc
    .or(`username.ilike."${q}%",display_name.ilike."%${q}%"`)
    .neq('id', me)
    .limit(20);
  if (error) throw error;
  return (data ?? []) as Profile[];
}

export async function sendFriendRequest(userId: string) {
  const me = await requireUserId();
  const { error } = await supabase
    .from('friendships')
    .insert({ requester_id: me, addressee_id: userId, status: 'pending' });
  if (error?.code === '23505') throw new Error('Hai bạn đã có lời mời hoặc đã là bạn bè.');
  if (error) throw error;
}

export async function acceptFriendRequest(friendshipId: string) {
  const { error } = await supabase
    .from('friendships')
    .update({ status: 'accepted' })
    .eq('id', friendshipId);
  if (error) throw error;
}

/** Từ chối lời mời / huỷ lời mời đã gửi / huỷ kết bạn */
export async function removeFriendship(friendshipId: string) {
  const { error } = await supabase.from('friendships').delete().eq('id', friendshipId);
  if (error) throw error;
}

export async function countIncomingRequests() {
  const me = await requireUserId();
  const { count, error } = await supabase
    .from('friendships')
    .select('id', { count: 'exact', head: true })
    .eq('addressee_id', me)
    .eq('status', 'pending');
  if (error) throw error;
  return count ?? 0;
}

/** Tìm người theo mã kết bạn (quét QR) */
export async function findUserByCode(code: string): Promise<Profile | null> {
  const { data, error } = await supabase.rpc('find_user_by_code', { code });
  if (error) {
    if (error.code === 'PGRST202') {
      throw new Error('Server chưa bật mã QR: hãy chạy file SQL 20261112000000_profile_privacy.sql trong Supabase.');
    }
    throw error;
  }
  return ((data ?? []) as Profile[])[0] ?? null;
}

/** Quan hệ giữa tôi và 1 người */
export async function fetchRelation(userId: string): Promise<{ relation: Relation; friendshipId: string | null }> {
  const me = await requireUserId();
  const { data, error } = await supabase
    .from('friendships')
    .select('id, status, requester_id')
    .or(
      `and(requester_id.eq.${me},addressee_id.eq.${userId}),and(requester_id.eq.${userId},addressee_id.eq.${me})`
    )
    .maybeSingle();
  if (error) throw error;
  if (!data) return { relation: 'none', friendshipId: null };
  const relation: Relation =
    data.status === 'accepted' ? 'friends' : data.requester_id === me ? 'outgoing' : 'incoming';
  return { relation, friendshipId: data.id };
}

/** Danh sách bạn bè (đã chấp nhận) */
export async function fetchFriends(): Promise<Profile[]> {
  return (await fetchFriendships()).filter((e) => e.relation === 'friends').map((e) => e.user);
}

// ---------- Chặn ----------

export async function blockUser(userId: string) {
  const { error } = await supabase.rpc('block_user', { target: userId });
  if (error) {
    if (error.code === 'PGRST202') {
      throw new Error('Server chưa bật tính năng chặn: hãy chạy file SQL 20261112000000_profile_privacy.sql.');
    }
    throw error;
  }
}

export async function unblockUser(userId: string) {
  const me = await requireUserId();
  const { error } = await supabase.from('blocks').delete().eq('blocker_id', me).eq('blocked_id', userId);
  if (error) throw error;
}

export async function fetchBlockedUsers(): Promise<Profile[]> {
  const { data, error } = await supabase.rpc('get_blocked_users');
  if (error) throw error;
  return (data ?? []) as Profile[];
}

/** Tôi và người này có chặn nhau không (theo bất kỳ chiều nào) */
export async function isBlockedBetween(userId: string) {
  const me = await requireUserId();
  const { data, error } = await supabase.rpc('is_blocked_between', { a: me, b: userId });
  if (error) return false; // chưa chạy migration → coi như không chặn
  return !!data;
}

/** Lắng nghe lời mời kết bạn MỚI gửi tới tôi (để hiện thông báo). Trả về hàm huỷ. */
export function subscribeToIncomingRequests(userId: string, onRequest: (requesterId: string) => void) {
  const channel = supabase
    .channel(`friend-requests-${userId}-${Math.random().toString(36).slice(2)}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'friendships', filter: `addressee_id=eq.${userId}` },
      (payload) => {
        const row = payload.new as { requester_id?: string; status?: string };
        if (row.requester_id && row.status === 'pending') onRequest(row.requester_id);
      }
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}

/** Lắng nghe thay đổi lời mời/kết bạn liên quan tới tôi. Trả về hàm huỷ. */
export function subscribeToFriendships(userId: string, onChange: () => void) {
  const channel = supabase
    .channel(`friendships-${userId}-${Math.random().toString(36).slice(2)}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'friendships', filter: `addressee_id=eq.${userId}` },
      onChange
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'friendships', filter: `requester_id=eq.${userId}` },
      onChange
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}
