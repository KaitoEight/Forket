-- Forket: gộp "Muốn đi" vào "Yêu thích" (bảng must_try) — chỉ còn MỘT danh sách quán yêu thích
-- Chạy SAU 20261115010000_wheel_games.sql (Supabase Dashboard → SQL Editor). An toàn khi chạy lại.
-- Bảng wishlist cũ KHÔNG bị xoá (dữ liệu vẫn nguyên); app không dùng nó nữa.

-- 1. Chép các quán "Muốn đi" cũ sang "Yêu thích"
do $$
begin
  if to_regclass('public.wishlist') is not null then
    insert into public.must_try (user_id, place_id, created_at)
    select user_id, place_id, created_at from public.wishlist
    on conflict do nothing;
  end if;
end $$;

-- 2. Bấm "Đi" ở lời rủ → quán tự vào "Yêu thích" (trước đây vào "Muốn đi")
create or replace function public.trg_vote_to_favorites()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  pid uuid;
begin
  if new.choice = 'go' then
    select place_id into pid from public.messages where id = new.message_id;
    if pid is not null then
      insert into public.must_try (user_id, place_id) values (new.user_id, pid) on conflict do nothing;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists vote_to_wishlist on public.invite_votes;
drop trigger if exists vote_to_favorites on public.invite_votes;
create trigger vote_to_favorites
  after insert or update of choice on public.invite_votes
  for each row execute function public.trg_vote_to_favorites();

notify pgrst, 'reload schema';
