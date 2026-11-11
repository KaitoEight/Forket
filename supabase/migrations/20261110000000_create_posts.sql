-- Focket: bảng bài đăng ảnh món ăn (kiểu Locket) + bucket lưu ảnh
-- Chạy file này trong Supabase Dashboard → SQL Editor.

-- 1. Bảng posts
create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  image_url text not null,
  caption text check (char_length(caption) <= 60),
  place_id uuid references public.places (id) on delete set null,
  lat double precision,
  lng double precision,
  created_by uuid,
  created_at timestamptz not null default now()
);

create index if not exists posts_created_at_idx on public.posts (created_at desc);
create index if not exists posts_place_id_idx on public.posts (place_id);

alter table public.posts enable row level security;

-- Prototype: chưa có đăng nhập nên cho phép ai cũng đọc / đăng.
-- Khi thêm Auth + bạn bè, thay bằng policy theo auth.uid().
drop policy if exists "posts are readable by everyone" on public.posts;
create policy "posts are readable by everyone"
  on public.posts for select using (true);

drop policy if exists "anyone can create posts" on public.posts;
create policy "anyone can create posts"
  on public.posts for insert with check (true);

-- 2. Bucket ảnh công khai
insert into storage.buckets (id, name, public)
values ('photos', 'photos', true)
on conflict (id) do nothing;

drop policy if exists "anyone can upload photos" on storage.objects;
create policy "anyone can upload photos"
  on storage.objects for insert
  with check (bucket_id = 'photos');

drop policy if exists "photos are readable by everyone" on storage.objects;
create policy "photos are readable by everyone"
  on storage.objects for select
  using (bucket_id = 'photos');
