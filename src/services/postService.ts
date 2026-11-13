import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { Platform } from 'react-native';

import { requireUserId } from '../lib/auth';
import type { Reaction } from './reactionService';
import { supabase } from '../lib/supabase';

export type Post = {
  id: string;
  image_url: string;
  caption: string | null;
  created_at: string;
  /** Món ăn + giá (VND) ghi lúc check-in */
  dish?: string | null;
  price?: number | null;
  place: { id: string; name: string; address: string | null } | null;
  author: { id: string; username: string; display_name: string; avatar_url?: string | null } | null;
  reactions: Reaction[];
};

const POST_FIELDS =
  'id, image_url, caption, created_at, dish, price, place:places(id, name, address), author:profiles(id, username, display_name, avatar_url), reactions(emoji, user_id, user:profiles(display_name, username))';

const BUCKET = 'photos';
const OUTPUT_SIZE = 1080;
const THUMB_SIZE = 240;

// Cắt ảnh vuông ở giữa + thu nhỏ còn 1080px để upload nhanh
export async function squarePhoto(uri: string, width: number, height: number) {
  const size = Math.min(width, height);
  const context = ImageManipulator.manipulate(uri)
    .crop({
      originX: Math.round((width - size) / 2),
      originY: Math.round((height - size) / 2),
      width: size,
      height: size,
    })
    .resize({ width: OUTPUT_SIZE, height: OUTPUT_SIZE });
  const image = await context.renderAsync();
  const result = await image.saveAsync({ compress: 0.75, format: SaveFormat.JPEG });
  return result.uri;
}

// Thumbnail nhỏ dùng làm marker trên bản đồ
async function makeThumb(uri: string) {
  const image = await ImageManipulator.manipulate(uri)
    .resize({ width: THUMB_SIZE, height: THUMB_SIZE })
    .renderAsync();
  return (await image.saveAsync({ compress: 0.6, format: SaveFormat.JPEG })).uri;
}

// Đọc file ảnh thành bytes. KHÔNG dùng fetch(file://).arrayBuffer():
// trên Android nó trả về ~14 byte rác → ảnh upload lên bị rỗng.
export async function readBytes(localUri: string) {
  if (Platform.OS === 'web') return (await fetch(localUri)).arrayBuffer();
  return new File(localUri).arrayBuffer();
}

async function uploadPhoto(localUri: string, path: string) {
  const body = await readBytes(localUri);
  if (body.byteLength < 1024) {
    throw new Error(`Đọc ảnh thất bại (${body.byteLength} byte). Hãy thử chụp lại.`);
  }

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, body, { contentType: 'image/jpeg' });
  if (error) throw error;

  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

export async function createPost(input: {
  localUri: string;
  caption: string;
  placeId: string | null;
  lat?: number;
  lng?: number;
  dish?: string;
  /** Giá tiền (VND) */
  price?: number | null;
}) {
  const userId = await requireUserId();
  const name = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  const [imageUrl, thumbUrl] = await Promise.all([
    uploadPhoto(input.localUri, name),
    makeThumb(input.localUri).then((uri) => uploadPhoto(uri, `thumbs/${name}`)),
  ]);

  const row = {
    created_by: userId,
    image_url: imageUrl,
    thumb_url: thumbUrl,
    caption: input.caption.trim() || null,
    place_id: input.placeId,
    lat: input.lat,
    lng: input.lng,
    dish: input.dish?.trim() || null,
    price: input.price ?? null,
  };
  // Server chưa chạy migration thêm cột (thumb_url, dish, price) → bỏ cột thiếu và lưu tiếp
  let current: Record<string, unknown> = row;
  let { error } = await supabase.from('posts').insert(current);
  for (let i = 0; i < 3 && error?.code === 'PGRST204'; i++) {
    const missing = error.message.match(/'([a-z_]+)' column/)?.[1];
    if (!missing || !(missing in current)) break;
    const { [missing]: _dropped, ...rest } = current;
    current = rest;
    ({ error } = await supabase.from('posts').insert(current));
  }
  if (error) throw error;
}

// Dùng khi chưa chạy migration chat/reactions (chưa có bảng reactions)
const POST_FIELDS_NO_REACTIONS = POST_FIELDS.replace(/, reactions\(.*\)$/, '');
// Dùng khi chưa chạy migration món + giá (chưa có cột dish, price)
const withoutDish = (fields: string) => fields.replace(' dish, price,', '');

function normalize(row: any): Post {
  return { ...row, reactions: row.reactions ?? [] } as Post;
}

/** Chạy query với POST_FIELDS; nếu server chưa có bảng reactions thì chạy lại không kèm */
async function selectPosts<T>(
  build: (fields: string) => PromiseLike<{ data: T; error: { code?: string } | null }>
) {
  let res = await build(POST_FIELDS);
  if (res.error?.code === '42703') res = await build(withoutDish(POST_FIELDS));
  if (res.error?.code === 'PGRST200') res = await build(withoutDish(POST_FIELDS_NO_REACTIONS));
  if (res.error) throw res.error;
  return res.data;
}

export async function fetchPosts(): Promise<Post[]> {
  const data = await selectPosts((fields) =>
    supabase.from('posts').select(fields).order('created_at', { ascending: false }).limit(50)
  );
  return ((data ?? []) as unknown[]).map(normalize);
}

export async function fetchPostById(id: string): Promise<Post | null> {
  const data = await selectPosts((fields) =>
    supabase.from('posts').select(fields).eq('id', id).maybeSingle()
  );
  return data ? normalize(data) : null;
}

/** Lắng nghe bài đăng mới của mọi người (Supabase Realtime). Trả về hàm huỷ. */
export function subscribeToNewPosts(onPost: (post: Post) => void) {
  const channel = supabase
    .channel(`posts-feed-${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts' }, (payload) => {
      const id = (payload.new as { id?: string }).id;
      if (!id) return;
      // Payload realtime không có thông tin quán (join) → tải lại đầy đủ
      fetchPostById(id)
        .then((post) => post && onPost(post))
        .catch((e) => console.warn('Không tải được bài mới:', e));
    })
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

/** Đường dẫn file trong bucket từ public URL (…/object/public/photos/<path>) */
function storagePathFromUrl(url: string) {
  const marker = `/object/public/${BUCKET}/`;
  const i = url.indexOf(marker);
  return i === -1 ? null : decodeURIComponent(url.slice(i + marker.length).split('?')[0]);
}

/** Xoá ảnh của tôi: xoá bài đăng (cảm xúc tự xoá theo), rồi dọn file ảnh + thumbnail */
export async function deletePost(post: { id: string; image_url: string }) {
  const { data, error } = await supabase.from('posts').delete().eq('id', post.id).select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('Không xoá được: ảnh này không phải của bạn hoặc đã bị xoá.');

  // Dọn file trong Storage (lỗi ở bước này không ảnh hưởng — bài đã bị xoá)
  const path = storagePathFromUrl(post.image_url);
  if (path) {
    const { error: removeError } = await supabase.storage.from(BUCKET).remove([path, `thumbs/${path}`]);
    if (removeError) console.warn('Không xoá được file ảnh:', removeError.message);
  }
}

/** Lắng nghe bài đăng bị xoá (để gỡ khỏi Bảng tin của bạn bè ngay). Trả về hàm huỷ. */
export function subscribeToDeletedPosts(onDeleted: (postId: string) => void) {
  const channel = supabase
    .channel(`posts-deleted-${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'posts' }, (payload) => {
      const id = (payload.old as { id?: string }).id;
      if (id) onDeleted(id);
    })
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}

/** Gộp danh sách mới vào danh sách cũ, không trùng, mới nhất lên đầu */
export function mergePosts(current: Post[], incoming: Post[]) {
  const byId = new Map(current.map((p) => [p.id, p]));
  for (const p of incoming) byId.set(p.id, p);
  return [...byId.values()].sort((a, b) => b.created_at.localeCompare(a.created_at));
}

/** Ảnh của 1 quán (kèm người chụp) — để hiện trên thẻ quán và xem toàn màn hình */
export type PlacePhoto = {
  id: string;
  image_url: string;
  thumb_url?: string | null;
  caption: string | null;
  created_at: string;
  dish?: string | null;
  price?: number | null;
  author: { id: string; username: string; display_name: string; avatar_url: string | null } | null;
};

export async function fetchPostsByPlace(placeId: string, limit = 30): Promise<PlacePhoto[]> {
  const query = (fields: string) =>
    supabase.from('posts').select(fields).eq('place_id', placeId).order('created_at', { ascending: false }).limit(limit);
  const fields =
    'id, image_url, thumb_url, caption, created_at, dish, price, author:profiles(id, username, display_name, avatar_url)';
  let { data, error } = await query(fields);
  if (error?.code === '42703') ({ data, error } = await query(fields.replace(' dish, price,', '')));
  if (error) throw error;
  return (data ?? []) as unknown as PlacePhoto[];
}

export function timeAgo(iso: string) {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return 'vừa xong';
  if (minutes < 60) return `${minutes} phút`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} giờ`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} ngày`;
  return new Date(iso).toLocaleDateString('vi-VN');
}
