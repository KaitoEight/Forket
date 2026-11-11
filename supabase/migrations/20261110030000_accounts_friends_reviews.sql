-- Forket: tài khoản, kết bạn, đánh giá quán
-- Chạy SAU các file migration trước (Supabase Dashboard → SQL Editor).
--
-- ⚠️ Sau khi chạy, bài đăng chỉ hiện cho chủ bài + bạn bè.
--    Các bài cũ đăng khi chưa có tài khoản (created_by = null) sẽ không còn hiện.

-- =========================================================
-- 1. HỒ SƠ NGƯỜI DÙNG
-- =========================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9_.]{3,20}$'),
  display_name text not null check (char_length(display_name) between 1 and 40),
  avatar_url text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles readable by signed-in users" on public.profiles;
create policy "profiles readable by signed-in users"
  on public.profiles for select to authenticated using (true);

drop policy if exists "users update own profile" on public.profiles;
create policy "users update own profile"
  on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- Tự tạo hồ sơ khi đăng ký (username + tên hiển thị gửi kèm trong metadata)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    lower(new.raw_user_meta_data ->> 'username'),
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
      new.raw_user_meta_data ->> 'username'
    )
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Kiểm tra username còn trống (gọi được khi chưa đăng nhập, lúc đăng ký)
create or replace function public.is_username_available(name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (select 1 from public.profiles where username = lower(name));
$$;

grant execute on function public.is_username_available(text) to anon, authenticated;

-- =========================================================
-- 2. KẾT BẠN
-- =========================================================
create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles (id) on delete cascade,
  addressee_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  check (requester_id <> addressee_id)
);

-- Mỗi cặp chỉ có 1 dòng, bất kể ai gửi trước
create unique index if not exists friendships_pair_idx
  on public.friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));

alter table public.friendships enable row level security;

drop policy if exists "see own friendships" on public.friendships;
create policy "see own friendships"
  on public.friendships for select to authenticated
  using (auth.uid() in (requester_id, addressee_id));

drop policy if exists "send friend requests" on public.friendships;
create policy "send friend requests"
  on public.friendships for insert to authenticated
  with check (requester_id = auth.uid() and status = 'pending');

drop policy if exists "accept friend requests" on public.friendships;
create policy "accept friend requests"
  on public.friendships for update to authenticated
  using (addressee_id = auth.uid())
  with check (addressee_id = auth.uid() and status = 'accepted');

drop policy if exists "remove friendships" on public.friendships;
create policy "remove friendships"
  on public.friendships for delete to authenticated
  using (auth.uid() in (requester_id, addressee_id));

create or replace function public.is_friend(other uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and (
        (f.requester_id = auth.uid() and f.addressee_id = other)
        or (f.addressee_id = auth.uid() and f.requester_id = other)
      )
  );
$$;

grant execute on function public.is_friend(uuid) to authenticated;

-- =========================================================
-- 3. BÀI ĐĂNG: chỉ chủ bài + bạn bè xem được
-- =========================================================
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'posts_created_by_fkey') then
    alter table public.posts
      add constraint posts_created_by_fkey
      foreign key (created_by) references public.profiles (id) on delete cascade;
  end if;
end $$;

alter table public.posts alter column created_by set default auth.uid();
create index if not exists posts_created_by_idx on public.posts (created_by, created_at desc);

drop policy if exists "posts are readable by everyone" on public.posts;
drop policy if exists "anyone can create posts" on public.posts;

drop policy if exists "see own and friends posts" on public.posts;
create policy "see own and friends posts"
  on public.posts for select to authenticated
  using (created_by = auth.uid() or public.is_friend(created_by));

drop policy if exists "create own posts" on public.posts;
create policy "create own posts"
  on public.posts for insert to authenticated
  with check (created_by = auth.uid());

drop policy if exists "delete own posts" on public.posts;
create policy "delete own posts"
  on public.posts for delete to authenticated
  using (created_by = auth.uid());

-- Chỉ người đã đăng nhập mới upload ảnh
drop policy if exists "anyone can upload photos" on storage.objects;
drop policy if exists "signed-in users upload photos" on storage.objects;
create policy "signed-in users upload photos"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'photos');

-- Quán ăn: người đã đăng nhập xem + ghim quán mới (không ảnh hưởng nếu bảng chưa bật RLS)
drop policy if exists "signed-in users read places" on public.places;
create policy "signed-in users read places"
  on public.places for select to authenticated using (true);

drop policy if exists "signed-in users add places" on public.places;
create policy "signed-in users add places"
  on public.places for insert to authenticated with check (true);

-- =========================================================
-- 4. ĐÁNH GIÁ QUÁN (mỗi người 1 đánh giá / quán, sửa được)
-- =========================================================
create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references public.places (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  comment text check (char_length(comment) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (place_id, user_id)
);

create index if not exists reviews_place_idx on public.reviews (place_id, updated_at desc);

alter table public.reviews enable row level security;

drop policy if exists "reviews readable by signed-in users" on public.reviews;
create policy "reviews readable by signed-in users"
  on public.reviews for select to authenticated using (true);

drop policy if exists "write own review" on public.reviews;
create policy "write own review"
  on public.reviews for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "update own review" on public.reviews;
create policy "update own review"
  on public.reviews for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "delete own review" on public.reviews;
create policy "delete own review"
  on public.reviews for delete to authenticated using (user_id = auth.uid());

-- =========================================================
-- 5. BẢN ĐỒ: thêm điểm đánh giá trung bình
--    (ảnh/số ảnh tự lọc theo RLS → chỉ tính ảnh của mình + bạn bè)
-- =========================================================
drop function if exists public.get_places_in_view(
  double precision, double precision, double precision, double precision, integer
);

create function public.get_places_in_view(
  min_lat double precision,
  min_lng double precision,
  max_lat double precision,
  max_lng double precision,
  max_results integer default 200
)
returns table (
  id uuid,
  name text,
  address text,
  lat double precision,
  lng double precision,
  post_count bigint,
  cover_url text,
  avg_rating numeric,
  review_count bigint
)
language sql
stable
as $$
  select
    p.id,
    p.name,
    p.address,
    p.lat::double precision,
    p.lng::double precision,
    coalesce(stats.post_count, 0),
    latest.cover_url,
    rv.avg_rating,
    coalesce(rv.review_count, 0)
  from public.places p
  left join lateral (
    select count(*) as post_count from public.posts po where po.place_id = p.id
  ) stats on true
  left join lateral (
    select coalesce(po.thumb_url, po.image_url) as cover_url
    from public.posts po
    where po.place_id = p.id
    order by po.created_at desc
    limit 1
  ) latest on true
  left join lateral (
    select round(avg(r.rating), 1) as avg_rating, count(*) as review_count
    from public.reviews r
    where r.place_id = p.id
  ) rv on true
  where p.lat between min_lat and max_lat
    and p.lng between min_lng and max_lng
  order by stats.post_count desc nulls last
  limit least(max_results, 500);
$$;

grant execute on function public.get_places_in_view(
  double precision, double precision, double precision, double precision, integer
) to authenticated;

-- =========================================================
-- 6. REALTIME cho lời mời kết bạn
-- =========================================================
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'friendships'
  ) then
    alter publication supabase_realtime add table public.friendships;
  end if;
end $$;
