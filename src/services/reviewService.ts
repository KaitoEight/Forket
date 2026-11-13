import { requireUserId } from '../lib/auth';
import { supabase } from '../lib/supabase';

export type Review = {
  id: string;
  place_id: string;
  user_id: string;
  rating: number;
  comment: string | null;
  updated_at: string;
  author: { id: string; username: string; display_name: string } | null;
};

export async function fetchReviews(placeId: string): Promise<Review[]> {
  const { data, error } = await supabase
    .from('reviews')
    .select(
      'id, place_id, user_id, rating, comment, updated_at, author:profiles(id, username, display_name)'
    )
    .eq('place_id', placeId)
    .order('updated_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []) as unknown as Review[];
}

/** Viết / sửa đánh giá của tôi cho quán (mỗi người 1 đánh giá / quán) */
export async function saveReview(placeId: string, rating: number, comment?: string | null) {
  const userId = await requireUserId();
  const row: Record<string, unknown> = {
    place_id: placeId,
    user_id: userId,
    rating,
    updated_at: new Date().toISOString(),
  };
  // Chấm sao nhanh lúc đăng ảnh (comment = undefined) → giữ nguyên bình luận cũ
  if (comment !== undefined) row.comment = comment?.trim() || null;

  const { error } = await supabase.from('reviews').upsert(row, { onConflict: 'place_id,user_id' });
  if (error) throw error;
}

export async function deleteMyReview(placeId: string) {
  const userId = await requireUserId();
  const { error } = await supabase
    .from('reviews')
    .delete()
    .eq('place_id', placeId)
    .eq('user_id', userId);
  if (error) throw error;
}

/** Lắng nghe đánh giá của 1 quán thay đổi (thêm/sửa/xoá). Trả về hàm huỷ. */
export function subscribeToReviews(placeId: string, onChange: () => void) {
  const channel = supabase
    .channel(`reviews-${placeId}-${Math.random().toString(36).slice(2)}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'reviews', filter: `place_id=eq.${placeId}` },
      onChange
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'reviews', filter: `place_id=eq.${placeId}` },
      onChange
    )
    // DELETE không lọc theo cột được → tải lại khi có bất kỳ đánh giá nào bị xoá (RLS đã lọc)
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'reviews' }, onChange)
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}
