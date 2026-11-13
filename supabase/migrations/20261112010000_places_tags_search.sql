-- Forket: phân loại quán (tag), tìm quán trên toàn bộ dữ liệu, quản lý quán, ẩn quán trống
-- Chạy SAU 20261112000000_profile_privacy.sql (Supabase Dashboard → SQL Editor). An toàn khi chạy lại.

create extension if not exists unaccent with schema extensions;

-- =========================================================
-- 1. TAG + KHOÁ TÌM KIẾM KHÔNG DẤU
-- =========================================================
alter table public.places add column if not exists tags text[] not null default '{}';
alter table public.places add column if not exists search_key text;

alter table public.places drop constraint if exists places_tags_check;
alter table public.places add constraint places_tags_check check (
  cardinality(tags) <= 3
  and tags <@ array[
    -- Đồ ăn
    'bun_pho', 'com', 'banh_mi', 'lau_nuong', 'an_vat', 'hai_san', 'chay', 'mon_au', 'mon_a',
    -- Đồ uống
    'ca_phe', 'tra_sua', 'tra_nuoc_ep', 'bia_bar', 'trang_mieng'
  ]::text[]
);

-- "Bún Bò Cô Ba" → "bun bo co ba"
create or replace function public.place_search_key(name text)
returns text
language sql
stable
set search_path = ''
as $$
  -- Dạng 2 tham số (chỉ rõ từ điển) để chạy được với search_path rỗng
  select trim(regexp_replace(
    lower(extensions.unaccent('extensions.unaccent'::regdictionary, replace(replace(name, 'đ', 'd'), 'Đ', 'D'))),
    '[^a-z0-9]+', ' ', 'g'
  ));
$$;

create or replace function public.places_set_search_key()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.search_key := public.place_search_key(new.name);
  return new;
end;
$$;

drop trigger if exists places_search_key on public.places;
create trigger places_search_key
  before insert or update of name on public.places
  for each row execute function public.places_set_search_key();

update public.places set search_key = public.place_search_key(name) where search_key is null;
create index if not exists places_search_key_idx on public.places (search_key text_pattern_ops);
create index if not exists places_tags_idx on public.places using gin (tags);

-- =========================================================
-- 2. DỮ LIỆU 1 QUÁN CHO BẢN ĐỒ (ảnh, điểm tự lọc theo RLS → chỉ tính của mình + bạn bè đang chia sẻ)
--    Quán "trống" (không còn ảnh nào mình xem được + không có đánh giá) bị ẩn
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
  review_count bigint,
  tags text[],
  created_by uuid
)
language sql
stable
as $$
  select
    p.id, p.name, p.address, p.lat::double precision, p.lng::double precision,
    coalesce(stats.post_count, 0), latest.cover_url, rv.avg_rating, coalesce(rv.review_count, 0),
    p.tags, p.created_by
  from public.places p
  left join lateral (
    select count(*) as post_count from public.posts po where po.place_id = p.id
  ) stats on true
  left join lateral (
    select coalesce(po.thumb_url, po.image_url) as cover_url
    from public.posts po where po.place_id = p.id
    order by po.created_at desc limit 1
  ) latest on true
  left join lateral (
    select round(avg(r.rating), 1) as avg_rating, count(*) as review_count
    from public.reviews r where r.place_id = p.id
  ) rv on true
  where p.lat between min_lat and max_lat
    and p.lng between min_lng and max_lng
    and (coalesce(stats.post_count, 0) > 0 or coalesce(rv.review_count, 0) > 0)
  order by stats.post_count desc nulls last
  limit least(max_results, 500);
$$;

grant execute on function public.get_places_in_view(
  double precision, double precision, double precision, double precision, integer
) to authenticated;

-- Danh sách quán theo id (dùng cho kết quả tìm kiếm, lọc theo bạn bè, mở quán từ chat/hồ sơ)
create or replace function public.get_places_by_ids(ids uuid[])
returns table (
  id uuid, name text, address text, lat double precision, lng double precision,
  post_count bigint, cover_url text, avg_rating numeric, review_count bigint,
  tags text[], created_by uuid
)
language sql
stable
as $$
  select
    p.id, p.name, p.address, p.lat::double precision, p.lng::double precision,
    coalesce(stats.post_count, 0), latest.cover_url, rv.avg_rating, coalesce(rv.review_count, 0),
    p.tags, p.created_by
  from public.places p
  left join lateral (
    select count(*) as post_count from public.posts po where po.place_id = p.id
  ) stats on true
  left join lateral (
    select coalesce(po.thumb_url, po.image_url) as cover_url
    from public.posts po where po.place_id = p.id
    order by po.created_at desc limit 1
  ) latest on true
  left join lateral (
    select round(avg(r.rating), 1) as avg_rating, count(*) as review_count
    from public.reviews r where r.place_id = p.id
  ) rv on true
  where p.id = any(ids)
  limit 500;
$$;
grant execute on function public.get_places_by_ids(uuid[]) to authenticated;

-- =========================================================
-- 3. TÌM QUÁN TRÊN TOÀN BỘ DỮ LIỆU (không dấu), gần mình trước
-- =========================================================
create or replace function public.search_places(
  q text,
  near_lat double precision default null,
  near_lng double precision default null,
  max_results integer default 20
)
returns table (
  id uuid, name text, address text, lat double precision, lng double precision,
  post_count bigint, cover_url text, avg_rating numeric, review_count bigint,
  tags text[], created_by uuid
)
language sql
stable
as $$
  with matches as (
    select pl.id from public.places pl
    where pl.search_key like '%' || public.place_search_key(q) || '%'
      and length(public.place_search_key(q)) >= 1
    limit 300
  )
  select g.* from public.get_places_by_ids(array(select id from matches)) g
  where g.post_count > 0 or g.review_count > 0
  order by
    case when near_lat is null then 0
      else power(g.lat - near_lat, 2) + power((g.lng - near_lng) * cos(radians(near_lat)), 2) end,
    g.post_count desc
  limit least(max_results, 50);
$$;
grant execute on function public.search_places(text, double precision, double precision, integer) to authenticated;

-- =========================================================
-- 4. QUẢN LÝ QUÁN
--    Người ghim: sửa tên/địa chỉ/tag; xoá khi chưa ai khác dùng; bỏ quyền quản lý.
--    Người từng check-in: sửa tag.
-- =========================================================
create or replace function public.get_place_permissions(pid uuid)
returns table (is_owner boolean, can_edit_tags boolean, can_delete boolean)
language sql
stable
security definer
set search_path = ''
as $$
  with pl as (select created_by from public.places where id = pid),
  others as (
    select exists (
      select 1 from public.posts where place_id = pid and created_by is distinct from auth.uid()
    ) or exists (
      select 1 from public.reviews where place_id = pid and user_id <> auth.uid()
    ) as used
  )
  select
    coalesce(pl.created_by = auth.uid(), false),
    coalesce(pl.created_by = auth.uid(), false)
      or exists (select 1 from public.posts where place_id = pid and created_by = auth.uid()),
    coalesce(pl.created_by = auth.uid(), false) and not others.used
  from pl, others;
$$;
grant execute on function public.get_place_permissions(uuid) to authenticated;

create or replace function public.update_place(pid uuid, new_name text, new_address text, new_tags text[])
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
  if perm.is_owner then
    if new_name is null or char_length(trim(new_name)) not between 1 and 120 then
      raise exception 'Tên quán 1–120 ký tự';
    end if;
    update public.places
    set name = trim(new_name), address = nullif(trim(coalesce(new_address, '')), ''), tags = coalesce(new_tags, '{}')
    where id = pid;
  else
    update public.places set tags = coalesce(new_tags, '{}') where id = pid;
  end if;
end;
$$;
grant execute on function public.update_place(uuid, text, text, text[]) to authenticated;

create or replace function public.delete_place(pid uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  perm record;
begin
  select * into perm from public.get_place_permissions(pid);
  if perm is null or not perm.can_delete then
    raise exception 'Quán đã có ảnh hoặc đánh giá của người khác nên không xoá được';
  end if;
  -- Ảnh check-in vẫn giữ (bỏ gắn quán), đánh giá của chính mình bị xoá theo
  delete from public.places where id = pid;
end;
$$;
grant execute on function public.delete_place(uuid) to authenticated;

create or replace function public.release_place(pid uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.places set created_by = null where id = pid and created_by = auth.uid();
$$;
grant execute on function public.release_place(uuid) to authenticated;
