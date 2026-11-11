-- Focket: chat giữa bạn bè + thả cảm xúc (reaction) lên ảnh
-- Chạy SAU file 20261110030000_accounts_friends_reviews.sql (Supabase Dashboard → SQL Editor).

-- =========================================================
-- 1. TIN NHẮN (chỉ nhắn được cho bạn bè; có thể trả lời 1 ảnh)
-- =========================================================
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  receiver_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 1000),
  post_id uuid references public.posts (id) on delete set null,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  check (sender_id <> receiver_id)
);

create index if not exists messages_pair_idx
  on public.messages (least(sender_id, receiver_id), greatest(sender_id, receiver_id), created_at desc);
create index if not exists messages_unread_idx
  on public.messages (receiver_id) where read_at is null;

alter table public.messages enable row level security;

drop policy if exists "see own messages" on public.messages;
create policy "see own messages"
  on public.messages for select to authenticated
  using (auth.uid() in (sender_id, receiver_id));

drop policy if exists "message friends" on public.messages;
create policy "message friends"
  on public.messages for insert to authenticated
  with check (sender_id = auth.uid() and read_at is null and public.is_friend(receiver_id));

-- Đánh dấu đã đọc qua hàm riêng (không cho sửa nội dung tin nhắn người khác gửi)
create or replace function public.mark_chat_read(friend uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.messages
  set read_at = now()
  where receiver_id = auth.uid() and sender_id = friend and read_at is null;
$$;

grant execute on function public.mark_chat_read(uuid) to authenticated;

-- Danh sách cuộc trò chuyện: mọi bạn bè + tin nhắn cuối + số tin chưa đọc
-- (file 20261110050000 tạo lại hàm này kèm ảnh → luôn chạy file đó sau)
drop function if exists public.get_conversations();
create function public.get_conversations()
returns table (
  friend_id uuid,
  username text,
  display_name text,
  last_body text,
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
    last.body, last.sender_id, last.post_id, last.created_at,
    coalesce(unread.n, 0)
  from friends fr
  join public.profiles p on p.id = fr.id
  left join lateral (
    select m.body, m.sender_id, m.post_id, m.created_at
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

-- =========================================================
-- 2. CẢM XÚC TRÊN ẢNH (chỉ thả được lên ảnh mình xem được)
-- =========================================================
create table if not exists public.reactions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  emoji text not null check (char_length(emoji) between 1 and 8),
  created_at timestamptz not null default now(),
  unique (post_id, user_id, emoji)
);

create index if not exists reactions_post_idx on public.reactions (post_id);

alter table public.reactions enable row level security;

-- Truy vấn posts trong policy cũng bị RLS của posts lọc → chỉ ảnh của mình + bạn bè
drop policy if exists "see reactions on visible posts" on public.reactions;
create policy "see reactions on visible posts"
  on public.reactions for select to authenticated
  using (exists (select 1 from public.posts p where p.id = post_id));

drop policy if exists "react to visible posts" on public.reactions;
create policy "react to visible posts"
  on public.reactions for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from public.posts p where p.id = post_id));

drop policy if exists "remove own reactions" on public.reactions;
create policy "remove own reactions"
  on public.reactions for delete to authenticated
  using (user_id = auth.uid());

-- =========================================================
-- 3. REALTIME
-- =========================================================
do $$
declare t text;
begin
  foreach t in array array['messages', 'reactions'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
