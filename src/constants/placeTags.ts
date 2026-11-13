import { useSyncExternalStore } from 'react';

// Phân loại quán. Nguồn chính là bảng place_groups / place_tags trong Supabase (xem
// supabase/migrations/20261113010000_place_categories.sql) và được nạp lúc mở app.
// Danh sách dưới đây chỉ là DỰ PHÒNG khi chưa nạp được (mất mạng / chưa chạy SQL).

export type PlaceGroup = string;

export type PlaceGroupInfo = { key: string; label: string; icon: string };

export type PlaceTag = { key: string; label: string; group: PlaceGroup };

export type Categories = { groups: PlaceGroupInfo[]; tags: PlaceTag[] };

export const MAX_PLACE_TAGS = 3;

const DEFAULTS: Categories = {
  groups: [
    { key: 'food', label: 'Đồ ăn', icon: 'restaurant' },
    { key: 'drink', label: 'Đồ uống', icon: 'cafe' },
    { key: 'fun', label: 'Giải trí', icon: 'game-controller' },
  ],
  tags: [
    { key: 'bun_pho', label: 'Bún / Phở', group: 'food' },
    { key: 'com', label: 'Cơm', group: 'food' },
    { key: 'banh_mi', label: 'Bánh mì', group: 'food' },
    { key: 'lau_nuong', label: 'Lẩu / Nướng', group: 'food' },
    { key: 'nhau', label: 'Quán nhậu', group: 'food' },
    { key: 'an_vat', label: 'Ăn vặt', group: 'food' },
    { key: 'hai_san', label: 'Hải sản', group: 'food' },
    { key: 'chay', label: 'Chay', group: 'food' },
    { key: 'mon_au', label: 'Món Âu', group: 'food' },
    { key: 'mon_a', label: 'Món Á', group: 'food' },
    { key: 'ca_phe', label: 'Cà phê', group: 'drink' },
    { key: 'tra_sua', label: 'Trà sữa', group: 'drink' },
    { key: 'tra_nuoc_ep', label: 'Trà / Nước ép', group: 'drink' },
    { key: 'sinh_to', label: 'Sinh tố / Nước mía', group: 'drink' },
    { key: 'giai_khat', label: 'Nước giải khát', group: 'drink' },
    { key: 'bia_bar', label: 'Bia / Bar', group: 'drink' },
    { key: 'trang_mieng', label: 'Tráng miệng', group: 'drink' },
    { key: 'karaoke', label: 'Karaoke', group: 'fun' },
    { key: 'quan_net', label: 'Quán net / Game', group: 'fun' },
    { key: 'bida', label: 'Bida', group: 'fun' },
    { key: 'board_game', label: 'Board game', group: 'fun' },
  ],
};

let snapshot: Categories = DEFAULTS;
const listeners = new Set<() => void>();

/** Cập nhật phân loại (sau khi nạp từ server) và báo cho các màn đang hiển thị */
export function setCategories(next: Categories) {
  snapshot = next;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Dùng trong component để tự vẽ lại khi phân loại thay đổi */
export function useCategories(): Categories {
  return useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => DEFAULTS
  );
}

export function tagLabel(key: string) {
  return snapshot.tags.find((t) => t.key === key)?.label ?? key;
}

export function tagsInGroup(group: PlaceGroup) {
  return snapshot.tags.filter((t) => t.group === group);
}

/** Quán có thuộc nhóm (đồ ăn / đồ uống / giải trí…) không */
export function placeInGroup(tags: string[] | null | undefined, group: PlaceGroup) {
  const inGroup = new Set(tagsInGroup(group).map((t) => t.key));
  return (tags ?? []).some((k) => inGroup.has(k));
}
