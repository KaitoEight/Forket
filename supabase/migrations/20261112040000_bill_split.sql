-- Forket: bảng tính tiền trong chat (tên người ăn, số tiền, tên món tuỳ chọn)
-- Chạy SAU 20261112020000_group_chat.sql (Supabase Dashboard → SQL Editor). An toàn khi chạy lại.
-- Tiêu đề bảng lưu ở messages.body; các dòng nằm ở bill_items.

-- =========================================================
-- 1. LOẠI TIN MỚI: bill
-- =========================================================
alter table public.messages drop constraint if exists messages_kind_check;
alter table public.messages add constraint messages_kind_check
  check (kind in ('text', 'image', 'place', 'invite', 'bill'));

alter table public.messages drop constraint if exists messages_content_check;
alter table public.messages add constraint messages_content_check check (
  (body is null or char_length(body) <= 1000)
  and (
    image_url is not null
    or kind in ('place', 'invite', 'bill')
    or char_length(trim(coalesce(body, ''))) >= 1
  )
);

-- =========================================================
-- 2. CÁC DÒNG CỦA BẢNG
-- =========================================================
create table if not exists public.bill_items (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages (id) on delete cascade,
  person_name text not null check (char_length(trim(person_name)) between 1 and 40),
  -- Có khi chọn từ thành viên chat; null khi gõ tên tự do (người không dùng app)
  user_id uuid references public.profiles (id) on delete set null,
  item_name text check (item_name is null or char_length(item_name) <= 60),
  amount bigint not null check (amount > 0 and amount <= 1000000000),
  created_by uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists bill_items_message_idx on public.bill_items (message_id, created_at);

alter table public.bill_items enable row level security;

-- Thành viên của cuộc trò chuyện chứa bảng này
create or replace function public.can_access_bill(msg uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.messages m
    where m.id = msg and m.kind = 'bill' and public.is_member(m.conversation_id)
  );
$$;
grant execute on function public.can_access_bill(uuid) to authenticated;

-- Người tạo bảng (người gửi tin) được sửa/xoá mọi dòng
create or replace function public.is_bill_owner(msg uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.messages m where m.id = msg and m.sender_id = auth.uid());
$$;
grant execute on function public.is_bill_owner(uuid) to authenticated;

drop policy if exists "members see bill items" on public.bill_items;
create policy "members see bill items"
  on public.bill_items for select to authenticated using (public.can_access_bill(message_id));

drop policy if exists "members add bill items" on public.bill_items;
create policy "members add bill items"
  on public.bill_items for insert to authenticated
  with check (created_by = auth.uid() and public.can_access_bill(message_id));

drop policy if exists "edit own or owned bill items" on public.bill_items;
create policy "edit own or owned bill items"
  on public.bill_items for update to authenticated
  using (public.can_access_bill(message_id) and (created_by = auth.uid() or public.is_bill_owner(message_id)))
  with check (public.can_access_bill(message_id) and (created_by = auth.uid() or public.is_bill_owner(message_id)));

drop policy if exists "delete own or owned bill items" on public.bill_items;
create policy "delete own or owned bill items"
  on public.bill_items for delete to authenticated
  using (public.can_access_bill(message_id) and (created_by = auth.uid() or public.is_bill_owner(message_id)));

-- =========================================================
-- 3. REALTIME
-- =========================================================
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'bill_items'
  ) then
    alter publication supabase_realtime add table public.bill_items;
  end if;
end $$;
