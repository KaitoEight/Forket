import type { Session } from '@supabase/supabase-js';
import { createContext, use, useEffect, useState, type ReactNode } from 'react';

import { supabase } from './supabase';

export type Profile = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
};

type AuthState = {
  session: Session | null;
  profile: Profile | null;
  /** true cho tới khi đọc xong phiên đăng nhập đã lưu */
  loading: boolean;
};

const AuthContext = createContext<AuthState>({ session: null, profile: null, loading: true });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const loadProfile = async (s: Session | null) => {
      if (!s) {
        setProfile(null);
        return;
      }
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url')
        .eq('id', s.user.id)
        .maybeSingle();
      if (error) console.warn('Không tải được hồ sơ:', error.message);
      if (!cancelled) setProfile(data);
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
  }, []);

  return <AuthContext value={{ session, profile, loading }}>{children}</AuthContext>;
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
  await supabase.auth.signOut();
}
