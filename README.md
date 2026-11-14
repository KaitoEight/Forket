# 🍃 Forket

Forket là app chia sẻ món ăn với bạn bè. Bạn chụp món đang ăn, gắn quán theo GPS rồi gửi cho bạn bè. Ảnh của mọi người hiện trên bảng tin và trên bản đồ quán ăn.

Dự án làm cho vui, viết bằng **Expo (React Native)** và dùng **Supabase** làm backend.

## Tính năng

- **Check-in món ăn**: chụp ảnh vuông, viết lời nhắn, chọn quán gần đây (bán kính tự giãn theo sai số GPS) hoặc ghim quán mới kèm loại quán, rồi chấm sao nhanh.
- **Bản đồ quán ăn**: dùng MapLibre và OpenFreeMap (dữ liệu OpenStreetMap), **không cần API key**.
  - Tìm quán theo tên trên toàn bộ dữ liệu (không cần gõ dấu). Bấm vào ô tìm kiếm sẽ thấy quán *đã đi gần đây* và *đi nhiều nhất*.
  - Lọc theo Đồ ăn / Đồ uống và từng loại (cà phê, bún/phở…), theo ảnh, theo điểm, và theo **quán bạn bè đã đi**.
  - Bấm ảnh trên thẻ quán để xem toàn màn hình. Người ghim quán sửa được tên/địa chỉ/loại, xoá quán khi chưa ai khác dùng, hoặc bỏ quyền quản lý.
- **Bảng tin**: ảnh của bạn và bạn bè, cập nhật theo realtime. Bạn có thể thả cảm xúc, trả lời ảnh (gửi thẳng vào chat), chụm 2 ngón / chạm đúp để zoom ảnh, và xoá ảnh của mình.
- **Bạn bè**: kết bạn bằng `@username` hoặc **mã QR** (`forket://add/<mã>`), chặn người dùng.
- **Hồ sơ**: ảnh đại diện, bio, 3 tab **Món đã check-in** / **Quán đã lưu** (quán yêu thích) / **Đánh giá**. Thanh trên chỉ có thông báo, thêm bạn và cài đặt. Xem hồ sơ bạn bè và lịch sử quán của họ.
- **Chat**: chat 1-1 và **chat nhóm** (thành viên nào cũng thêm được bạn bè của mình), gửi ảnh, emoji, gửi **card quán** hoặc **lời rủ đi ăn** kèm vote Đi / Thôi.
- **Cài đặt & quyền riêng tư**: sửa hồ sơ, đổi mật khẩu, chế độ riêng tư (bạn bè không thấy ảnh, quán đã đi và đánh giá), chỉ cho tìm qua QR, danh sách chặn, xoá tài khoản.
- **Thông báo**: chuông thông báo trong app (kết bạn, cảm xúc, nhắc tên `@bạn` / `@all` trong nhóm, bảng tính tiền) và **thông báo đẩy** khi app đóng (cần development build + `eas init`, xem bên dưới).
- Lời rủ đi ăn có thể kèm **giờ hẹn** và nhắc trước 30 phút. Ghi **món + giá** lúc check-in (thẻ quán hiện "Món nên thử"); quán có **giờ mở cửa** và **mức giá**.
- **Tổng kết năm** (Forket Wrapped) trong Hồ sơ, chia sẻ quán ra ngoài app (Zalo, Messenger…), báo cáo người dùng / ảnh, giới hạn spam lời mời kết bạn.
- **Yêu thích ❤️** (một danh sách duy nhất, riêng tư — chỉ mình xem): nút tim trên thẻ quán và card quán trong chat, chip lọc "Yêu thích" trên bản đồ, xem ở tab "Quán đã lưu" trong Hồ sơ. Bấm "Đi" ở lời rủ cũng tự thêm quán vào đây. Cần đã chạy `20261115000000_must_try.sql`, rồi `20261116000000_merge_wishlist_into_favorites.sql` (chép "Muốn đi" cũ sang).
- **Hôm nay ăn gì?**: **lắc máy** ở tab Bản đồ (hoặc bấm chip "Hôm nay ăn gì?") để random một quán trong bán kính 1 / 3 / 5km quanh bạn, trong Yêu thích của bạn, và / hoặc trong Yêu thích của một hay nhiều nhóm chat (chọn nhiều nguồn cùng lúc). Cần đã chạy `20261115000000_must_try.sql`.
- **Minigame vòng quay trong chat** (menu "+" → "Minigame vòng quay"): **Chọn người** (vd: ai trả tiền), **Chọn món — loại dần** (mỗi lần quay loại 1 món, món cuối được chọn), **Chọn món — quay 1 lần**. Mỗi người thêm tối đa 5 món (chặn trùng), trưởng nhóm hoặc người tạo xoá được món của mọi người (cần `20261116010000_wheel_multi_entries.sql`). Server chọn kết quả (không ai quay lại được), mọi máy cùng chạy animation theo realtime. Cần đã chạy `20261115010000_wheel_games.sql`.
- **Chế độ tối** theo giao diện của máy (đọc lúc mở app; web luôn dùng nền sáng).
- **Màn chào**: người mới xem 3 slide giới thiệu; người vừa đăng xuất thấy màn "Chào lại" chỉ cần nhập mật khẩu.

Quyền riêng tư được chặn ngay trên database bằng Row Level Security: chỉ bạn bè (đang chia sẻ hoạt động) mới xem ảnh của nhau, chỉ thành viên mới đọc được tin nhắn.

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
    chat/         # khung chat, tạo nhóm, thông tin nhóm
    settings/     # cài đặt, hồ sơ, quyền riêng tư
    user/[id].tsx # hồ sơ người khác
    welcome.tsx   # màn chào (người mới / chào lại)
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

## Thông báo đẩy

1. Chạy `20261114000000_push_notifications.sql` (bật extension `pg_net`, server tự gọi Expo Push API, không cần Edge Function).
2. Chạy `npx eas-cli@latest init` một lần để có `projectId`, rồi build bằng `eas build --profile development` (Expo Go trên Android không nhận push từ xa).
3. Đăng nhập trên máy thật, cho phép thông báo. Token được lưu ở bảng `push_tokens` và gỡ khi đăng xuất.

## Kiểm tra quyền truy cập (RLS)

Dán [`supabase/tests/rls_checks.sql`](supabase/tests/rls_checks.sql) vào SQL Editor. Script tạo 3 tài khoản giả, kiểm tra các tình huống bạn bè / người lạ / tắt chia sẻ / chặn / tin nhắn riêng / Must try của nhóm / vòng quay minigame, rồi tự hoàn tác. Kết quả cuối là `ALL RLS CHECKS PASSED (rolled back)` hoặc `FAILED: <quy tắc bị hở>`.

## Ghi chú

- Ảnh nằm trong bucket Storage công khai. Danh sách bài đăng đã được bảo vệ, nhưng ai có đúng đường link ảnh vẫn mở được.
- Tile bản đồ lấy từ [OpenFreeMap](https://openfreemap.org), dữ liệu © [OpenStreetMap](https://www.openstreetmap.org/copyright).
