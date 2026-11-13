-- Forket: phân loại quán nằm trong database (không hard-code) + thêm quán nhậu, giải khát, karaoke, quán net…
-- Chạy SAU 20261113000000_notifications_mentions.sql (Supabase Dashboard → SQL Editor). An toàn khi chạy lại.
--
-- Muốn thêm loại mới sau này, KHÔNG cần sửa app, chỉ cần chạy:
--   insert into public.place_tags (key, label, group_key, sort) values ('xien_que', 'Xiên que', 'food', 95);
-- Muốn thêm nhóm mới (hiện thành 1 chip lọc trên bản đồ):
--   insert into public.place_groups (key, label, icon, sort) values ('spa', 'Làm đẹp', 'sparkles', 40);
-- (icon = tên trong bộ Ionicons: https://ionic.io/ionicons)

-- =========================================================
-- 1. NHÓM + LOẠI
-- =========================================================
create table if not exists public.place_groups (
  key text primary key check (key ~ '^[a-z0-9_]{2,30}$'),
  label text not null,
  icon text not null default 'restaurant',
  sort integer not null default 0
);

create table if not exists public.place_tags (
  key text primary key check (key ~ '^[a-z0-9_]{2,30}$'),
  label text not null,
  group_key text not null references public.place_groups (key) on update cascade,
  sort integer not null default 0
);

alter table public.place_groups enable row level security;
alter table public.place_tags enable row level security;

drop policy if exists "read place groups" on public.place_groups;
create policy "read place groups" on public.place_groups for select to authenticated using (true);

drop policy if exists "read place tags" on public.place_tags;
create policy "read place tags" on public.place_tags for select to authenticated using (true);

insert into public.place_groups (key, label, icon, sort) values
  ('food', 'Đồ ăn', 'restaurant', 10),
  ('drink', 'Đồ uống', 'cafe', 20),
  ('fun', 'Giải trí', 'game-controller', 30)
on conflict (key) do update set label = excluded.label, icon = excluded.icon, sort = excluded.sort;

insert into public.place_tags (key, label, group_key, sort) values
  -- Đồ ăn
  ('bun_pho', 'Bún / Phở', 'food', 10),
  ('com', 'Cơm', 'food', 20),
  ('banh_mi', 'Bánh mì', 'food', 30),
  ('lau_nuong', 'Lẩu / Nướng', 'food', 40),
  ('nhau', 'Quán nhậu', 'food', 50),
  ('an_vat', 'Ăn vặt', 'food', 60),
  ('hai_san', 'Hải sản', 'food', 70),
  ('chay', 'Chay', 'food', 80),
  ('mon_au', 'Món Âu', 'food', 90),
  ('mon_a', 'Món Á', 'food', 100),
  -- Đồ uống
  ('ca_phe', 'Cà phê', 'drink', 10),
  ('tra_sua', 'Trà sữa', 'drink', 20),
  ('tra_nuoc_ep', 'Trà / Nước ép', 'drink', 30),
  ('sinh_to', 'Sinh tố / Nước mía', 'drink', 40),
  ('giai_khat', 'Nước giải khát', 'drink', 50),
  ('bia_bar', 'Bia / Bar', 'drink', 60),
  ('trang_mieng', 'Tráng miệng', 'drink', 70),
  -- Giải trí
  ('karaoke', 'Karaoke', 'fun', 10),
  ('quan_net', 'Quán net / Game', 'fun', 20),
  ('bida', 'Bida', 'fun', 30),
  ('board_game', 'Board game', 'fun', 40)
on conflict (key) do update
  set label = excluded.label, group_key = excluded.group_key, sort = excluded.sort;

-- =========================================================
-- 2. places.tags: bỏ danh sách cố định trong SQL, kiểm tra theo bảng place_tags
-- =========================================================
alter table public.places drop constraint if exists places_tags_check;

create or replace function public.places_validate_tags()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if cardinality(new.tags) > 3 then
    raise exception 'Mỗi quán chọn tối đa 3 loại';
  end if;
  if exists (
    select 1 from unnest(new.tags) t where not exists (select 1 from public.place_tags pt where pt.key = t)
  ) then
    raise exception 'Loại quán không hợp lệ';
  end if;
  return new;
end;
$$;

drop trigger if exists places_validate_tags on public.places;
create trigger places_validate_tags
  before insert or update of tags on public.places
  for each row execute function public.places_validate_tags();
