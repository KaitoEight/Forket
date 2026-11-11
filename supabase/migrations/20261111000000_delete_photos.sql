-- Focket: cho phép xoá ảnh của chính mình (bài đăng + file trong Storage)
-- Chạy SAU các migration trước (Supabase Dashboard → SQL Editor).

-- Bài đăng: chủ bài được xoá (đã có từ migration tài khoản, tạo lại cho chắc)
drop policy if exists "delete own posts" on public.posts;
create policy "delete own posts"
  on public.posts for delete to authenticated
  using (created_by = auth.uid());

-- File ảnh: chỉ người đã upload (owner_id) mới được xoá
drop policy if exists "users delete own photos" on storage.objects;
create policy "users delete own photos"
  on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and owner_id = (select auth.uid())::text);
