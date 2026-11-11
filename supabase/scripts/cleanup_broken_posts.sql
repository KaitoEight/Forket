-- Focket: dọn các bài đăng có ảnh rỗng (lỗi upload từ Android, file ~14 byte)
-- Chạy 1 lần trong Supabase Dashboard → SQL Editor.

-- 1. Xem trước các bài sẽ bị xoá
select p.id, p.created_at, o.name, (o.metadata ->> 'size')::int as size_bytes
from public.posts p
join storage.objects o
  on o.bucket_id = 'photos'
 and p.image_url like '%/photos/' || o.name
where (o.metadata ->> 'size')::int < 1024;

-- 2. Xoá các bài đó (file ảnh rỗng còn lại trong Storage có thể xoá tay ở tab Storage)
delete from public.posts p
using storage.objects o
where o.bucket_id = 'photos'
  and p.image_url like '%/photos/' || o.name
  and (o.metadata ->> 'size')::int < 1024;
