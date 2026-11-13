import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { useAuth } from '@/lib/auth';
import { countUnreadNotifications, subscribeToNotifications } from '@/services/notificationService';

/** Số thông báo chưa đọc, tự cập nhật theo realtime */
export function useUnreadNotifications() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    const refresh = () =>
      countUnreadNotifications()
        .then((n) => active && setCount(n))
        .catch(() => {});
    refresh();
    const unsubscribe = subscribeToNotifications(userId, { onChange: refresh });
    // Quay lại app từ nền → đếm lại (phòng khi realtime bị ngắt lúc app ngủ)
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => {
      active = false;
      unsubscribe();
      appState.remove();
    };
  }, [userId]);

  return count;
}
