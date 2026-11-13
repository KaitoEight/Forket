-- Forket: báo cáo vi phạm + giới hạn spam lời mời kết bạn
-- Chạy SAU 20261114020000_comments_dishes_hours.sql (Supabase Dashboard → SQL Editor). An toàn khi chạy lại.

-- =========================================================
-- 1. BÁO CÁO (người dùng / ảnh / bình luận). Quản trị xem trong Dashboard → Table Editor → reports
-- =========================================================
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  target_user uuid references public.profiles (id) on delete cascade,
  post_id uuid references public.posts (id) on delete set null,
  comment_id uuid references public.post_comments (id) on delete set null,
  reason text not null check (reason in ('spam', 'harassment', 'inappropriate', 'other')),
  details text check (details is null or char_length(details) <= 500),
  status text not null default 'open' check (status in ('open', 'reviewed', 'dismissed')),
  created_at timestamptz not null default now(),
  check (target_user is not null or post_id is not null or comment_id is not null)
);
create index if not exists reports_status_idx on public.reports (status, created_at desc);

alter table public.reports enable row level security;

-- Chỉ tạo và xem báo cáo của chính mình; không sửa / xoá được
drop policy if exists "create own report" on public.reports;
create policy "create own report"
  on public.reports for insert to authenticated with check (reporter_id = auth.uid());

drop policy if exists "see own reports" on public.reports;
create policy "see own reports"
  on public.reports for select to authenticated using (reporter_id = auth.uid());

-- Tối đa 20 báo cáo / ngày / người
create or replace function public.trg_limit_reports()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.reports
      where reporter_id = new.reporter_id and created_at > now() - interval '1 day') >= 20 then
    raise exception 'Bạn đã gửi quá nhiều báo cáo hôm nay.';
  end if;
  return new;
end;
$$;

drop trigger if exists limit_reports on public.reports;
create trigger limit_reports
  before insert on public.reports
  for each row execute function public.trg_limit_reports();

-- =========================================================
-- 2. CHỐNG SPAM LỜI MỜI KẾT BẠN: tối đa 30 lời mời mới mỗi ngày
-- =========================================================
create or replace function public.trg_limit_friend_requests()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'pending' and (
    select count(*) from public.friendships
    where requester_id = new.requester_id and created_at > now() - interval '1 day'
  ) >= 30 then
    raise exception 'Hôm nay bạn đã gửi quá nhiều lời mời kết bạn, thử lại vào ngày mai nhé.';
  end if;
  return new;
end;
$$;

drop trigger if exists limit_friend_requests on public.friendships;
create trigger limit_friend_requests
  before insert on public.friendships
  for each row execute function public.trg_limit_friend_requests();
