import { requireUserId } from '../lib/auth';
import { supabase } from '../lib/supabase';

export const QUICK_EMOJIS = ['❤️', '🔥', '😋', '😂', '😍'] as const;

export type Reaction = {
  emoji: string;
  user_id: string;
  user: { display_name: string; username: string } | null;
};

/** Bấm emoji: chưa thả → thả; đã thả rồi → bỏ */
export async function toggleReaction(postId: string, emoji: string, alreadyReacted: boolean) {
  const me = await requireUserId();
  if (alreadyReacted) {
    const { error } = await supabase
      .from('reactions')
      .delete()
      .eq('post_id', postId)
      .eq('user_id', me)
      .eq('emoji', emoji);
    if (error) throw error;
    return;
  }
  const { error } = await supabase.from('reactions').insert({ post_id: postId, user_id: me, emoji });
  // Đã thả rồi (bấm 2 lần quá nhanh) → coi như thành công
  if (error && error.code !== '23505') throw error;
}

/** Gom cảm xúc: [{ emoji, count, mine }] theo số lượng giảm dần */
export function summarizeReactions(reactions: Reaction[], meId: string | undefined) {
  const map = new Map<string, { emoji: string; count: number; mine: boolean }>();
  for (const r of reactions) {
    const e = map.get(r.emoji) ?? { emoji: r.emoji, count: 0, mine: false };
    e.count++;
    if (r.user_id === meId) e.mine = true;
    map.set(r.emoji, e);
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
}

/** Lắng nghe cảm xúc mới (để chủ ảnh thấy ngay). Trả về hàm huỷ. */
export function subscribeToReactions(onPostChanged: (postId: string) => void) {
  const channel = supabase
    .channel(`reactions-${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'reactions' }, (payload) => {
      const postId = (payload.new as { post_id?: string }).post_id;
      if (postId) onPostChanged(postId);
    })
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}
