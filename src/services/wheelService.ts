import { supabase } from '../lib/supabase';

export type WheelMode = 'pay' | 'food_elim' | 'food_spin';

export type WheelGame = {
  id: string;
  message_id: string;
  conversation_id: string;
  mode: WheelMode;
  /** collecting = đang gom món · ready = sẵn sàng quay · done = đã có kết quả */
  status: 'collecting' | 'ready' | 'done';
  created_by: string;
  winner_entry: string | null;
  /** Tăng 1 sau mỗi lần quay — máy nào thấy số này đổi thì chạy animation */
  spin_count: number;
  /** Ô trúng ở lần quay gần nhất (bị loại nếu là chế độ loại dần) */
  last_picked: string | null;
  last_spin_by: string | null;
};

export type WheelEntry = {
  id: string;
  game_id: string;
  user_id: string | null;
  label: string;
  /** Thứ tự bị loại (1, 2, 3…) — null = còn trong vòng */
  eliminated_order: number | null;
  created_at: string;
};

export const WHEEL_MODES: Record<
  WheelMode,
  { label: string; hint: string; defaultTitle: string; icon: 'cash-outline' | 'restaurant-outline' | 'trophy-outline' }
> = {
  pay: {
    label: 'Chọn người',
    hint: 'Chọn người tham gia rồi quay — ai trúng là người được chọn (vd: ai trả tiền, ai đi mua nước…).',
    defaultTitle: 'Ai trả tiền?',
    icon: 'cash-outline',
  },
  food_elim: {
    label: 'Chọn món — loại dần',
    hint: 'Mỗi người thêm nhiều món. Mỗi lần quay loại 1 món, món cuối cùng được chọn.',
    defaultTitle: 'Ăn gì đây?',
    icon: 'trophy-outline',
  },
  food_spin: {
    label: 'Chọn món — quay 1 lần',
    hint: 'Mỗi người thêm nhiều món. Quay một lần, món trúng là món được chọn.',
    defaultTitle: 'Ăn gì đây?',
    icon: 'restaurant-outline',
  },
};

const WHEEL_SQL = 'Server chưa bật minigame vòng quay: hãy chạy file SQL 20261115010000_wheel_games.sql trong Supabase.';

function wheelError(e: { code?: string; message?: string }) {
  if (e.code === 'PGRST202' || e.code === 'PGRST205' || e.code === '42883' || e.code === '42P01') return new Error(WHEEL_SQL);
  return new Error(e.message ?? String(e));
}

/** Tạo vòng quay + tin nhắn trong chat. Trả về id tin nhắn. */
export async function createWheel(conversationId: string, mode: WheelMode, title: string, memberIds: string[] = []) {
  const { data, error } = await supabase.rpc('create_wheel', {
    conv: conversationId,
    wheel_mode: mode,
    title,
    member_ids: memberIds,
  });
  if (error) {
    // Chưa chạy SQL: thiếu hàm, hoặc ràng buộc loại tin từ chối 'wheel'
    if (error.message?.includes('messages_kind_check')) throw new Error(WHEEL_SQL);
    throw wheelError(error);
  }
  return data as string;
}

const GAME_FIELDS =
  'id, message_id, conversation_id, mode, status, created_by, winner_entry, spin_count, last_picked, last_spin_by';
const ENTRY_FIELDS = 'id, game_id, user_id, label, eliminated_order, created_at';

/** Tải vòng quay + các ô của những tin nhắn đã cho */
export async function fetchWheels(messageIds: string[]): Promise<{ games: WheelGame[]; entries: WheelEntry[] }> {
  if (messageIds.length === 0) return { games: [], entries: [] };
  const g = await supabase.from('wheel_games').select(GAME_FIELDS).in('message_id', messageIds);
  if (g.error) throw wheelError(g.error);
  const games = (g.data ?? []) as WheelGame[];
  if (games.length === 0) return { games, entries: [] };
  const e = await supabase
    .from('wheel_entries')
    .select(ENTRY_FIELDS)
    .in(
      'game_id',
      games.map((x) => x.id)
    )
    .order('created_at', { ascending: true });
  if (e.error) throw wheelError(e.error);
  return { games, entries: (e.data ?? []) as WheelEntry[] };
}

/** Thêm 1 món (khi đang gom món). Mỗi người thêm nhiều món được, server chặn món trùng. */
export async function addWheelEntry(gameId: string, label: string) {
  const { error } = await supabase.rpc('add_wheel_entry', { gid: gameId, entry_label: label });
  if (error) throw wheelError(error);
}

/** Xoá 1 món: món của mình, hoặc của bất kỳ ai nếu là trưởng nhóm / người tạo vòng quay */
export async function deleteWheelEntry(entryId: string) {
  const { error } = await supabase.rpc('delete_wheel_entry', { entry_id: entryId });
  if (error) throw wheelError(error);
}

/** Cách hiển thị để so sánh trùng món: bỏ dấu, hoa thường, khoảng trắng thừa */
export function wheelLabelKey(label: string) {
  return label
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Người tạo bấm "Bắt đầu" sau khi đủ món */
export async function startWheel(gameId: string) {
  const { error } = await supabase.rpc('start_wheel', { gid: gameId });
  if (error) throw wheelError(error);
}

/** Quay! Server chọn kết quả; mọi máy chạy animation theo `spin_count` / `last_picked` */
export async function spinWheel(gameId: string) {
  const { data, error } = await supabase.rpc('spin_wheel', { gid: gameId });
  if (error) throw wheelError(error);
  return data as { picked: string; finished: boolean; winner: string | null };
}

/** Lắng nghe vòng quay / ô thay đổi. Trả về hàm huỷ. */
export function subscribeToWheels(onChange: (gameId: string | null) => void) {
  const channel = supabase
    .channel(`wheels-${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'wheel_games' }, (payload) => {
      const row = (payload.new as { id?: string }) ?? {};
      const old = (payload.old as { id?: string }) ?? {};
      onChange(row.id ?? old.id ?? null);
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'wheel_entries' }, (payload) => {
      const row = (payload.new as { game_id?: string }) ?? {};
      const old = (payload.old as { game_id?: string }) ?? {};
      onChange(row.game_id ?? old.game_id ?? null);
    })
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}
