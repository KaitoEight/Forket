import { requireUserId } from '../lib/auth';
import { supabase } from '../lib/supabase';

export type MyPost = {
  id: string;
  image_url: string;
  thumb_url: string | null;
  caption: string | null;
  created_at: string;
  place: { id: string; name: string } | null;
};

export type MyReview = {
  id: string;
  rating: number;
  comment: string | null;
  updated_at: string;
  place: { id: string; name: string } | null;
};

export async function fetchMyPosts(limit = 90): Promise<MyPost[]> {
  const me = await requireUserId();
  const { data, error } = await supabase
    .from('posts')
    .select('id, image_url, thumb_url, caption, created_at, place:places(id, name)')
    .eq('created_by', me)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as MyPost[];
}

export async function fetchMyReviews(): Promise<MyReview[]> {
  const me = await requireUserId();
  const { data, error } = await supabase
    .from('reviews')
    .select('id, rating, comment, updated_at, place:places(id, name)')
    .eq('user_id', me)
    .order('updated_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []) as unknown as MyReview[];
}

export async function countFriends() {
  const { count, error } = await supabase
    .from('friendships')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'accepted');
  if (error) throw error;
  return count ?? 0;
}
