-- Forket: minigame vòng quay trong chat — "Ai trả tiền?", "Chọn món (loại dần)", "Chọn món (quay 1 lần)"
-- Chạy SAU 20261115000000_must_try.sql (Supabase Dashboard → SQL Editor). An toàn khi chạy lại.
-- Kết quả do SERVER chọn ngẫu nhiên (hàm spin_wheel) → mọi người thấy cùng một kết quả, không ai quay lại để chọn kết quả mình thích.

-- =========================================================
-- 1. LOẠI TIN MỚI: wheel
-- =========================================================
alter table public.messages drop constraint if exists messages_kind_check;
alter table public.messages add constraint messages_kind_check
  check (kind in ('text', 'image', 'place', 'invite', 'bill', 'wheel'));

alter table public.messages drop constraint if exists messages_content_check;
alter table public.messages add constraint messages_content_check check (
  (body is null or char_length(body) <= 1000)
  and (
    image_url is not null
    or kind in ('place', 'invite', 'bill', 'wheel')
    or char_length(trim(coalesce(body, ''))) >= 1
  )
);

-- =========================================================
-- 2. VÒNG QUAY + CÁC Ô
-- =========================================================
create table if not exists public.wheel_games (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null unique references public.messages (id) on delete cascade,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  -- pay = chọn người trả tiền · food_elim = loại dần · food_spin = quay 1 lần
  mode text not null check (mode in ('pay', 'food_elim', 'food_spin')),
  -- collecting = đang gom món · ready = sẵn sàng quay · done = đã có kết quả
  status text not null default 'collecting' check (status in ('collecting', 'ready', 'done')),
  created_by uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  winner_entry uuid,
  spin_count integer not null default 0,
  last_spin_at timestamptz,
  last_spin_by uuid references public.profiles (id) on delete set null,
  last_picked uuid,
  created_at timestamptz not null default now()
);
create index if not exists wheel_games_conv_idx on public.wheel_games (conversation_id);

create table if not exists public.wheel_entries (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.wheel_games (id) on delete cascade,
  -- pay: người trong vòng quay · food: người đã thêm món
  user_id uuid references public.profiles (id) on delete cascade,
  label text not null check (char_length(trim(label)) between 1 and 40),
  -- Thứ tự bị loại (1, 2, 3…) — null = còn trong vòng
  eliminated_order integer,
  created_at timestamptz not null default now(),
  unique (game_id, user_id)
);
create index if not exists wheel_entries_game_idx on public.wheel_entries (game_id, created_at);

alter table public.wheel_games enable row level security;
alter table public.wheel_entries enable row level security;

create or replace function public.can_access_wheel(gid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.wheel_games g
    where g.id = gid and public.is_member(g.conversation_id)
  );
$$;
grant execute on function public.can_access_wheel(uuid) to authenticated;

-- Chỉ ĐỌC trực tiếp; mọi thay đổi đi qua các hàm bên dưới
drop policy if exists "members see wheel games" on public.wheel_games;
create policy "members see wheel games"
  on public.wheel_games for select to authenticated using (public.is_member(conversation_id));

drop policy if exists "members see wheel entries" on public.wheel_entries;
create policy "members see wheel entries"
  on public.wheel_entries for select to authenticated using (public.can_access_wheel(game_id));

-- =========================================================
-- 3. HÀM
-- =========================================================
-- Tạo vòng quay + tin nhắn trong chat. Trả về id tin nhắn.
--  • pay: member_ids = những người tham gia (≥ 2, phải là thành viên của chat) → sẵn sàng quay ngay
--  • food_*: mỗi người thêm 1 món, người tạo bấm "Bắt đầu"
drop function if exists public.create_wheel(uuid, text, text, uuid[]);
create function public.create_wheel(conv uuid, wheel_mode text, title text, member_ids uuid[] default '{}')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  msg uuid;
  gid uuid;
  clean_title text := trim(coalesce(title, ''));
  m uuid;
  n integer := 0;
begin
  if not public.can_send_to(conv) then raise exception 'Bạn không gửi được tin vào cuộc trò chuyện này'; end if;
  if wheel_mode not in ('pay', 'food_elim', 'food_spin') then raise exception 'Loại vòng quay không hợp lệ'; end if;
  if char_length(clean_title) not between 1 and 80 then raise exception 'Tiêu đề 1–80 ký tự'; end if;

  if wheel_mode = 'pay' then
    select count(distinct cm.user_id) into n
    from public.conversation_members cm
    where cm.conversation_id = conv and cm.user_id = any(coalesce(member_ids, '{}'));
    if n < 2 then raise exception 'Cần ít nhất 2 người để quay'; end if;
  end if;

  insert into public.messages (conversation_id, sender_id, kind, body)
  values (conv, auth.uid(), 'wheel', clean_title)
  returning id into msg;

  insert into public.wheel_games (message_id, conversation_id, mode, status, created_by)
  values (msg, conv, wheel_mode, case when wheel_mode = 'pay' then 'ready' else 'collecting' end, auth.uid())
  returning id into gid;

  if wheel_mode = 'pay' then
    insert into public.wheel_entries (game_id, user_id, label)
    select gid, p.id, left(p.display_name, 40)
    from public.conversation_members cm
    join public.profiles p on p.id = cm.user_id
    where cm.conversation_id = conv and cm.user_id = any(coalesce(member_ids, '{}'));
  end if;

  return msg;
end;
$$;
grant execute on function public.create_wheel(uuid, text, text, uuid[]) to authenticated;

-- Thêm (hoặc đổi) món của tôi — mỗi người 1 món, chỉ khi đang gom món
create or replace function public.set_wheel_entry(gid uuid, entry_label text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  g public.wheel_games;
  clean text := trim(coalesce(entry_label, ''));
begin
  select * into g from public.wheel_games where id = gid for update;
  if g.id is null or not public.is_member(g.conversation_id) then raise exception 'Không tìm thấy vòng quay'; end if;
  if g.mode = 'pay' then raise exception 'Vòng quay này không thêm món'; end if;
  if g.status <> 'collecting' then raise exception 'Đã bắt đầu quay, không thêm món được nữa'; end if;
  if char_length(clean) not between 1 and 40 then raise exception 'Tên món 1–40 ký tự'; end if;

  insert into public.wheel_entries (game_id, user_id, label)
  values (gid, auth.uid(), clean)
  on conflict (game_id, user_id) do update set label = excluded.label;
end;
$$;
grant execute on function public.set_wheel_entry(uuid, text) to authenticated;

-- Rút món của tôi (khi đang gom món)
create or replace function public.remove_wheel_entry(gid uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  g public.wheel_games;
begin
  select * into g from public.wheel_games where id = gid for update;
  if g.id is null or not public.is_member(g.conversation_id) then raise exception 'Không tìm thấy vòng quay'; end if;
  if g.status <> 'collecting' then raise exception 'Đã bắt đầu quay, không rút món được nữa'; end if;
  delete from public.wheel_entries where game_id = gid and user_id = auth.uid();
end;
$$;
grant execute on function public.remove_wheel_entry(uuid) to authenticated;

-- Người tạo bấm "Bắt đầu" khi đã đủ món (≥ 2)
create or replace function public.start_wheel(gid uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  g public.wheel_games;
  n integer;
begin
  select * into g from public.wheel_games where id = gid for update;
  if g.id is null or not public.is_member(g.conversation_id) then raise exception 'Không tìm thấy vòng quay'; end if;
  if g.created_by <> auth.uid() then raise exception 'Chỉ người tạo mới bắt đầu được'; end if;
  if g.status <> 'collecting' then return; end if;
  select count(*) into n from public.wheel_entries where game_id = gid;
  if n < 2 then raise exception 'Cần ít nhất 2 món để quay'; end if;
  update public.wheel_games set status = 'ready' where id = gid;
end;
$$;
grant execute on function public.start_wheel(uuid) to authenticated;

-- Quay! Server chọn ngẫu nhiên, ghi kết quả; mọi máy chạy animation tới đúng ô đó.
--  • pay / food_spin: trúng ô nào thì ô đó thắng, xong luôn
--  • food_elim: ô trúng bị loại; còn 1 ô → ô đó thắng
-- Trả về {picked, finished, winner}.
create or replace function public.spin_wheel(gid uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  g public.wheel_games;
  picked uuid;
  remaining integer;
  winner uuid;
  finished boolean := false;
begin
  select * into g from public.wheel_games where id = gid for update;
  if g.id is null or not public.is_member(g.conversation_id) then raise exception 'Không tìm thấy vòng quay'; end if;
  if g.status = 'collecting' then raise exception 'Chưa bắt đầu — người tạo cần bấm "Bắt đầu" trước'; end if;
  if g.status = 'done' then raise exception 'Vòng quay này đã có kết quả'; end if;
  -- Đang có lượt quay chạy dở → chờ xong (animation ~5 giây)
  if g.last_spin_at is not null and g.last_spin_at > now() - interval '5 seconds' then
    raise exception 'Vòng quay đang quay, chờ một chút nhé';
  end if;

  select id into picked
  from public.wheel_entries
  where game_id = gid and eliminated_order is null
  order by random()
  limit 1;
  if picked is null then raise exception 'Vòng quay chưa có ô nào'; end if;

  if g.mode = 'food_elim' then
    update public.wheel_entries
    set eliminated_order = coalesce((select max(eliminated_order) from public.wheel_entries where game_id = gid), 0) + 1
    where id = picked;
    select count(*) into remaining from public.wheel_entries where game_id = gid and eliminated_order is null;
    if remaining = 1 then
      select id into winner from public.wheel_entries where game_id = gid and eliminated_order is null;
      finished := true;
    end if;
  else
    winner := picked;
    finished := true;
  end if;

  update public.wheel_games
  set spin_count = spin_count + 1,
      last_spin_at = now(),
      last_spin_by = auth.uid(),
      last_picked = picked,
      winner_entry = winner,
      status = case when finished then 'done' else 'ready' end
  where id = gid;

  return jsonb_build_object('picked', picked, 'finished', finished, 'winner', winner);
end;
$$;
grant execute on function public.spin_wheel(uuid) to authenticated;

-- =========================================================
-- 4. REALTIME
-- =========================================================
do $$
declare t text;
begin
  foreach t in array array['wheel_games', 'wheel_entries'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';
