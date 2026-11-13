-- Forket: bình luận ảnh, món + giá khi check-in, giờ mở cửa + mức giá của quán
-- Chạy SAU 20261114010000_wishlist_invite_time.sql (Supabase Dashboard → SQL Editor). An toàn khi chạy lại.

-- =========================================================
-- 1. BÌNH LUẬN ẢNH
-- =========================================================
create table if not exists public.post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 500),
  created_at timestamptz not null default now()
);
create index if not exists post_comments_post_idx on public.post_comments (post_id, created_at);

alter table public.post_comments enable row level security;

-- Thấy được ảnh thì thấy được bình luận (policy của bảng posts tự lọc theo bạn bè / quyền riêng tư)
drop policy if exists "read comments of visible posts" on public.post_comments;
create policy "read comments of visible posts"
  on public.post_comments for select to authenticated
  using (exists (select 1 from public.posts p where p.id = post_id));

drop policy if exists "comment on visible posts" on public.post_comments;
create policy "comment on visible posts"
  on public.post_comments for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.posts p where p.id = post_id)
  );

-- Xoá được bình luận của mình, hoặc bình luận dưới ảnh của mình
drop policy if exists "delete own or on own post" on public.post_comments;
create policy "delete own or on own post"
  on public.post_comments for delete to authenticated
  using (
    user_id = auth.uid()
    or exists (select 1 from public.posts p where p.id = post_id and p.created_by = auth.uid())
  );

-- Chống spam: tối đa 20 bình luận / 5 phút / người
create or replace function public.trg_limit_comments()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.post_comments
      where user_id = new.user_id and created_at > now() - interval '5 minutes') >= 20 then
    raise exception 'Bạn bình luận hơi nhanh, đợi một chút nhé.';
  end if;
  return new;
end;
$$;

drop trigger if exists limit_comments on public.post_comments;
create trigger limit_comments
  before insert on public.post_comments
  for each row execute function public.trg_limit_comments();

-- Thông báo: có người bình luận ảnh của mình
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type in (
  'friend_request', 'friend_accepted', 'reaction', 'group_added', 'mention', 'mention_all', 'bill_item', 'comment'
));

create or replace function public.trg_notify_comment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner uuid;
begin
  select created_by into owner from public.posts where id = new.post_id;
  perform public.push_notification(
    owner, new.user_id, 'comment', new.post_id, null, null,
    jsonb_build_object('preview', left(new.body, 120))
  );
  return new;
end;
$$;

drop trigger if exists notify_comment on public.post_comments;
create trigger notify_comment
  after insert on public.post_comments
  for each row execute function public.trg_notify_comment();

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'post_comments'
  ) then
    alter publication supabase_realtime add table public.post_comments;
  end if;
end $$;

-- =========================================================
-- 2. MÓN + GIÁ KHI CHECK-IN
-- =========================================================
alter table public.posts add column if not exists dish text check (dish is null or char_length(trim(dish)) between 1 and 60);
alter table public.posts add column if not exists price integer check (price is null or price between 0 and 100000000);

-- =========================================================
-- 3. GIỜ MỞ CỬA + MỨC GIÁ CỦA QUÁN
-- =========================================================
alter table public.places add column if not exists open_hours text
  check (open_hours is null or char_length(open_hours) <= 80);
-- 1: dưới 50k · 2: 50–150k · 3: 150–300k · 4: trên 300k (mỗi người)
alter table public.places add column if not exists price_level smallint
  check (price_level is null or price_level between 1 and 4);

create or replace function public.get_place_info(pid uuid)
returns table (open_hours text, price_level smallint)
language sql
stable
security definer
set search_path = ''
as $$
  select p.open_hours, p.price_level from public.places p where p.id = pid;
$$;
grant execute on function public.get_place_info(uuid) to authenticated;

-- Cùng quyền với sửa loại quán
create or replace function public.set_place_info(pid uuid, hours text, level smallint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  perm record;
begin
  select * into perm from public.get_place_permissions(pid);
  if perm is null or not perm.can_edit_tags then
    raise exception 'Bạn không có quyền sửa quán này';
  end if;
  update public.places
  set open_hours = nullif(trim(coalesce(hours, '')), ''),
      price_level = level
  where id = pid;
end;
$$;
grant execute on function public.set_place_info(uuid, text, smallint) to authenticated;
