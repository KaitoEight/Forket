import { setCategories, type PlaceGroupInfo, type PlaceTag } from '../constants/placeTags';
import { supabase } from '../lib/supabase';

/** Nạp nhóm + loại quán từ server. Lỗi (chưa chạy SQL, mất mạng…) → giữ danh sách dự phòng trong app. */
export async function loadCategories() {
  const [groups, tags] = await Promise.all([
    supabase.from('place_groups').select('key, label, icon').order('sort').order('label'),
    supabase.from('place_tags').select('key, label, group_key').order('sort').order('label'),
  ]);
  if (groups.error || tags.error) {
    console.warn(
      'Dùng danh sách loại quán dự phòng (chạy file SQL 20261113010000_place_categories.sql trong Supabase để lấy từ database):',
      (groups.error ?? tags.error)?.message
    );
    return;
  }
  const groupList = (groups.data ?? []) as PlaceGroupInfo[];
  const tagList = ((tags.data ?? []) as { key: string; label: string; group_key: string }[]).map(
    (t): PlaceTag => ({ key: t.key, label: t.label, group: t.group_key })
  );
  if (groupList.length === 0 || tagList.length === 0) return;
  setCategories({ groups: groupList, tags: tagList });
}
