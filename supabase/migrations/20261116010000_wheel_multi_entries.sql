-- Forket: vòng quay chọn món cho nhập NHIỀU món mỗi người (chống trùng), xoá món của người khác bởi trưởng nhóm / người tạo
-- Chạy SAU 20261116000000_merge_wishlist_into_favorites.sql (Supabase Dashboard → SQL Editor). An toàn khi chạy lại.

-- 1. Một người được thêm nhiều ô → bỏ ràng buộc "mỗi người 1 ô"
alter table public.wheel_entries drop constraint if exists wheel_entries_game_id_user_id_key;
create index if not exists wheel_entries_game_user_idx on public.wheel_entries (game_id, user_id);

-- 2. Bỏ 2 hàm cũ (1 món / người)
drop function if exists public.set_wheel_entry(uuid, text);
drop function if exists public.remove_wheel_entry(uuid);

-- 3. Thêm 1 món. Không thêm trùng (không phân biệt hoa thường / khoảng trắng thừa). Tối đa 5 món / người, 30 món / vòng.
create or replace function public.add_wheel_entry(gid uuid, entry_label text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  g public.wheel_games;
  clean text := regexp_replace(btrim(coalesce(entry_label, '')), '\s+', ' ', 'g');
  new_id uuid;
begin
  select * into g from public.wheel_games where id = gid for update;
  if g.id is null or not public.is_member(g.conversation_id) then raise exception 'Không tìm thấy vòng quay'; end if;
  if g.mode = 'pay' then raise exception 'Vòng quay này không thêm món'; end if;
  if g.status <> 'collecting' then raise exception 'Đã bắt đầu quay, không thêm món được nữa'; end if;
  if char_length(clean) not between 1 and 40 then raise exception 'Tên món 1–40 ký tự'; end if;

  if exists (
    select 1 from public.wheel_entries e
    where e.game_id = gid and lower(regexp_replace(btrim(e.label), '\s+', ' ', 'g')) = lower(clean)
  ) then
    raise exception 'Món “%” đã có trong vòng quay rồi', clean;
  end if;

  if (select count(*) from public.wheel_entries e where e.game_id = gid and e.user_id = auth.uid()) >= 5 then
    raise exception 'Mỗi người thêm tối đa 5 món';
  end if;
  if (select count(*) from public.wheel_entries e where e.game_id = gid) >= 30 then
    raise exception 'Vòng quay tối đa 30 món';
  end if;

  insert into public.wheel_entries (game_id, user_id, label) values (gid, auth.uid(), clean)
  returning id into new_id;
  return new_id;
end;
$$;
grant execute on function public.add_wheel_entry(uuid, text) to authenticated;

-- 4. Xoá 1 món: món của mình, hoặc (trưởng nhóm / người tạo vòng quay) xoá món của bất kỳ ai. Chỉ khi đang gom món.
create or replace function public.delete_wheel_entry(entry_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.wheel_entries;
  g public.wheel_games;
  is_admin boolean;
begin
  select * into e from public.wheel_entries where id = entry_id;
  if e.id is null then return; end if;
  select * into g from public.wheel_games where id = e.game_id for update;
  if g.id is null or not public.is_member(g.conversation_id) then raise exception 'Không tìm thấy vòng quay'; end if;
  if g.status <> 'collecting' then raise exception 'Đã bắt đầu quay, không xoá món được nữa'; end if;

  select exists (
    select 1 from public.conversation_members cm
    where cm.conversation_id = g.conversation_id and cm.user_id = auth.uid() and cm.role = 'admin'
  ) into is_admin;

  if e.user_id is distinct from auth.uid() and g.created_by <> auth.uid() and not is_admin then
    raise exception 'Chỉ người thêm món, trưởng nhóm hoặc người tạo vòng quay mới xoá được món này';
  end if;

  delete from public.wheel_entries where id = entry_id;
end;
$$;
grant execute on function public.delete_wheel_entry(uuid) to authenticated;

notify pgrst, 'reload schema';
