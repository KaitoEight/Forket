-- Forket: kiểm tra quyền truy cập (RLS) bằng 3 tài khoản giả.
--
-- CÁCH CHẠY: dán cả file vào Supabase Dashboard → SQL Editor → Run (cần đã chạy đủ các file trong supabase/migrations).
-- File luôn kết thúc bằng một lỗi có chủ đích để HOÀN TÁC toàn bộ dữ liệu giả — không để lại gì trong database:
--   • "ALL RLS CHECKS PASSED (rolled back)"  → mọi kiểm tra đều đạt
--   • "FAILED: <tên kiểm tra>"                → có kiểm tra không đạt, tên cho biết quy tắc nào bị hở
--
-- Các tình huống: bạn bè / người lạ / tắt chia sẻ hoạt động / chặn nhau / tin nhắn riêng / bảng riêng tư /
-- Must try của nhóm / vòng quay minigame (cần đã chạy 20261115000000_must_try.sql và 20261115010000_wheel_games.sql).
-- Chạy lại sau mỗi lần thêm bảng hoặc sửa policy.

do $$
declare
  a uuid := '00000000-0000-4000-8000-00000000000a';
  b uuid := '00000000-0000-4000-8000-00000000000b';
  c uuid := '00000000-0000-4000-8000-00000000000c';
  v_post uuid;
  v_conv uuid;
  v_msg uuid;
  v_game uuid;
  st text;
  n int;
  denied boolean;
begin
  -- ---------- Dữ liệu giả (chạy với quyền quản trị) ----------
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values
    (a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rls-a@test.local',
     '{"username":"rls_a","display_name":"RLS A"}', now(), now()),
    (b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rls-b@test.local',
     '{"username":"rls_b","display_name":"RLS B"}', now(), now()),
    (c, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rls-c@test.local',
     '{"username":"rls_c","display_name":"RLS C"}', now(), now());

  -- A và B là bạn bè; C là người lạ
  insert into public.friendships (requester_id, addressee_id, status) values (a, b, 'accepted');
  insert into public.posts (image_url, created_by) values ('https://example.com/a.jpg', a) returning id into v_post;

  -- ======================================================
  -- 1. ẢNH CHECK-IN
  -- ======================================================
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.posts where id = v_post;
  if n <> 1 then raise exception 'FAILED: bạn bè phải thấy ảnh của nhau (thấy % ảnh)', n; end if;

  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.posts where id = v_post;
  if n <> 0 then raise exception 'FAILED: người lạ không được thấy ảnh (thấy % ảnh)', n; end if;

  -- ======================================================
  -- 2. BÌNH LUẬN
  -- ======================================================
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into public.post_comments (post_id, user_id, body) values (v_post, b, 'ngon quá');

  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  denied := false;
  begin
    insert into public.post_comments (post_id, user_id, body) values (v_post, c, 'xin chào');
  exception when others then denied := true;
  end;
  if not denied then raise exception 'FAILED: người lạ không được bình luận ảnh của người khác'; end if;
  select count(*) into n from public.post_comments where post_id = v_post;
  if n <> 0 then raise exception 'FAILED: người lạ không được đọc bình luận (thấy % bình luận)', n; end if;

  -- ======================================================
  -- 3. CHẾ ĐỘ RIÊNG TƯ: A tắt chia sẻ → B không thấy ảnh nữa
  -- ======================================================
  execute 'reset role';
  update public.profiles set share_activity = false where id = a;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.posts where id = v_post;
  if n <> 0 then raise exception 'FAILED: tắt chia sẻ hoạt động thì bạn bè không được thấy ảnh (thấy % ảnh)', n; end if;

  execute 'reset role';
  update public.profiles set share_activity = true where id = a;

  -- ======================================================
  -- 4. TIN NHẮN RIÊNG A–B
  -- ======================================================
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  v_conv := public.get_or_create_direct(b);
  insert into public.messages (conversation_id, sender_id, kind, body) values (v_conv, a, 'text', 'bí mật');

  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.messages where conversation_id = v_conv;
  if n <> 1 then raise exception 'FAILED: thành viên phải đọc được tin nhắn (thấy % tin)', n; end if;

  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.messages where conversation_id = v_conv;
  if n <> 0 then raise exception 'FAILED: người ngoài không được đọc tin nhắn riêng (thấy % tin)', n; end if;
  denied := false;
  begin
    insert into public.messages (conversation_id, sender_id, kind, body) values (v_conv, c, 'text', 'chen vào');
  exception when others then denied := true;
  end;
  if not denied then raise exception 'FAILED: người ngoài không được gửi tin vào cuộc trò chuyện của người khác'; end if;

  -- ======================================================
  -- 5. CÁC BẢNG RIÊNG TƯ
  -- ======================================================
  -- "Muốn đi": chỉ chủ thấy
  execute 'reset role';
  insert into public.places (name, lat, lng) values ('Quán thử RLS', 10.77, 106.7);
  insert into public.wishlist (user_id, place_id) select b, id from public.places where name = 'Quán thử RLS';
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.wishlist;
  if n <> 0 then raise exception 'FAILED: "Muốn đi" của người khác bị lộ (thấy % dòng)', n; end if;

  -- Thông báo: không ai tự tạo được
  denied := false;
  begin
    insert into public.notifications (user_id, actor_id, type) values (a, b, 'reaction');
  exception when others then denied := true;
  end;
  if not denied then raise exception 'FAILED: người dùng tự tạo được thông báo'; end if;

  -- Token push: không đọc trực tiếp được
  execute 'reset role';
  insert into public.push_tokens (token, user_id) values ('ExponentPushToken[rls-test-token]', b);
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    select count(*) into n from public.push_tokens;
  exception when others then n := 0; -- không có quyền đọc cũng là đạt
  end;
  if n <> 0 then raise exception 'FAILED: token push của người khác bị lộ (thấy % token)', n; end if;

  -- Báo cáo: chỉ người báo cáo thấy
  execute 'reset role';
  insert into public.reports (reporter_id, target_user, reason) values (b, a, 'spam');
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.reports;
  if n <> 0 then raise exception 'FAILED: người bị báo cáo thấy được báo cáo (thấy % báo cáo)', n; end if;

  -- ======================================================
  -- 5b. MUST TRY + VÒNG QUAY TRONG NHÓM CHAT
  -- ======================================================
  -- Must try: không đọc trực tiếp được của người khác
  execute 'reset role';
  insert into public.must_try (user_id, place_id) select b, id from public.places where name = 'Quán thử RLS';
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.must_try;
  if n <> 0 then raise exception 'FAILED: "Must try" của người khác bị lộ (thấy % dòng)', n; end if;

  -- Nhóm A+B: A thấy Must try của B qua group_must_try
  v_conv := public.create_group('Nhóm RLS', array[b]);
  select count(*) into n from public.group_must_try(v_conv);
  if n <> 1 then raise exception 'FAILED: thành viên nhóm phải thấy Must try của nhau (thấy % quán)', n; end if;

  -- B tắt chia sẻ hoạt động → Must try của B không vào pool nhóm nữa
  execute 'reset role';
  update public.profiles set share_activity = false where id = b;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.group_must_try(v_conv);
  if n <> 0 then raise exception 'FAILED: tắt chia sẻ hoạt động mà Must try vẫn vào pool nhóm (thấy % quán)', n; end if;
  execute 'reset role';
  update public.profiles set share_activity = true where id = b;

  -- C (người ngoài nhóm) không gọi được group_must_try
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  denied := false;
  begin
    perform * from public.group_must_try(v_conv);
  exception when others then denied := true;
  end;
  if not denied then raise exception 'FAILED: người ngoài nhóm đọc được Must try của nhóm'; end if;

  -- Vòng quay "Ai trả tiền?" do A tạo trong nhóm
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  v_msg := public.create_wheel(v_conv, 'pay', 'Ai trả tiền?', array[a, b]);
  select id into v_game from public.wheel_games where message_id = v_msg;
  if v_game is null then raise exception 'FAILED: thành viên phải thấy vòng quay vừa tạo'; end if;

  -- C (người ngoài) không thấy vòng quay, không tạo / quay được
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.wheel_games;
  if n <> 0 then raise exception 'FAILED: người ngoài thấy vòng quay của nhóm (thấy % vòng)', n; end if;
  select count(*) into n from public.wheel_entries;
  if n <> 0 then raise exception 'FAILED: người ngoài thấy các ô vòng quay (thấy % ô)', n; end if;
  denied := false;
  begin
    perform public.spin_wheel(v_game);
  exception when others then denied := true;
  end;
  if not denied then raise exception 'FAILED: người ngoài quay được vòng quay của nhóm'; end if;

  -- B (thành viên) không tự sửa kết quả / thêm ô bằng cách ghi trực tiếp vào bảng
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  update public.wheel_games set status = 'done', winner_entry = null where id = v_game;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAILED: thành viên sửa trực tiếp được kết quả vòng quay'; end if;
  denied := false;
  begin
    insert into public.wheel_entries (game_id, user_id, label) values (v_game, b, 'gian lận');
  exception when others then denied := true;
  end;
  if not denied then raise exception 'FAILED: thành viên chèn trực tiếp được ô vào vòng quay'; end if;

  -- B quay hợp lệ: ra đúng 1 người thắng, quay lần nữa bị từ chối
  perform public.spin_wheel(v_game);
  select status into st from public.wheel_games where id = v_game;
  if st <> 'done' then raise exception 'FAILED: vòng "Ai trả tiền?" quay xong phải ở trạng thái done (đang là %)', st; end if;
  denied := false;
  begin
    perform public.spin_wheel(v_game);
  exception when others then denied := true;
  end;
  if not denied then raise exception 'FAILED: vòng đã có kết quả vẫn quay lại được'; end if;

  -- ======================================================
  -- 6. CHẶN NHAU
  -- ======================================================
  execute 'reset role';
  insert into public.blocks (blocker_id, blocked_id) values (a, c);
  if not public.is_blocked_between(c, a) then raise exception 'FAILED: chặn phải có hiệu lực cả hai chiều'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  denied := false;
  begin
    insert into public.friendships (requester_id, addressee_id, status) values (c, a, 'pending');
  exception when others then denied := true;
  end;
  if not denied then raise exception 'FAILED: người bị chặn vẫn gửi được lời mời kết bạn'; end if;

  execute 'reset role';
  -- Hoàn tác toàn bộ dữ liệu giả bằng cách ném lỗi cuối cùng
  raise exception 'ALL RLS CHECKS PASSED (rolled back)';
end $$;
