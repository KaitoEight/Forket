-- Forket: ảnh đại diện cho nhóm chat (trưởng nhóm đổi được)
-- Chạy SAU 20261112020000_group_chat.sql (Supabase Dashboard → SQL Editor). An toàn khi chạy lại.

alter table public.conversations add column if not exists avatar_url text;

create or replace function public.set_group_avatar(conv uuid, url text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.conversation_members where conversation_id = conv and user_id = auth.uid() and role = 'admin'
  ) then
    raise exception 'Chỉ trưởng nhóm mới đổi ảnh nhóm được';
  end if;
  update public.conversations set avatar_url = nullif(trim(coalesce(url, '')), '') where id = conv and is_group;
end;
$$;
grant execute on function public.set_group_avatar(uuid, text) to authenticated;

-- Danh sách trò chuyện: nhóm trả về ảnh nhóm ở cột other_avatar_url (giữ nguyên kiểu trả về)
create or replace function public.get_conversations()
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
    select c.id, c.is_group, c.name, c.avatar_url, cm.last_read_at
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
      case when mi.is_group then mi.avatar_url else op.avatar_url end as other_avatar_url,
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
