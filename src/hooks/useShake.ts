import { Accelerometer } from 'expo-sensors';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

const SAMPLE_MS = 80;
/** Gia tốc lệch khỏi trọng lực (đơn vị g) để tính là 1 cú giật */
const JERK_G = 1.35;
/** Hai cú giật phải cách nhau ít nhất chừng này (một cú lắc rung nhiều mẫu liên tiếp) */
const JERK_GAP_MS = 180;
const JERKS_NEEDED = 3;
const WINDOW_MS = 1600;
const COOLDOWN_MS = 2500;

/**
 * Lắc máy ~3 cú trong 1,6 giây → gọi `onShake`. Chỉ nghe khi `enabled` (VD: tab đang mở, không có sheet nào đè lên).
 * Web / máy không có cảm biến: không làm gì (nơi gọi cần có nút bấm thay thế).
 */
export function useShake(onShake: () => void, enabled: boolean) {
  const callback = useRef(onShake);
  useEffect(() => {
    callback.current = onShake;
  }, [onShake]);

  useEffect(() => {
    if (!enabled || Platform.OS === 'web') return;
    let sub: { remove: () => void } | null = null;
    let cancelled = false;
    let jerks: number[] = [];
    let lastJerk = 0;
    let blockedUntil = 0;

    Accelerometer.isAvailableAsync()
      .then((ok) => {
        if (!ok || cancelled) return;
        Accelerometer.setUpdateInterval(SAMPLE_MS);
        sub = Accelerometer.addListener(({ x, y, z }) => {
          const now = Date.now();
          if (now < blockedUntil) return;
          const force = Math.abs(Math.sqrt(x * x + y * y + z * z) - 1);
          if (force < JERK_G || now - lastJerk < JERK_GAP_MS) return;
          lastJerk = now;
          jerks = [...jerks.filter((t) => now - t <= WINDOW_MS), now];
          if (jerks.length >= JERKS_NEEDED) {
            jerks = [];
            blockedUntil = now + COOLDOWN_MS;
            callback.current();
          }
        });
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, [enabled]);
}
