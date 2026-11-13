import { useSyncExternalStore } from 'react';

import { requireUserId } from '../lib/auth';
import { supabase } from '../lib/supabase';

/**
 * Kho nhỏ giữ danh sách id quán của tôi ("Muốn đi", "Must try"…) để mọi nút bấm cập nhật cùng lúc.
 * Bảng phải có (user_id, place_id) và chỉ cho chủ đọc/ghi.
 */
export function createPlaceListStore(opts: { table: string; label: string; sqlFile: string }) {
  const needsSql = `Server chưa bật "${opts.label}": hãy chạy file SQL ${opts.sqlFile} trong Supabase.`;

  let ids: ReadonlySet<string> = new Set();
  let loaded = false;
  const listeners = new Set<() => void>();

  const setIds = (next: Set<string>) => {
    ids = next;
    listeners.forEach((l) => l());
  };
  const subscribe = (l: () => void) => {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  };
  const wrapError = (e: { code?: string; message?: string }) => {
    if (e.code === 'PGRST205' || e.code === '42P01') return new Error(needsSql);
    return new Error(e.message ?? String(e));
  };

  return {
    /** Danh sách id quán của tôi (cập nhật tức thì khi thêm / bỏ) */
    useIds() {
      return useSyncExternalStore(
        subscribe,
        () => ids,
        () => ids
      );
    },

    /** Nạp từ server (gọi khi đăng nhập). Chưa chạy SQL → danh sách rỗng, không báo lỗi. */
    async load() {
      const me = await requireUserId();
      const { data, error } = await supabase.from(opts.table).select('place_id').eq('user_id', me);
      if (error) {
        console.warn(`Chưa tải được "${opts.label}":`, error.message);
        return;
      }
      loaded = true;
      setIds(new Set((data ?? []).map((r) => r.place_id as string)));
    },

    clear() {
      loaded = false;
      setIds(new Set());
    },

    isLoaded: () => loaded,

    /** Bật / tắt cho 1 quán. Cập nhật ngay, lỗi thì trả lại như cũ. Trả về true nếu giờ đang ở trong danh sách. */
    async toggle(placeId: string) {
      const had = ids.has(placeId);
      const optimistic = new Set(ids);
      if (had) optimistic.delete(placeId);
      else optimistic.add(placeId);
      setIds(optimistic);

      try {
        const me = await requireUserId();
        const res = had
          ? await supabase.from(opts.table).delete().eq('user_id', me).eq('place_id', placeId)
          : await supabase.from(opts.table).upsert({ user_id: me, place_id: placeId });
        if (res.error) throw wrapError(res.error);
        return !had;
      } catch (e) {
        const revert = new Set(ids);
        if (had) revert.add(placeId);
        else revert.delete(placeId);
        setIds(revert);
        throw e;
      }
    },

    /** Server đã tự thêm → chỉ cập nhật giao diện ngay */
    markAdded(placeId: string) {
      if (ids.has(placeId)) return;
      const next = new Set(ids);
      next.add(placeId);
      setIds(next);
    },
  };
}
