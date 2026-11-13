-- Forket: trung tâm thông báo (chuông) + nhắc tên (@bạn bè, @all) trong chat nhóm + realtime cho bản đồ
-- Chạy SAU 20261112050000_bill_paid_rename.sql (Supabase Dashboard → SQL Editor). An toàn khi chạy lại.

-- =========================================================
-- 1. NHẮC TÊN TRONG TIN NHẮN
-- =========================================================
alter table public.messages add column if not exists mentions uuid[] not null default '{}';
alter table public.messages add column if not exists mention_all boolean not null default false;

-- =========================================================
-- 2. BẢNG THÔNG BÁO
-- =========================================================
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete cascade,
  type text not null check (type in (
    'friend_request', 'friend_accepted', 'reaction', 'group_added', 'mention', 'mention_all', 'bill_item'
  )),
  post_id uuid references public.posts (id) on delete cascade,
  conversation_id uuid references public.conversations (id) on delete cascade,
  message_id uuid references public.messages (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);
create index if not exists notifications_unread_idx on public.notifications (user_id) where read_at is null;

alter table public.notifications enable row level security;

-- Chỉ đọc / xoá thông báo của mình. Tạo thông báo chỉ qua trigger bên dưới (không ai tự tạo được)
drop policy if exists "see own notifications" on public.notifications;
create policy "see own notifications"
  on public.notifications for select to authenticated using (user_id = auth.uid());

drop policy if exists "delete own notifications" on public.notifications;
create policy "delete own notifications"
  on public.notifications for delete to authenticated using (user_id = auth.uid());

-- Đánh dấu đã đọc (ids = null → tất cả)
create or replace function public.mark_notifications_read(ids uuid[] default null)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.notifications
  set read_at = now()
  where user_id = auth.uid() and read_at is null and (ids is null or id = any(ids));
$$;
grant execute on function public.mark_notifications_read(uuid[]) to authenticated;

-- Tạo 1 thông báo (nội bộ): bỏ qua tự báo cho mình và người đang chặn nhau
create or replace function public.push_notification(
  target uuid,
  actor uuid,
  ntype text,
  post uuid default null,
  conv uuid default null,
  msg uuid default null,
  payload jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if target is null or target = actor then return; end if;
  if actor is not null and public.is_blocked_between(actor, target) then return; end if;
  insert into public.notifications (user_id, actor_id, type, post_id, conversation_id, message_id, data)
  values (target, actor, ntype, post, conv, msg, coalesce(payload, '{}'::jsonb));
end;
$$;
revoke all on function public.push_notification(uuid, uuid, text, uuid, uuid, uuid, jsonb) from public, anon, authenticated;

-- =========================================================
-- 3. TRIGGER SINH THÔNG BÁO
-- =========================================================

-- 3a. Lời mời kết bạn
create or replace function public.trg_notify_friend_request()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'pending' then
    perform public.push_notification(
      new.addressee_id, new.requester_id, 'friend_request', null, null, null,
      jsonb_build_object('friendship_id', new.id)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists notify_friend_request on public.friendships;
create trigger notify_friend_request
  after insert on public.friendships
  for each row execute function public.trg_notify_friend_request();

-- 3b. Lời mời được chấp nhận → báo người gửi, đồng thời đánh dấu đã đọc thông báo lời mời
create or replace function public.trg_notify_friend_accepted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'pending' and new.status = 'accepted' then
    perform public.push_notification(new.requester_id, new.addressee_id, 'friend_accepted');
    update public.notifications
    set read_at = coalesce(read_at, now())
    where user_id = new.addressee_id and type = 'friend_request' and actor_id = new.requester_id;
  end if;
  return new;
end;
$$;

drop trigger if exists notify_friend_accepted on public.friendships;
create trigger notify_friend_accepted
  after update on public.friendships
  for each row execute function public.trg_notify_friend_accepted();

-- 3c. Huỷ / từ chối lời mời → gỡ thông báo lời mời
create or replace function public.trg_cleanup_friend_request()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.notifications
  where type = 'friend_request' and user_id = old.addressee_id and actor_id = old.requester_id;
  return old;
end;
$$;

drop trigger if exists cleanup_friend_request on public.friendships;
create trigger cleanup_friend_request
  after delete on public.friendships
  for each row execute function public.trg_cleanup_friend_request();

-- 3d. Ai đó thả cảm xúc vào ảnh của mình (bỏ cảm xúc → gỡ thông báo)
create or replace function public.trg_notify_reaction()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner uuid;
begin
  select created_by into owner from public.posts where id = new.post_id;
  perform public.push_notification(
    owner, new.user_id, 'reaction', new.post_id, null, null, jsonb_build_object('emoji', new.emoji)
  );
  return new;
end;
$$;

drop trigger if exists notify_reaction on public.reactions;
create trigger notify_reaction
  after insert on public.reactions
  for each row execute function public.trg_notify_reaction();

create or replace function public.trg_cleanup_reaction()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.notifications
  where type = 'reaction' and post_id = old.post_id and actor_id = old.user_id and data ->> 'emoji' = old.emoji;
  return old;
end;
$$;

drop trigger if exists cleanup_reaction on public.reactions;
create trigger cleanup_reaction
  after delete on public.reactions
  for each row execute function public.trg_cleanup_reaction();

-- 3e. Được thêm vào nhóm
create or replace function public.trg_notify_group_added()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  conv record;
begin
  select is_group, name into conv from public.conversations where id = new.conversation_id;
  if conv.is_group and new.user_id is distinct from auth.uid() then
    perform public.push_notification(
      new.user_id, auth.uid(), 'group_added', null, new.conversation_id, null,
      jsonb_build_object('name', conv.name)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists notify_group_added on public.conversation_members;
create trigger notify_group_added
  after insert on public.conversation_members
  for each row execute function public.trg_notify_group_added();

-- 3f. Nhắc tên trong nhóm: @bạn bè (chỉ thành viên nhóm) hoặc @all (mọi người trong nhóm)
create or replace function public.trg_notify_mentions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid;
  is_grp boolean;
  preview text := left(coalesce(new.body, ''), 120);
begin
  if cardinality(new.mentions) = 0 and not new.mention_all then return new; end if;
  select is_group into is_grp from public.conversations where id = new.conversation_id;
  if not coalesce(is_grp, false) then return new; end if;

  if new.mention_all then
    for uid in
      select user_id from public.conversation_members
      where conversation_id = new.conversation_id and user_id <> new.sender_id
    loop
      perform public.push_notification(
        uid, new.sender_id, 'mention_all', null, new.conversation_id, new.id, jsonb_build_object('preview', preview)
      );
    end loop;
  else
    foreach uid in array new.mentions loop
      if exists (
        select 1 from public.conversation_members where conversation_id = new.conversation_id and user_id = uid
      ) then
        perform public.push_notification(
          uid, new.sender_id, 'mention', null, new.conversation_id, new.id, jsonb_build_object('preview', preview)
        );
      end if;
    end loop;
  end if;
  return new;
end;
$$;

drop trigger if exists notify_mentions on public.messages;
create trigger notify_mentions
  after insert on public.messages
  for each row execute function public.trg_notify_mentions();

-- 3g. Được ghi tên vào bảng tính tiền
create or replace function public.trg_notify_bill_item()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  conv uuid;
begin
  if new.user_id is not null and new.user_id <> new.created_by then
    select conversation_id into conv from public.messages where id = new.message_id;
    perform public.push_notification(
      new.user_id, new.created_by, 'bill_item', null, conv, new.message_id,
      jsonb_build_object('amount', new.amount, 'item', new.item_name)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists notify_bill_item on public.bill_items;
create trigger notify_bill_item
  after insert on public.bill_items
  for each row execute function public.trg_notify_bill_item();

-- =========================================================
-- 4. REALTIME: thông báo + thay đổi quán / đánh giá (để bản đồ tự cập nhật)
-- =========================================================
do $$
declare t text;
begin
  foreach t in array array['notifications', 'reviews', 'places'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
