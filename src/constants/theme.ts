// Forket — tông "lá dong & caramel": xanh lá dong làm màu chính, caramel nâu vàng cho điểm nhấn,
// nền màu bánh chưng / giấy gạo. Cảm giác ẩm thực Việt, tách hẳn khỏi các app chia sẻ ảnh nền đen.
export const colors = {
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
} as const;

export const radius = {
  viewfinder: 32,
  card: 20,
  pill: 999,
} as const;

/** Bóng đổ nhẹ cho thẻ trên nền sáng */
export const shadow = {
  shadowColor: '#3B2A14',
  shadowOpacity: 0.12,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 4 },
  elevation: 3,
} as const;
