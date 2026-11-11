# 🍃 Forket

Forket là app chia sẻ món ăn với bạn bè. Bạn chụp món đang ăn, gắn quán theo GPS rồi gửi cho bạn bè. Ảnh của mọi người hiện trên bảng tin và trên bản đồ quán ăn.

Dự án làm cho vui, viết bằng **Expo (React Native)** và dùng **Supabase** làm backend.

## Tính năng

- **Check-in món ăn**: chụp ảnh vuông, viết lời nhắn, chọn quán gần đây (bán kính tự giãn theo sai số GPS) hoặc ghim quán mới, rồi chấm sao nhanh.
- **Bản đồ quán ăn**: dùng MapLibre và OpenFreeMap (dữ liệu OpenStreetMap), **không cần API key**. Có tìm quán, bộ lọc, marker hiện ảnh và điểm, nút chỉ đường.
- **Bảng tin**: ảnh của bạn và bạn bè, cập nhật theo realtime. Bạn có thể thả cảm xúc, trả lời ảnh, và xoá ảnh của mình.
- **Bạn bè và chat**: kết bạn bằng `@username`, chat 1-1 có emoji, gửi ảnh và trả lời ảnh.
- **Đánh giá quán**: chấm 1–5 sao kèm bình luận. Mỗi người 1 đánh giá cho mỗi quán.
- **Hồ sơ**: xem quán đã đi, các món đã check-in và đánh giá của mình.

Quyền riêng tư được chặn ngay trên database bằng Row Level Security: chỉ bạn bè mới xem ảnh và nhắn tin được cho nhau.

## Chạy thử

### 1. Cài đặt

```bash
npm install
```

### 2. Tạo project Supabase

1. Tạo project mới tại [supabase.com](https://supabase.com).
2. Vào **SQL Editor** và chạy lần lượt các file trong [`supabase/migrations`](supabase/migrations) **theo thứ tự tên file** (từ cũ đến mới).
3. Vào **Authentication → Sign In / Providers → Email**, tắt **Confirm email**. Nếu bật, người dùng phải bấm link xác nhận trong email trước khi đăng nhập được.

### 3. Khai báo biến môi trường

Sao chép [`.env.example`](.env.example) thành `.env`, rồi điền URL và anon key lấy ở **Project Settings → API**:

```bash
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### 4. Chạy app

```bash
npm start               # cùng mạng Wi-Fi
npm run start:tunnel    # khác mạng (4G, Wi-Fi khác…)
```

Quét mã QR bằng **Expo Go** trên điện thoại. Mọi thư viện native mà app dùng đều có sẵn trong Expo Go, nên không cần development build.

## Cấu trúc thư mục

```
src/
  app/            # màn hình (Expo Router)
    (tabs)/       # Bản đồ · Bảng tin · Tin nhắn · Hồ sơ
    camera.tsx    # check-in món mới
    chat/[id].tsx # khung chat 1-1
  components/     # thanh tab, bản đồ, sao đánh giá…
  services/       # gọi Supabase: bài đăng, quán, bạn bè, chat, đánh giá
  lib/            # Supabase client, đăng nhập
supabase/
  migrations/     # schema + RLS, chạy theo thứ tự
  scripts/        # script dọn dữ liệu chạy 1 lần
```

## Kiểm tra code

```bash
npx tsc --noEmit   # typecheck
npx expo lint      # lint
```

## Ghi chú

- Ảnh nằm trong bucket Storage công khai. Danh sách bài đăng đã được bảo vệ, nhưng ai có đúng đường link ảnh vẫn mở được.
- Tile bản đồ lấy từ [OpenFreeMap](https://openfreemap.org), dữ liệu © [OpenStreetMap](https://www.openstreetmap.org/copyright).
