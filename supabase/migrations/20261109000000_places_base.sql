-- Forket: bảng quán ăn + hàm tìm quán gần đây (chạy ĐẦU TIÊN khi tạo project Supabase mới)
-- An toàn khi chạy lại: chỉ tạo nếu chưa có, không ghi đè bảng/hàm đang dùng.

create table if not exists public.places (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 120),
  address text,
  lat double precision not null,
  lng double precision not null,
  -- WKT 'POINT(lng lat)' — giữ để tương thích nếu sau này chuyển sang PostGIS
  location text,
  created_by uuid,
  created_at timestamptz not null default now()
);

-- Tìm quán trong bán kính (mét) quanh 1 toạ độ, gần nhất trước (công thức haversine, không cần PostGIS)
do $$
begin
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'get_nearby_places'
  ) then
    execute $fn$
      create function public.get_nearby_places(
        user_lat double precision,
        user_lng double precision,
        radius_meters double precision default 100
      )
      returns table (id uuid, name text, address text, lat double precision, lng double precision, distance_meters double precision)
      language sql
      stable
      as $body$
        select * from (
          select
            p.id, p.name, p.address, p.lat::double precision, p.lng::double precision,
            2 * 6371000 * asin(sqrt(
              power(sin(radians(p.lat - user_lat) / 2), 2)
              + cos(radians(user_lat)) * cos(radians(p.lat)) * power(sin(radians(p.lng - user_lng) / 2), 2)
            )) as distance_meters
          from public.places p
          -- lọc thô theo khung trước cho nhanh (1 độ vĩ ≈ 111 km)
          where p.lat between user_lat - radius_meters / 111000.0 and user_lat + radius_meters / 111000.0
        ) near
        where near.distance_meters <= radius_meters
        order by near.distance_meters
        limit 30
      $body$
    $fn$;
  end if;
end $$;

grant execute on function public.get_nearby_places(double precision, double precision, double precision)
  to anon, authenticated;
