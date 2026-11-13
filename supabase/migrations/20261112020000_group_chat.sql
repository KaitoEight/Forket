-- Forket: chat nhóm + card quán + lời rủ đi ăn có vote
-- Chuyển tin nhắn 1-1 cũ sang mô hình cuộc trò chuyện (conversation) — tin nhắn cũ giữ nguyên.
-- Chạy SAU 20261112010000_places_tags_search.sql (Supabase Dashboard → SQL Editor). An toàn khi chạy lại.

-- =========================================================
-- 1. CUỘC TRÒ CHUYỆN + THÀNH VIÊN
-- =========================================================
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  is_group boolean not null default false,
  name text check (name is null or char_length(trim(name)) between 1 and 60),
  -- Chat 1-1: "<id nhỏ>:<id lớn>" để mỗi cặp chỉ có 1 cuộc trò chuyện
  direct_key text unique,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.conversation_members (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member' check (role in ('admin', 'member')),
  joined_at timestamptz not null default now(),
  last_read_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create index if not exists conversation_members_user_idx on public.conversation_members (user_id);

alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;

create or replace function public.is_member(conv uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.conversation_members
    where conversation_id = conv and user_id = auth.uid()
  );
$$;
grant execute on function public.is_member(uuid) to authenticated;

drop policy if exists "members see conversation" on public.conversations;
create policy "members see conversation"
  on public.conversations for select to authenticated using (public.is_member(id));

drop policy if exists "members see members" on public.conversation_members;
create policy "members see members"
  on public.conversation_members for select to authenticated using (public.is_member(conversation_id));

-- Mọi thay đổi khác (tạo nhóm, thêm/xoá người, đổi tên…) đi qua các hàm bên dưới

-- =========================================================
-- 2. TIN NHẮN: gắn vào cuộc trò chuyện, thêm loại tin (ảnh, card quán, rủ đi)
-- =========================================================
alter table public.messages add column if not exists conversation_id uuid references public.conversations (id) on delete cascade;
alter table public.messages add column if not exists kind text not null default 'text';
alter table public.messages add column if not exists place_id uuid references public.places (id) on delete set null;
alter table public.messages alter column receiver_id drop not null;

alter table public.messages drop constraint if exists messages_kind_check;
alter table public.messages add constraint messages_kind_check check (kind in ('text', 'image', 'place', 'invite'));

alter table public.messages drop constraint if exists messages_content_check;
alter table public.messages add constraint messages_content_check check (
  (body is null or char_length(body) <= 1000)
  and (
    image_url is not null
    or kind in ('place', 'invite')
    or char_length(trim(coalesce(body, ''))) >= 1
  )
);

-- Chuyển tin nhắn cũ: mỗi cặp đã nhắn → 1 cuộc trò chuyện 1-1
insert into public.conversations (is_group, direct_key, created_at)
select false, least(m.sender_id, m.receiver_id)::text || ':' || greatest(m.sender_id, m.receiver_id)::text, min(m.created_at)
from public.messages m
where m.conversation_id is null and m.receiver_id is not null
group by least(m.sender_id, m.receiver_id), greatest(m.sender_id, m.receiver_id)
on conflict (direct_key) do nothing;

insert into public.conversation_members (conversation_id, user_id, role, last_read_at)
select c.id, u.id, 'member', now()
from public.conversations c
cross join lateral (
  select split_part(c.direct_key, ':', 1)::uuid as id
  union all
  select split_part(c.direct_key, ':', 2)::uuid
) u
where c.direct_key is not null
  and exists (select 1 from public.profiles p where p.id = u.id)
on conflict do nothing;

update public.messages m
set conversation_id = c.id,
    kind = case when m.image_url is not null then 'image' else m.kind end
from public.conversations c
where m.conversation_id is null
  and m.receiver_id is not null
  and c.direct_key = least(m.sender_id, m.receiver_id)::text || ':' || greatest(m.sender_id, m.receiver_id)::text;

-- Tin chưa đọc cũ: lùi mốc "đã đọc" về trước tin chưa đọc đầu tiên
update public.conversation_members cm
set last_read_at = sub.first_unread - interval '1 millisecond'
from (
  select m.conversation_id, m.receiver_id, min(m.created_at) as first_unread
  from public.messages m
  where m.read_at is null and m.receiver_id is not null and m.conversation_id is not null
  group by m.conversation_id, m.receiver_id
) sub
where cm.conversation_id = sub.conversation_id and cm.user_id = sub.receiver_id;

delete from public.messages where conversation_id is null;
alter table public.messages alter column conversation_id set not null;
create index if not exists messages_conversation_idx on public.messages (conversation_id, created_at desc);

drop policy if exists "see own messages" on public.messages;
drop policy if exists "message friends" on public.messages;
drop policy if exists "members read messages" on public.messages;
drop policy if exists "members send messages" on public.messages;

create policy "members read messages"
  on public.messages for select to authenticated using (public.is_member(conversation_id));

-- Gửi được khi là thành viên; chat 1-1 thì 2 người vẫn phải là bạn bè
create or replace function public.can_send_to(conv uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_member(conv) and (
    (select is_group from public.conversations where id = conv)
    or exists (
      select 1 from public.conversation_members cm
      where cm.conversation_id = conv and cm.user_id <> auth.uid() and public.is_friend(cm.user_id)
    )
  );
$$;
grant execute on function public.can_send_to(uuid) to authenticated;

create policy "members send messages"
  on public.messages for insert to authenticated
  with check (sender_id = auth.uid() and read_at is null and public.can_send_to(conversation_id));

-- =========================================================
-- 3. VOTE CHO LỜI RỦ ĐI ĂN
-- =========================================================
create table if not exists public.invite_votes (
  message_id uuid not null references public.messages (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  choice text not null check (choice in ('go', 'no')),
  updated_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

alter table public.invite_votes enable row level security;

drop policy if exists "members see votes" on public.invite_votes;
create policy "members see votes"
  on public.invite_votes for select to authenticated
  using (exists (select 1 from public.messages m where m.id = message_id));

drop policy if exists "members vote" on public.invite_votes;
create policy "members vote"
  on public.invite_votes for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.messages m where m.id = message_id and m.kind = 'invite')
  );

drop policy if exists "change own vote" on public.invite_votes;
create policy "change own vote"
  on public.invite_votes for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "remove own vote" on public.invite_votes;
create policy "remove own vote"
  on public.invite_votes for delete to authenticated using (user_id = auth.uid());

-- =========================================================
-- 4. HÀM QUẢN LÝ CUỘC TRÒ CHUYỆN
-- =========================================================
-- Mở (hoặc tạo) chat 1-1 với 1 người bạn
create or replace function public.get_or_create_direct(friend uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  key text := least(auth.uid(), friend)::text || ':' || greatest(auth.uid(), friend)::text;
  conv uuid;
begin
  if friend = auth.uid() then raise exception 'Không thể tự nhắn cho chính mình'; end if;
  select id into conv from public.conversations where direct_key = key;
  if conv is null then
    if not public.is_friend(friend) then raise exception 'Chỉ nhắn tin được với bạn bè'; end if;
    insert into public.conversations (is_group, direct_key, created_by)
    values (false, key, auth.uid())
    on conflict (direct_key) do update set direct_key = excluded.direct_key
    returning id into conv;
    insert into public.conversation_members (conversation_id, user_id)
    values (conv, auth.uid()), (conv, friend)
    on conflict do nothing;
  end if;
  return conv;
end;
$$;
grant execute on function public.get_or_create_direct(uuid) to authenticated;

-- Tạo nhóm với các bạn bè của tôi (người tạo = admin)
create or replace function public.create_group(group_name text, member_ids uuid[])
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  conv uuid;
  m uuid;
begin
  if group_name is null or char_length(trim(group_name)) not between 1 and 60 then
    raise exception 'Tên nhóm 1–60 ký tự';
  end if;
  insert into public.conversations (is_group, name, created_by)
  values (true, trim(group_name), auth.uid())
  returning id into conv;
  insert into public.conversation_members (conversation_id, user_id, role) values (conv, auth.uid(), 'admin');
  foreach m in array coalesce(member_ids, '{}') loop
    if m <> auth.uid() and public.is_friend(m) and not public.is_blocked_between(auth.uid(), m) then
      insert into public.conversation_members (conversation_id, user_id) values (conv, m) on conflict do nothing;
    end if;
  end loop;
  return conv;
end;
$$;
grant execute on function public.create_group(text, uuid[]) to authenticated;

-- Thành viên nào cũng thêm được, nhưng chỉ thêm bạn bè của chính mình
create or replace function public.add_group_members(conv uuid, member_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  m uuid;
  added integer := 0;
begin
  if not public.is_member(conv) or not (select is_group from public.conversations where id = conv) then
    raise exception 'Bạn không ở trong nhóm này';
  end if;
  foreach m in array coalesce(member_ids, '{}') loop
    if public.is_friend(m) and not public.is_blocked_between(auth.uid(), m) then
      insert into public.conversation_members (conversation_id, user_id) values (conv, m) on conflict do nothing;
      if found then added := added + 1; end if;
    end if;
  end loop;
  return added;
end;
$$;
grant execute on function public.add_group_members(uuid, uuid[]) to authenticated;

-- Admin xoá thành viên; ai cũng tự rời nhóm được. Admin rời → người vào sớm nhất làm admin.
create or replace function public.remove_group_member(conv uuid, member uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  my_role text;
begin
  select role into my_role from public.conversation_members where conversation_id = conv and user_id = auth.uid();
  if my_role is null then raise exception 'Bạn không ở trong nhóm này'; end if;
  if member <> auth.uid() and my_role <> 'admin' then raise exception 'Chỉ trưởng nhóm mới xoá được thành viên'; end if;

  delete from public.conversation_members where conversation_id = conv and user_id = member;

  if not exists (select 1 from public.conversation_members where conversation_id = conv) then
    delete from public.conversations where id = conv;
  elsif not exists (select 1 from public.conversation_members where conversation_id = conv and role = 'admin') then
    update public.conversation_members set role = 'admin'
    where conversation_id = conv
      and user_id = (select user_id from public.conversation_members where conversation_id = conv order by joined_at limit 1);
  end if;
end;
$$;
grant execute on function public.remove_group_member(uuid, uuid) to authenticated;

create or replace function public.rename_group(conv uuid, group_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.conversation_members where conversation_id = conv and user_id = auth.uid() and role = 'admin'
  ) then
    raise exception 'Chỉ trưởng nhóm mới đổi tên được';
  end if;
  if group_name is null or char_length(trim(group_name)) not between 1 and 60 then
    raise exception 'Tên nhóm 1–60 ký tự';
  end if;
  update public.conversations set name = trim(group_name) where id = conv and is_group;
end;
$$;
grant execute on function public.rename_group(uuid, text) to authenticated;

create or replace function public.mark_conversation_read(conv uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.conversation_members set last_read_at = now()
  where conversation_id = conv and user_id = auth.uid();
$$;
grant execute on function public.mark_conversation_read(uuid) to authenticated;

create or replace function public.count_unread_messages()
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)
  from public.conversation_members cm
  join public.messages m on m.conversation_id = cm.conversation_id
  where cm.user_id = auth.uid() and m.sender_id <> auth.uid() and m.created_at > cm.last_read_at;
$$;
grant execute on function public.count_unread_messages() to authenticated;

-- =========================================================
-- 5. DANH SÁCH TRÒ CHUYỆN: nhóm + chat 1-1 + bạn bè chưa nhắn lần nào
-- =========================================================
drop function if exists public.get_conversations();
drop function if exists public.mark_chat_read(uuid);

create function public.get_conversations()
returns table (
  conversation_id uuid,
  is_group boolean,
  title text,
  other_id uuid,
  other_username text,
  other_avatar_url text,
  member_count bigint,
  last_body text,
  last_kind text,
  last_image_url text,
  last_sender_id uuid,
  last_sender_name text,
  last_post_id uuid,
  last_at timestamptz,
  unread bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with mine as (
    select c.id, c.is_group, c.name, cm.last_read_at
    from public.conversation_members cm
    join public.conversations c on c.id = cm.conversation_id
    where cm.user_id = auth.uid()
  ),
  rows as (
    select
      mi.id as conversation_id,
      mi.is_group,
      case when mi.is_group then mi.name else op.display_name end as title,
      op.id as other_id,
      op.username as other_username,
      op.avatar_url as other_avatar_url,
      (select count(*) from public.conversation_members x where x.conversation_id = mi.id) as member_count,
      last.body, last.kind, last.image_url, last.sender_id, sp.display_name as sender_name, last.post_id,
      last.created_at,
      (select count(*) from public.messages u
        where u.conversation_id = mi.id and u.sender_id <> auth.uid() and u.created_at > mi.last_read_at) as unread
    from mine mi
    left join lateral (
      select p.id, p.username, p.display_name, p.avatar_url
      from public.conversation_members o join public.profiles p on p.id = o.user_id
      where not mi.is_group and o.conversation_id = mi.id and o.user_id <> auth.uid()
      limit 1
    ) op on true
    left join lateral (
      select m.body, m.kind, m.image_url, m.sender_id, m.post_id, m.created_at
      from public.messages m where m.conversation_id = mi.id
      order by m.created_at desc limit 1
    ) last on true
    left join public.profiles sp on sp.id = last.sender_id
    -- Chat 1-1 với người đã huỷ kết bạn/xoá tài khoản mà chưa từng nhắn → bỏ
    where mi.is_group or op.id is not null
  ),
  friends_without_chat as (
    select
      null::uuid, false, p.display_name, p.id, p.username, p.avatar_url, 2::bigint,
      null::text, null::text, null::text, null::uuid, null::text, null::uuid, null::timestamptz, 0::bigint
    from public.friendships f
    join public.profiles p on p.id = case when f.requester_id = auth.uid() then f.addressee_id else f.requester_id end
    where f.status = 'accepted' and auth.uid() in (f.requester_id, f.addressee_id)
      and not exists (select 1 from rows r where r.other_id = p.id)
  )
  select * from rows
  union all
  select * from friends_without_chat
  order by 14 desc nulls last, 3;
$$;
grant execute on function public.get_conversations() to authenticated;

-- =========================================================
-- 6. REALTIME
-- =========================================================
do $$
declare t text;
begin
  foreach t in array array['invite_votes', 'conversation_members'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
