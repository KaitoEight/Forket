-- Forket: hồ sơ (bio, mã kết bạn), quyền riêng tư, chặn người dùng, xoá tài khoản
-- Chạy SAU các migration trước (Supabase Dashboard → SQL Editor). An toàn khi chạy lại.

-- =========================================================
-- 1. HỒ SƠ: bio, chia sẻ hoạt động, ai tìm thấy tôi, mã kết bạn (QR)
-- =========================================================
alter table public.profiles add column if not exists bio text;
alter table public.profiles add column if not exists share_activity boolean not null default true;
alter table public.profiles add column if not exists discoverable text not null default 'everyone';
alter table public.profiles add column if not exists friend_code text;

alter table public.profiles drop constraint if exists profiles_bio_check;
alter table public.profiles add constraint profiles_bio_check check (bio is null or char_length(bio) <= 150);
alter table public.profiles drop constraint if exists profiles_discoverable_check;
alter table public.profiles add constraint profiles_discoverable_check
  check (discoverable in ('everyone', 'qr_only'));

-- Mã 8 ký tự, bỏ các ký tự dễ nhầm (0/O, 1/I/L)
create or replace function public.generate_friend_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  code text;
begin
  loop
    code := '';
    for i in 1..8 loop
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.profiles where friend_code = code);
  end loop;
  return code;
end;
$$;

update public.profiles set friend_code = public.generate_friend_code() where friend_code is null;
alter table public.profiles alter column friend_code set default public.generate_friend_code();
alter table public.profiles alter column friend_code set not null;
create unique index if not exists profiles_friend_code_idx on public.profiles (friend_code);

-- Đổi mã kết bạn (mã cũ hết hiệu lực)
create or replace function public.reset_friend_code()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  code text := public.generate_friend_code();
begin
  update public.profiles set friend_code = code where id = auth.uid();
  return code;
end;
$$;
grant execute on function public.reset_friend_code() to authenticated;

-- =========================================================
-- 2. CHẶN NGƯỜI DÙNG
-- =========================================================
create table if not exists public.blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

alter table public.blocks enable row level security;

drop policy if exists "see own blocks" on public.blocks;
create policy "see own blocks"
  on public.blocks for select to authenticated using (blocker_id = auth.uid());

drop policy if exists "unblock" on public.blocks;
create policy "unblock"
  on public.blocks for delete to authenticated using (blocker_id = auth.uid());

-- Hai người có chặn nhau (theo bất kỳ chiều nào) không
create or replace function public.is_blocked_between(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.blocks
    where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a)
  );
$$;
grant execute on function public.is_blocked_between(uuid, uuid) to authenticated;

-- Chặn = huỷ kết bạn / lời mời luôn
create or replace function public.block_user(target uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if target = auth.uid() then
    raise exception 'Không thể tự chặn chính mình';
  end if;
  insert into public.blocks (blocker_id, blocked_id) values (auth.uid(), target)
  on conflict do nothing;
  delete from public.friendships
  where least(requester_id, addressee_id) = least(auth.uid(), target)
    and greatest(requester_id, addressee_id) = greatest(auth.uid(), target);
end;
$$;
grant execute on function public.block_user(uuid) to authenticated;

-- Danh sách người tôi đã chặn (kèm hồ sơ)
create or replace function public.get_blocked_users()
returns table (id uuid, username text, display_name text, avatar_url text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.username, p.display_name, p.avatar_url
  from public.blocks b join public.profiles p on p.id = b.blocked_id
  where b.blocker_id = auth.uid()
  order by b.created_at desc;
$$;
grant execute on function public.get_blocked_users() to authenticated;

-- Không gửi lời mời kết bạn được khi đang chặn nhau
drop policy if exists "send friend requests" on public.friendships;
create policy "send friend requests"
  on public.friendships for insert to authenticated
  with check (
    requester_id = auth.uid()
    and status = 'pending'
    and not public.is_blocked_between(requester_id, addressee_id)
  );

-- =========================================================
-- 3. QUYỀN RIÊNG TƯ: tắt chia sẻ hoạt động → bạn bè không thấy ảnh, quán đã đi, đánh giá
-- =========================================================
create or replace function public.shares_activity(owner uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select share_activity from public.profiles where id = owner), false);
$$;
grant execute on function public.shares_activity(uuid) to authenticated;

drop policy if exists "see own and friends posts" on public.posts;
create policy "see own and friends posts"
  on public.posts for select to authenticated
  using (
    created_by = auth.uid()
    or (public.is_friend(created_by) and public.shares_activity(created_by))
  );

-- Đánh giá: của mình, hoặc của người đang chia sẻ hoạt động và không chặn nhau
drop policy if exists "reviews readable by signed-in users" on public.reviews;
create policy "reviews readable by signed-in users"
  on public.reviews for select to authenticated
  using (
    user_id = auth.uid()
    or (public.shares_activity(user_id) and not public.is_blocked_between(auth.uid(), user_id))
  );

-- =========================================================
-- 4. TÌM NGƯỜI DÙNG (bỏ qua người chỉ cho tìm qua QR và người đã chặn nhau)
-- =========================================================
create or replace function public.search_users(q text)
returns table (id uuid, username text, display_name text, avatar_url text, bio text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.username, p.display_name, p.avatar_url, p.bio
  from public.profiles p
  where p.id <> auth.uid()
    and p.discoverable = 'everyone'
    and not public.is_blocked_between(auth.uid(), p.id)
    and (p.username ilike q || '%' or p.display_name ilike '%' || q || '%')
  order by (p.username ilike q || '%') desc, p.display_name
  limit 20;
$$;
grant execute on function public.search_users(text) to authenticated;

-- Tìm theo mã QR (được cả người đặt "chỉ qua QR")
create or replace function public.find_user_by_code(code text)
returns table (id uuid, username text, display_name text, avatar_url text, bio text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.username, p.display_name, p.avatar_url, p.bio
  from public.profiles p
  where p.friend_code = upper(trim(code))
    and not public.is_blocked_between(auth.uid(), p.id)
  limit 1;
$$;
grant execute on function public.find_user_by_code(text) to authenticated;

-- =========================================================
-- 5. XOÁ TÀI KHOẢN (xoá auth user → hồ sơ, bài đăng, đánh giá, tin nhắn tự xoá theo)
-- =========================================================
-- Quán do người này ghim vẫn giữ lại cho mọi người (chỉ bỏ người ghim)
update public.places pl set created_by = null
where created_by is not null and not exists (select 1 from public.profiles p where p.id = pl.created_by);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'places_created_by_fkey') then
    alter table public.places
      add constraint places_created_by_fkey
      foreign key (created_by) references public.profiles (id) on delete set null;
  end if;
end $$;

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Chưa đăng nhập';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;
grant execute on function public.delete_my_account() to authenticated;

-- Ảnh đại diện: cho phép ghi đè file của chính mình (upsert)
drop policy if exists "users update own photos" on storage.objects;
create policy "users update own photos"
  on storage.objects for update to authenticated
  using (bucket_id = 'photos' and owner_id = (select auth.uid())::text);
