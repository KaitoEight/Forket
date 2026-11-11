import { useEffect, useRef, useState } from 'react';
import { PanResponder } from 'react-native';

type Options = {
  onSwipeUp?: () => void;
  onSwipeDown?: () => void;
  /** Có cho phép vuốt lúc này không (VD: tắt khi đang gõ phím) */
  enabled?: () => boolean;
  /** Chỉ bắt cú vuốt xuống khi điều kiện đúng (VD: đang ở ảnh đầu tiên) */
  canSwipeDown?: () => boolean;
  /** Bắt cú vuốt trước cả view con (VD: danh sách cuộn) */
  capture?: boolean;
};

const MIN_MOVE = 24; // px mới bắt đầu tính là vuốt
const TRIGGER = 70; // px hoặc vuốt nhanh thì kích hoạt

/** Vuốt dọc toàn màn hình (lên/xuống). Chạm thường và vuốt ngang vẫn đi qua view con bình thường. */
export function useVerticalSwipe(options: Options) {
  const opts = useRef(options);
  useEffect(() => {
    opts.current = options;
  });

  // `opts.current` chỉ được đọc bên trong các hàm xử lý cử chỉ (sau render), không đọc lúc render.
  // PanResponder phải tạo 1 lần duy nhất, nếu tạo lại giữa chừng sẽ làm hỏng cú vuốt đang diễn ra.
  // eslint-disable-next-line react-hooks/refs
  const [responder] = useState(() => {
    const wants = (dx: number, dy: number) => {
      const o = opts.current;
      if (o.enabled && !o.enabled()) return false;
      if (Math.abs(dy) < MIN_MOVE || Math.abs(dy) < Math.abs(dx) * 1.5) return false;
      if (dy < 0) return !!o.onSwipeUp;
      return !!o.onSwipeDown && (!o.canSwipeDown || o.canSwipeDown());
    };
    return PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => !opts.current.capture && wants(g.dx, g.dy),
      onMoveShouldSetPanResponderCapture: (_, g) => !!opts.current.capture && wants(g.dx, g.dy),
      onPanResponderTerminationRequest: () => false,
      onPanResponderRelease: (_, g) => {
        const o = opts.current;
        if ((g.dy < -TRIGGER || g.vy < -0.8) && o.onSwipeUp) o.onSwipeUp();
        else if ((g.dy > TRIGGER || g.vy > 0.8) && o.onSwipeDown) o.onSwipeDown();
      },
    });
  });

  return responder.panHandlers;
}
