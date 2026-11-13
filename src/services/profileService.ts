import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { requireUserId, type MyProfile } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { readBytes } from './postService';

export type MyPost = {
  id: string;
  image_url: string;
  thumb_url: string | null;
  caption: string | null;
  created_at: string;
  place: { id: string; name: string; lat: number; lng: number } | null;
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
  return fetchPostsOf(me, limit);
}

/** Ảnh check-in của 1 người (RLS tự lọc: chỉ thấy khi là bạn bè và họ đang chia sẻ) */
export async function fetchPostsOf(userId: string, limit = 90): Promise<MyPost[]> {
  const { data, error } = await supabase
    .from('posts')
    .select('id, image_url, thumb_url, caption, created_at, place:places(id, name, lat, lng)')
    .eq('created_by', userId)
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

// ---------- Quán đã đi (gom từ ảnh check-in) ----------

export type VisitedPlace = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  visits: number;
  lastVisit: string;
  cover: string | null;
};

/** Gom ảnh check-in theo quán: số lần đi, lần gần nhất, ảnh mới nhất */
export function groupVisits(posts: MyPost[]): VisitedPlace[] {
  const map = new Map<string, VisitedPlace>();
  for (const p of posts) {
    if (!p.place) continue;
    const cur = map.get(p.place.id);
    if (cur) {
      cur.visits++;
      if (p.created_at > cur.lastVisit) {
        cur.lastVisit = p.created_at;
        cur.cover = p.thumb_url ?? p.image_url;
      }
    } else {
      map.set(p.place.id, {
        id: p.place.id,
        name: p.place.name,
        lat: Number(p.place.lat),
        lng: Number(p.place.lng),
        visits: 1,
        lastVisit: p.created_at,
        cover: p.thumb_url ?? p.image_url,
      });
    }
  }
  return [...map.values()].sort((a, b) => b.lastVisit.localeCompare(a.lastVisit));
}

// ---------- Sửa hồ sơ ----------

function mapMigrationError(e: { code?: string; message?: string }) {
  if (e.code === '42703' || e.code === 'PGRST204' || e.code === 'PGRST202') {
    return new Error(
      'Server chưa bật tính năng này: hãy chạy file SQL 20261112000000_profile_privacy.sql trong Supabase.'
    );
  }
  return e as Error;
}

export async function updateMyProfile(
  patch: Partial<Pick<MyProfile, 'display_name' | 'bio' | 'share_activity' | 'discoverable' | 'avatar_url'>>
) {
  const me = await requireUserId();
  const row: Record<string, unknown> = { ...patch };
  if (typeof patch.display_name === 'string') {
    const name = patch.display_name.trim();
    if (name.length < 1 || name.length > 40) throw new Error('Tên hiển thị 1–40 ký tự.');
    row.display_name = name;
  }
  if (patch.bio !== undefined) {
    const bio = patch.bio?.trim() ?? '';
    if (bio.length > 150) throw new Error('Bio tối đa 150 ký tự.');
    row.bio = bio || null;
  }
  const { error } = await supabase.from('profiles').update(row).eq('id', me);
  if (error) throw mapMigrationError(error);
}

const AVATAR_SIZE = 400;

/** Cắt giữa thành ảnh vuông 400px rồi upload lên bucket photos → trả về public URL */
export async function uploadSquareImage(image: { uri: string; width: number; height: number }, path: string) {
  const size = Math.min(image.width, image.height);
  const rendered = await ImageManipulator.manipulate(image.uri)
    .crop({
      originX: Math.round((image.width - size) / 2),
      originY: Math.round((image.height - size) / 2),
      width: size,
      height: size,
    })
    .resize({ width: AVATAR_SIZE, height: AVATAR_SIZE })
    .renderAsync();
  const saved = await rendered.saveAsync({ compress: 0.8, format: SaveFormat.JPEG });

  const bytes = await readBytes(saved.uri);
  if (bytes.byteLength < 1024) throw new Error('Đọc ảnh thất bại, thử lại nhé.');
  const { error } = await supabase.storage.from('photos').upload(path, bytes, { contentType: 'image/jpeg' });
  if (error) throw error;
  return supabase.storage.from('photos').getPublicUrl(path).data.publicUrl;
}

/** Đổi ảnh đại diện của tôi */
export async function uploadAvatar(image: { uri: string; width: number; height: number }) {
  const me = await requireUserId();
  const url = await uploadSquareImage(image, `avatars/${me}/${Date.now()}.jpg`);
  await updateMyProfile({ avatar_url: url });
  return url;
}

export async function removeAvatar() {
  await updateMyProfile({ avatar_url: null });
}

export async function resetFriendCode(): Promise<string> {
  const { data, error } = await supabase.rpc('reset_friend_code');
  if (error) throw mapMigrationError(error);
  return data as string;
}

export async function changePassword(newPassword: string) {
  if (newPassword.length < 6) throw new Error('Mật khẩu mới cần ít nhất 6 ký tự.');
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) {
    if (error.message.includes('different from the old')) throw new Error('Mật khẩu mới phải khác mật khẩu cũ.');
    throw new Error(error.message);
  }
}

/** Xoá vĩnh viễn tài khoản + toàn bộ dữ liệu (ảnh, đánh giá, tin nhắn) */
export async function deleteMyAccount() {
  const { error } = await supabase.rpc('delete_my_account');
  if (error) throw mapMigrationError(error);
  await supabase.auth.signOut();
}

/** Link mã QR kết bạn — mở app thẳng tới trang kết bạn */
export function friendLink(code: string) {
  return `forket://add/${code}`;
}

/** Lấy mã kết bạn từ nội dung QR (link forket://add/CODE hoặc chỉ mã) */
export function parseFriendCode(data: string): string | null {
  const t = data.trim();
  const m = t.match(/add\/([A-Za-z0-9]{6,12})\/?$/) ?? t.match(/^([A-Za-z0-9]{6,12})$/);
  return m ? m[1].toUpperCase() : null;
}
