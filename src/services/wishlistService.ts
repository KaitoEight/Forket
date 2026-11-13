import { createPlaceListStore } from './placeListStore';

const store = createPlaceListStore({
  table: 'wishlist',
  label: 'Muốn đi',
  sqlFile: '20261114010000_wishlist_invite_time.sql',
});

/** Danh sách id quán "Muốn đi" của tôi (cập nhật tức thì khi thêm / bỏ) */
export const useWishlistIds = store.useIds;
export const loadWishlist = store.load;
export const clearWishlist = store.clear;
export const isWishlistLoaded = store.isLoaded;
/** Bật / tắt "Muốn đi" cho 1 quán */
export const toggleWishlist = store.toggle;
/** Thêm vào "Muốn đi" khi vote "Đi" — server cũng tự làm; hàm này chỉ để cập nhật giao diện ngay */
export const markWished = store.markAdded;
