-- Forket: danh sách "Muốn đi" + giờ hẹn cho lời "Rủ đi"
-- Chạy SAU 20261114000000_push_notifications.sql (Supabase Dashboard → SQL Editor). An toàn khi chạy lại.

-- =========================================================
-- 1. MUỐN ĐI (riêng tư — chỉ mình thấy)
-- =========================================================
create table if not exists public.wishlist (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  place_id uuid not null references public.places (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, place_id)
);
create index if not exists wishlist_user_idx on public.wishlist (user_id, created_at desc);

alter table public.wishlist enable row level security;

drop policy if exists "see own wishlist" on public.wishlist;
create policy "see own wishlist"
  on public.wishlist for select to authenticated using (user_id = auth.uid());

drop policy if exists "add to own wishlist" on public.wishlist;
create policy "add to own wishlist"
  on public.wishlist for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "remove from own wishlist" on public.wishlist;
create policy "remove from own wishlist"
  on public.wishlist for delete to authenticated using (user_id = auth.uid());

-- Bấm "Đi" ở lời rủ → quán tự vào "Muốn đi" của người đó
create or replace function public.trg_vote_to_wishlist()
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
      insert into public.wishlist (user_id, place_id) values (new.user_id, pid) on conflict do nothing;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists vote_to_wishlist on public.invite_votes;
create trigger vote_to_wishlist
  after insert or update of choice on public.invite_votes
  for each row execute function public.trg_vote_to_wishlist();

-- =========================================================
-- 2. GIỜ HẸN CỦA LỜI RỦ ĐI
-- =========================================================
alter table public.messages add column if not exists invite_at timestamptz;
