import { supabase } from '../lib/supabase';
import { createPlaceListStore } from './placeListStore';

const store = createPlaceListStore({
  table: 'must_try',
  label: 'Yêu thích',
  sqlFile: '20261115000000_must_try.sql',
});

// "Yêu thích" ❤️ của tôi. Tên nội bộ vẫn là must_try (bảng + hàm SQL) cho khỏi phải đổi lại cơ sở dữ liệu.

/** Danh sách id quán yêu thích của tôi (cập nhật tức thì khi thêm / bỏ) */
export const useMustTryIds = store.useIds;
export const loadMustTry = store.load;
export const clearMustTry = store.clear;
export const toggleMustTry = store.toggle;
/** Server đã tự thêm quán vào Yêu thích (bấm "Đi" ở lời rủ) → chỉ cập nhật giao diện ngay */
export const markMustTryAdded = store.markAdded;

/** Yêu thích của mọi thành viên trong 1 cuộc trò chuyện (người tắt chia sẻ hoạt động / chặn nhau bị bỏ qua) */
export async function fetchGroupMustTry(conversationId: string): Promise<{ place_id: string; user_ids: string[] }[]> {
  const { data, error } = await supabase.rpc('group_must_try', { conv: conversationId });
  if (error) {
    if (error.code === 'PGRST202' || error.code === '42883') {
      throw new Error('Server chưa bật "Yêu thích": hãy chạy file SQL 20261115000000_must_try.sql trong Supabase.');
    }
    throw new Error(error.message);
  }
  return (data ?? []) as { place_id: string; user_ids: string[] }[];
}
