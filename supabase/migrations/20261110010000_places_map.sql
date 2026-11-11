-- Focket: tối ưu bản đồ quán ăn
-- Chạy SAU file 20261110000000_create_posts.sql (Supabase Dashboard → SQL Editor).

-- 1. Ảnh thumbnail nhỏ (240px) để làm marker trên bản đồ, đỡ tải ảnh 1080px
alter table public.posts add column if not exists thumb_url text;

-- 2. Index để lọc quán theo khung bản đồ nhanh
create index if not exists places_lat_lng_idx on public.places (lat, lng);

-- 3. Lấy các quán nằm trong vùng bản đồ đang xem,
--    kèm số bài đăng và ảnh mới nhất làm marker (1 query thay vì N query)
--    (file 20261110030000 tạo lại hàm này kèm điểm đánh giá → luôn chạy file đó sau)
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
  cover_url text
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
    coalesce(stats.post_count, 0) as post_count,
    latest.cover_url
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
  where p.lat between min_lat and max_lat
    and p.lng between min_lng and max_lng
  order by stats.post_count desc nulls last
  limit least(max_results, 500);
$$;

grant execute on function public.get_places_in_view(
  double precision, double precision, double precision, double precision, integer
) to anon, authenticated;
