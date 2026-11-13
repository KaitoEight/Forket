import { supabase } from '../lib/supabase';
import { createPlaceListStore } from './placeListStore';

const store = createPlaceListStore({
  table: 'must_try',
  label: 'Must try',
  sqlFile: '20261115000000_must_try.sql',
});

/** Danh sách id quán "Must try" ❤️ của tôi (cập nhật tức thì khi thêm / bỏ) */
export const useMustTryIds = store.useIds;
export const loadMustTry = store.load;
export const clearMustTry = store.clear;
export const toggleMustTry = store.toggle;

/** Must try của mọi thành viên trong 1 cuộc trò chuyện (người tắt chia sẻ hoạt động / chặn nhau bị bỏ qua) */
export async function fetchGroupMustTry(conversationId: string): Promise<{ place_id: string; user_ids: string[] }[]> {
  const { data, error } = await supabase.rpc('group_must_try', { conv: conversationId });
  if (error) {
    if (error.code === 'PGRST202' || error.code === '42883') {
      throw new Error('Server chưa bật "Must try": hãy chạy file SQL 20261115000000_must_try.sql trong Supabase.');
    }
    throw new Error(error.message);
  }
  return (data ?? []) as { place_id: string; user_ids: string[] }[];
}
