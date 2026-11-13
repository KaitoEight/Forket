import { requireUserId } from '../lib/auth';
import { supabase } from '../lib/supabase';

export type Comment = {
  id: string;
  post_id: string;
  user_id: string;
  body: string;
  created_at: string;
  author: { id: string; username: string; display_name: string; avatar_url: string | null } | null;
};

const NEEDS_SQL =
  'Server chưa bật bình luận: hãy chạy file SQL 20261114020000_comments_dishes_hours.sql trong Supabase.';

function commentError(e: { code?: string; message?: string }) {
  if (e.code === 'PGRST205' || e.code === '42P01' || e.code === 'PGRST200') return new Error(NEEDS_SQL);
  return new Error(e.message ?? String(e));
}

export async function fetchComments(postId: string): Promise<Comment[]> {
  const { data, error } = await supabase
    .from('post_comments')
    .select('id, post_id, user_id, body, created_at, author:profiles(id, username, display_name, avatar_url)')
    .eq('post_id', postId)
    .order('created_at', { ascending: true })
    .limit(200);
  if (error) throw commentError(error);
  return (data ?? []) as unknown as Comment[];
}

export async function addComment(postId: string, body: string): Promise<Comment> {
  const text = body.trim();
  if (!text) throw new Error('Bình luận trống.');
  const me = await requireUserId();
  const { data, error } = await supabase
    .from('post_comments')
    .insert({ post_id: postId, user_id: me, body: text })
    .select('id, post_id, user_id, body, created_at, author:profiles(id, username, display_name, avatar_url)')
    .single();
  if (error) throw commentError(error);
  return data as unknown as Comment;
}

export async function deleteComment(id: string) {
  const { error } = await supabase.from('post_comments').delete().eq('id', id);
  if (error) throw commentError(error);
}

/** Số bình luận của nhiều ảnh (chưa chạy SQL → rỗng, không báo lỗi) */
export async function fetchCommentCounts(postIds: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (postIds.length === 0) return counts;
  const { data, error } = await supabase.from('post_comments').select('post_id').in('post_id', postIds);
  if (error) return counts;
  for (const row of data ?? []) {
    const id = (row as { post_id: string }).post_id;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}

/** Bình luận thêm / xoá ở bất kỳ ảnh nào bạn thấy (RLS tự lọc). Trả về hàm huỷ. */
export function subscribeToComments(onChange: (postId: string | null) => void) {
  const channel = supabase
    .channel(`comments-${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'post_comments' }, (payload) => {
      const row = (payload.new ?? payload.old) as { post_id?: string } | null;
      onChange(row?.post_id ?? null);
    })
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}
