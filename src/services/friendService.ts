import { requireUserId, type Profile } from '../lib/auth';
import { supabase } from '../lib/supabase';

export type Relation = 'none' | 'friends' | 'outgoing' | 'incoming';

export type FriendEntry = {
  friendshipId: string;
  relation: Exclude<Relation, 'none'>;
  user: Profile;
};

const PROFILE_FIELDS = 'id, username, display_name, avatar_url';

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

/** Tìm người dùng theo username hoặc tên hiển thị (trừ chính mình) */
export async function searchUsers(query: string): Promise<Profile[]> {
  const me = await requireUserId();
  const q = query.trim().replace(/^@/, '').replace(/[%_,()"\\]/g, '');
  if (q.length < 2) return [];
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
