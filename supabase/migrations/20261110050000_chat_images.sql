-- Focket: gửi ảnh trong chat
-- Chạy SAU file 20261110040000_chat_reactions.sql (Supabase Dashboard → SQL Editor).

-- 1. Tin nhắn có thể chỉ có ảnh (không cần chữ)
alter table public.messages add column if not exists image_url text;
alter table public.messages alter column body drop not null;
alter table public.messages drop constraint if exists messages_body_check;
alter table public.messages drop constraint if exists messages_content_check;
alter table public.messages add constraint messages_content_check check (
  (body is null or char_length(body) <= 1000)
  and (image_url is not null or char_length(trim(coalesce(body, ''))) >= 1)
);

-- 2. Danh sách trò chuyện: thêm cờ "tin cuối là ảnh" (đổi kiểu trả về → tạo lại hàm)
drop function if exists public.get_conversations();

create function public.get_conversations()
returns table (
  friend_id uuid,
  username text,
  display_name text,
  last_body text,
  last_image_url text,
  last_sender_id uuid,
  last_post_id uuid,
  last_at timestamptz,
  unread bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with friends as (
    select case when f.requester_id = auth.uid() then f.addressee_id else f.requester_id end as id
    from public.friendships f
    where f.status = 'accepted' and auth.uid() in (f.requester_id, f.addressee_id)
  )
  select
    p.id, p.username, p.display_name,
    last.body, last.image_url, last.sender_id, last.post_id, last.created_at,
    coalesce(unread.n, 0)
  from friends fr
  join public.profiles p on p.id = fr.id
  left join lateral (
    select m.body, m.image_url, m.sender_id, m.post_id, m.created_at
    from public.messages m
    where (m.sender_id = auth.uid() and m.receiver_id = fr.id)
       or (m.sender_id = fr.id and m.receiver_id = auth.uid())
    order by m.created_at desc
    limit 1
  ) last on true
  left join lateral (
    select count(*) as n from public.messages m
    where m.sender_id = fr.id and m.receiver_id = auth.uid() and m.read_at is null
  ) unread on true
  order by last.created_at desc nulls last, p.display_name;
$$;

grant execute on function public.get_conversations() to authenticated;
