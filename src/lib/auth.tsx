import type { Session } from '@supabase/supabase-js';
import { createContext, use, useCallback, useEffect, useState, type ReactNode } from 'react';

import { saveLastAccount } from './lastAccount';
import { unregisterPush } from './push';
import { supabase } from './supabase';

/** Thông tin công khai tối thiểu của 1 người dùng */
export type Profile = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  bio?: string | null;
};

/** Hồ sơ của chính tôi (thêm các cài đặt riêng tư) */
export type MyProfile = Profile & {
  bio: string | null;
  share_activity: boolean;
  discoverable: 'everyone' | 'qr_only';
  friend_code: string | null;
};

type AuthState = {
  session: Session | null;
  profile: MyProfile | null;
  /** true cho tới khi đọc xong phiên đăng nhập đã lưu */
  loading: boolean;
  /** Tải lại hồ sơ (sau khi sửa tên, bio, cài đặt…) */
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthState>({
  session: null,
  profile: null,
  loading: true,
  refreshProfile: async () => {},
});

const MY_FIELDS = 'id, username, display_name, avatar_url, bio, share_activity, discoverable, friend_code';
const BASIC_FIELDS = 'id, username, display_name, avatar_url';

async function fetchMyProfile(userId: string): Promise<MyProfile | null> {
  let res = await supabase.from('profiles').select(MY_FIELDS).eq('id', userId).maybeSingle();
  // Server chưa chạy migration hồ sơ/quyền riêng tư → dùng các cột cơ bản
  if (res.error?.code === '42703') {
    res = (await supabase.from('profiles').select(BASIC_FIELDS).eq('id', userId).maybeSingle()) as typeof res;
  }
  if (res.error) {
    console.warn('Không tải được hồ sơ:', res.error.message);
    return null;
  }
  const d = res.data as Partial<MyProfile> | null;
  if (!d) return null;
  return {
    id: d.id!,
    username: d.username!,
    display_name: d.display_name!,
    avatar_url: d.avatar_url ?? null,
    bio: d.bio ?? null,
    share_activity: d.share_activity ?? true,
    discoverable: d.discoverable ?? 'everyone',
    friend_code: d.friend_code ?? null,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<MyProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const applyProfile = useCallback((s: Session | null, p: MyProfile | null) => {
    setProfile(p);
    // Nhớ tài khoản này để lần sau đăng xuất hiện màn "Chào lại"
    if (s?.user.email && p) {
      saveLastAccount({
        email: s.user.email,
        username: p.username,
        display_name: p.display_name,
        avatar_url: p.avatar_url,
      });
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) return;
    applyProfile(data.session, await fetchMyProfile(data.session.user.id));
  }, [applyProfile]);

  useEffect(() => {
    let cancelled = false;

    const loadProfile = async (s: Session | null) => {
      if (!s) {
        setProfile(null);
        return;
      }
      const p = await fetchMyProfile(s.user.id);
      if (!cancelled) applyProfile(s, p);
    };

    supabase.auth.getSession().then(async ({ data }) => {
      if (cancelled) return;
      setSession(data.session);
      await loadProfile(data.session);
      if (!cancelled) setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      // Không await trong callback của Supabase (tránh deadlock) → chạy sau
      setTimeout(() => loadProfile(s), 0);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [applyProfile]);

  return (
    <AuthContext value={{ session, profile, loading, refreshProfile }}>{children}</AuthContext>
  );
}

export function useAuth() {
  return use(AuthContext);
}

/** Id người dùng đang đăng nhập (ném lỗi nếu chưa đăng nhập) */
export async function requireUserId() {
  const { data } = await supabase.auth.getSession();
  const id = data.session?.user.id;
  if (!id) throw new Error('Bạn cần đăng nhập lại.');
  return id;
}

// ---------- Đăng ký / đăng nhập ----------

/** Đổi lỗi kỹ thuật của Supabase thành lời nhắn dễ hiểu */
function friendlyAuthError(e: { message?: string; code?: string; status?: number }): Error {
  const msg = e.message ?? '';
  if (e.code === 'PGRST202' || e.code === 'PGRST205' || msg.includes('schema cache')) {
    return new Error(
      'Server chưa được cài đặt tài khoản: hãy chạy file SQL 20261110030000_accounts_friends_reviews.sql trong Supabase.'
    );
  }
  if (msg.includes('Database error saving new user')) {
    return new Error('Không tạo được hồ sơ người dùng. Kiểm tra lại file SQL tài khoản đã chạy đủ chưa.');
  }
  if (msg.includes('rate limit')) {
    return new Error('Gửi email quá nhiều lần. Đợi khoảng 1 giờ, hoặc tắt "Confirm email" trong Supabase.');
  }
  if (msg.includes('already registered') || msg.includes('already been registered')) {
    return new Error('Email này đã có tài khoản. Chuyển sang Đăng nhập nhé.');
  }
  if (msg.includes('Invalid login')) return new Error('Sai email hoặc mật khẩu.');
  if (msg.includes('Email not confirmed')) {
    return new Error('Email chưa được xác nhận. Mở link trong hộp thư (hoặc tắt "Confirm email" trong Supabase).');
  }
  if (msg.includes('valid email') || msg.includes('invalid format')) {
    return new Error('Email không hợp lệ.');
  }
  if (msg.includes('Password should be')) return new Error('Mật khẩu quá yếu, cần ít nhất 6 ký tự.');
  if (msg.includes('Network request failed')) return new Error('Không có kết nối mạng.');
  return new Error(msg || 'Có lỗi xảy ra, thử lại nhé.');
}

export const USERNAME_RULE = /^[a-z0-9_.]{3,20}$/;

export async function signUp(input: {
  email: string;
  password: string;
  username: string;
  displayName: string;
}) {
  const username = input.username.trim().toLowerCase();
  if (!USERNAME_RULE.test(username)) {
    throw new Error('Username 3–20 ký tự, chỉ gồm chữ thường không dấu, số, "_" hoặc ".".');
  }

  const { data: available, error: checkError } = await supabase.rpc('is_username_available', {
    name: username,
  });
  if (checkError) throw friendlyAuthError(checkError);
  if (!available) throw new Error(`@${username} đã có người dùng, chọn tên khác nhé.`);

  const { data, error } = await supabase.auth.signUp({
    email: input.email.trim(),
    password: input.password,
    options: { data: { username, display_name: input.displayName.trim() || username } },
  });
  if (error) throw friendlyAuthError(error);
  // Nếu Supabase còn bật "Confirm email" thì chưa có phiên đăng nhập ngay
  return { needsEmailConfirm: !data.session };
}

export async function signIn(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw friendlyAuthError(error);
}

export async function signOut() {
  await unregisterPush();
  await supabase.auth.signOut();
}
