-- Forket: thông báo đẩy (push) khi app đóng — qua Expo Push API, gọi trực tiếp từ database bằng pg_net.
-- Chạy SAU 20261113010000_place_categories.sql (Supabase Dashboard → SQL Editor). An toàn khi chạy lại.
-- Không cần Edge Function. Cần app build bằng development build / EAS (Expo Go trên Android không nhận push).

create extension if not exists pg_net with schema extensions;

-- =========================================================
-- 1. TOKEN THIẾT BỊ
-- =========================================================
create table if not exists public.push_tokens (
  token text primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  platform text,
  updated_at timestamptz not null default now()
);
create index if not exists push_tokens_user_idx on public.push_tokens (user_id);

-- Bật RLS và không tạo policy: app chỉ đăng ký / gỡ token qua 2 hàm bên dưới
alter table public.push_tokens enable row level security;

-- Máy đổi tài khoản → token chuyển sang tài khoản mới (không gửi nhầm cho người cũ)
create or replace function public.register_push_token(tok text, plat text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or tok is null or char_length(tok) not between 10 and 200 then return; end if;
  insert into public.push_tokens (token, user_id, platform, updated_at)
  values (tok, auth.uid(), plat, now())
  on conflict (token) do update set user_id = excluded.user_id, platform = excluded.platform, updated_at = now();
end;
$$;
grant execute on function public.register_push_token(text, text) to authenticated;

create or replace function public.remove_push_token(tok text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.push_tokens where token = tok and user_id = auth.uid();
$$;
grant execute on function public.remove_push_token(text) to authenticated;

-- =========================================================
-- 2. GỬI PUSH (nội bộ)
-- =========================================================
create or replace function public.send_push(targets uuid[], title text, body text, payload jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  msgs jsonb;
begin
  if targets is null or cardinality(targets) = 0 then return; end if;
  select jsonb_agg(jsonb_build_object(
    'to', t.token, 'title', title, 'body', body, 'data', coalesce(payload, '{}'::jsonb),
    'sound', 'default', 'channelId', 'default'
  ))
  into msgs
  from (select token from public.push_tokens where user_id = any(targets) limit 100) t;
  if msgs is null then return; end if;

  perform net.http_post(
    url := 'https://exp.host/--/api/v2/push/send',
    headers := '{"Content-Type":"application/json","Accept":"application/json"}'::jsonb,
    body := msgs
  );
exception when others then
  -- Push hỏng không bao giờ được làm hỏng việc gửi tin / thông báo
  raise warning 'send_push failed: %', sqlerrm;
end;
$$;
revoke all on function public.send_push(uuid[], text, text, jsonb) from public, anon, authenticated;

-- Nội dung push cho từng loại thông báo
create or replace function public.notification_push_text(ntype text, who text, payload jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select case ntype
    when 'friend_request' then who || ' muốn kết bạn với bạn'
    when 'friend_accepted' then who || ' đã chấp nhận lời mời kết bạn'
    when 'reaction' then who || ' đã thả ' || coalesce(payload ->> 'emoji', '❤️') || ' vào ảnh của bạn'
    when 'group_added' then who || ' đã thêm bạn vào nhóm' || coalesce(' “' || (payload ->> 'name') || '”', '')
    when 'mention' then who || ' đã nhắc đến bạn' || coalesce(': ' || (payload ->> 'preview'), '')
    when 'mention_all' then who || ' đã nhắc mọi người' || coalesce(': ' || (payload ->> 'preview'), '')
    when 'bill_item' then who || ' ghi bạn vào bảng tính tiền'
    when 'comment' then who || ' đã bình luận ảnh của bạn' || coalesce(': ' || (payload ->> 'preview'), '')
    else who || ' có hoạt động mới'
  end;
$$;

-- =========================================================
-- 3. MỖI THÔNG BÁO MỚI → 1 PUSH
-- =========================================================
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
declare
  nid uuid;
  who text := 'Ai đó';
begin
  if target is null or target = actor then return; end if;
  if actor is not null and public.is_blocked_between(actor, target) then return; end if;
  insert into public.notifications (user_id, actor_id, type, post_id, conversation_id, message_id, data)
  values (target, actor, ntype, post, conv, msg, coalesce(payload, '{}'::jsonb))
  returning id into nid;

  if actor is not null then
    select display_name into who from public.profiles where id = actor;
  end if;
  perform public.send_push(
    array[target], 'Forket', public.notification_push_text(ntype, coalesce(who, 'Ai đó'), payload),
    jsonb_build_object(
      'type', ntype, 'notification_id', nid, 'actor_id', actor, 'post_id', post, 'conversation_id', conv
    )
  );
end;
$$;
revoke all on function public.push_notification(uuid, uuid, text, uuid, uuid, uuid, jsonb) from public, anon, authenticated;

-- =========================================================
-- 4. TIN NHẮN MỚI → PUSH CHO NHỮNG NGƯỜI CÒN LẠI TRONG CUỘC TRÒ CHUYỆN
-- (người được @nhắc đã nhận push từ thông báo nhắc tên, không gửi trùng)
-- =========================================================
create or replace function public.trg_push_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  targets uuid[];
  grp record;
  sender_name text;
  preview text;
  title text;
begin
  select array_agg(cm.user_id)
  into targets
  from public.conversation_members cm
  where cm.conversation_id = new.conversation_id
    and cm.user_id <> new.sender_id
    and not public.is_blocked_between(new.sender_id, cm.user_id)
    and not new.mention_all
    and not (cm.user_id = any(new.mentions));
  if targets is null then return new; end if;

  select is_group, name into grp from public.conversations where id = new.conversation_id;
  select display_name into sender_name from public.profiles where id = new.sender_id;

  preview := case new.kind
    when 'image' then '📷 Đã gửi một ảnh'
    when 'place' then '📍 Đã chia sẻ một quán'
    when 'invite' then '🍽️ Rủ đi ăn' || coalesce(': ' || left(new.body, 80), '')
    when 'bill' then '🧾 Bảng tính tiền' || coalesce(': ' || left(new.body, 80), '')
    else left(coalesce(new.body, ''), 120)
  end;

  if coalesce(grp.is_group, false) then
    title := coalesce(grp.name, 'Nhóm');
    preview := coalesce(sender_name, 'Ai đó') || ': ' || preview;
  else
    title := coalesce(sender_name, 'Forket');
  end if;

  perform public.send_push(
    targets, title, preview,
    jsonb_build_object('type', 'message', 'conversation_id', new.conversation_id, 'message_id', new.id)
  );
  return new;
end;
$$;

drop trigger if exists push_message on public.messages;
create trigger push_message
  after insert on public.messages
  for each row execute function public.trg_push_message();
