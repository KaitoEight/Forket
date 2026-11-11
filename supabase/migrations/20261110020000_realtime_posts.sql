-- Focket: bật Realtime cho bảng posts để ảnh người khác gửi hiện ngay lập tức
-- Chạy trong Supabase Dashboard → SQL Editor.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'posts'
  ) then
    alter publication supabase_realtime add table public.posts;
  end if;
end $$;
