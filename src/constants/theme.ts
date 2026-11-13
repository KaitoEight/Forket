import { Appearance, Platform } from 'react-native';

// Forket — tông "lá dong & caramel": xanh lá dong làm màu chính, caramel nâu vàng cho điểm nhấn,
// nền màu bánh chưng / giấy gạo. Cảm giác ẩm thực Việt, tách hẳn các app chia sẻ ảnh nền đen.
const light = {
  bg: '#F6F0E1', // nền bánh chưng
  surface: '#FFFCF5', // thẻ, ô nhập, nút tròn
  surfaceHigh: '#EDE3CC', // nền phụ
  border: '#E2D5B8',
  overlay: 'rgba(36,26,18,0.5)', // nền mờ đè lên ảnh
  text: '#241A12', // nâu đen
  textMuted: '#7A6650',
  onPhoto: '#FFFFFF', // chữ / icon đè lên ảnh

  accent: '#1E5631', // xanh lá dong — màu chính (nút, tab đang chọn)
  accentDark: '#133A21',
  accentSoft: '#DCEBD9', // lá non — chip đang chọn, nền nhạt
  onAccent: '#FFFFFF',

  caramel: '#C8892E', // điểm nhấn: nút phụ, huy hiệu, sao
  caramelSoft: '#F5E3C3',
  brown: '#6B4423', // nước màu — nút tối, chữ đậm
  star: '#C8892E',

  fresh: '#3E8E4E',
  danger: '#B83227',
  dangerSoft: '#F6DAD6', // nền icon / nút nguy hiểm
  dangerFaint: '#FBEDEB',
  dangerBorder: '#F1C9C4',
};

type Palette = { [K in keyof typeof light]: string };

// Bản tối: nền nâu than ấm (không đen tuyền), giữ nguyên tinh thần lá dong & caramel
const dark: Palette = {
  bg: '#17130E',
  surface: '#221C14',
  surfaceHigh: '#2E261B',
  border: '#3A3022',
  overlay: 'rgba(0,0,0,0.6)',
  text: '#F3EBDD',
  textMuted: '#A39580',
  onPhoto: '#FFFFFF',

  accent: '#3A9158',
  accentDark: '#2A6C41',
  accentSoft: '#1F3526',
  onAccent: '#FFFFFF',

  caramel: '#D9A04A',
  caramelSoft: '#3A2D17',
  brown: '#9C6B3A',
  star: '#D9A04A',

  fresh: '#5BB06C',
  danger: '#E0645A',
  dangerSoft: '#4A2420',
  dangerFaint: '#3A1E1B',
  dangerBorder: '#6B332D',
};

/**
 * Theo giao diện của máy (đọc 1 lần lúc mở app → đổi chế độ sáng/tối của máy thì mở lại app để áp dụng).
 * Bản web luôn dùng nền sáng, vì trang được dựng sẵn trên server không biết máy đang ở chế độ nào.
 */
export const isDark = Platform.OS !== 'web' && Appearance.getColorScheme() === 'dark';

export const colors: Palette = isDark ? dark : light;

/** Màu chữ thanh trạng thái: nền sáng → chữ tối, nền tối → chữ sáng */
export const statusBarStyle = isDark ? 'light' : 'dark';

export const radius = {
  viewfinder: 32,
  card: 20,
  pill: 999,
} as const;

/** Bóng đổ nhẹ cho thẻ trên nền sáng */
export const shadow = {
  shadowColor: '#3B2A14',
  shadowOpacity: isDark ? 0.4 : 0.12,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 4 },
  elevation: 3,
} as const;
