-- Forket: bảng tính tiền — đánh dấu "đã trả" từng dòng + đổi tên bảng
-- Chạy SAU 20261112040000_bill_split.sql (Supabase Dashboard → SQL Editor). An toàn khi chạy lại.

alter table public.bill_items add column if not exists paid boolean not null default false;

-- Tick "đã trả": người tạo bảng, người thêm dòng, hoặc chính người ăn (nếu chọn từ thành viên chat).
-- Dùng hàm riêng để những người này đổi được trạng thái mà KHÔNG sửa được số tiền, tên, món.
create or replace function public.set_bill_item_paid(item uuid, is_paid boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.bill_items bi
  set paid = is_paid
  where bi.id = item
    and public.can_access_bill(bi.message_id)
    and (bi.created_by = auth.uid() or bi.user_id = auth.uid() or public.is_bill_owner(bi.message_id));
  if not found then
    raise exception 'Bạn không có quyền đổi trạng thái dòng này';
  end if;
end;
$$;
grant execute on function public.set_bill_item_paid(uuid, boolean) to authenticated;

-- Đổi tên bảng: chỉ người tạo bảng (người gửi tin)
create or replace function public.rename_bill(msg uuid, new_title text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  t text := nullif(trim(coalesce(new_title, '')), '');
begin
  if t is not null and char_length(t) > 60 then
    raise exception 'Tên bảng tối đa 60 ký tự';
  end if;
  update public.messages
  set body = coalesce(t, 'Tính tiền')
  where id = msg and kind = 'bill' and sender_id = auth.uid();
  if not found then
    raise exception 'Chỉ người tạo bảng mới đổi tên được';
  end if;
end;
$$;
grant execute on function public.rename_bill(uuid, text) to authenticated;
