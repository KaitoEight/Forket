-- Forket: danh sách "Must try" ❤️ (quán nhất định phải thử) + gộp Must try của cả nhóm chat
-- Chạy SAU 20261114030000_reports_limits.sql (Supabase Dashboard → SQL Editor). An toàn khi chạy lại.

-- =========================================================
-- 1. MUST TRY (riêng tư — chỉ mình đọc/ghi trực tiếp)
-- =========================================================
create table if not exists public.must_try (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  place_id uuid not null references public.places (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, place_id)
);
create index if not exists must_try_user_idx on public.must_try (user_id, created_at desc);
create index if not exists must_try_place_idx on public.must_try (place_id);

alter table public.must_try enable row level security;

drop policy if exists "see own must try" on public.must_try;
create policy "see own must try"
  on public.must_try for select to authenticated using (user_id = auth.uid());

drop policy if exists "add to own must try" on public.must_try;
create policy "add to own must try"
  on public.must_try for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "remove from own must try" on public.must_try;
create policy "remove from own must try"
  on public.must_try for delete to authenticated using (user_id = auth.uid());

-- =========================================================
-- 2. POOL CỦA NHÓM: Must try của mọi thành viên (kèm ai đã thả tim)
-- =========================================================
-- Chỉ thành viên của cuộc trò chuyện gọi được. Bỏ qua người đã tắt "chia sẻ hoạt động" và người đang chặn nhau với tôi.
-- Must try của chính tôi luôn được tính.
create or replace function public.group_must_try(conv uuid)
returns table (place_id uuid, user_ids uuid[])
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_member(conv) then
    raise exception 'Bạn không ở trong cuộc trò chuyện này';
  end if;

  return query
  select mt.place_id, array_agg(mt.user_id order by mt.created_at) as user_ids
  from public.must_try mt
  join public.conversation_members cm on cm.conversation_id = conv and cm.user_id = mt.user_id
  where mt.user_id = auth.uid()
     or (public.shares_activity(mt.user_id) and not public.is_blocked_between(auth.uid(), mt.user_id))
  group by mt.place_id;
end;
$$;
grant execute on function public.group_must_try(uuid) to authenticated;

notify pgrst, 'reload schema';
