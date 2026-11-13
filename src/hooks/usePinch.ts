import { useEffect, useRef, useState } from 'react';
import { PanResponder, type GestureResponderEvent } from 'react-native';

type Touch = { pageX: number; pageY: number };

export function touchDistance(touches: readonly Touch[]) {
  const [a, b] = touches;
  return Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
}

type Options = {
  /** Bắt đầu chụm 2 ngón */
  onStart?: () => void;
  /** ratio = khoảng cách 2 ngón hiện tại / lúc bắt đầu chụm (>1: giãn ra, <1: chụm vào) */
  onScale: (ratio: number) => void;
  onEnd?: () => void;
  /** Có cho phép chụm lúc này không */
  enabled?: () => boolean;
};

/** Chụm 2 ngón để zoom. Chạm 1 ngón và vuốt thường vẫn đi qua view con / danh sách cuộn bình thường. */
export function usePinch(options: Options) {
  const opts = useRef(options);
  useEffect(() => {
    opts.current = options;
  });

  // `opts.current` chỉ đọc trong các hàm xử lý cử chỉ (sau render). PanResponder phải tạo đúng 1 lần.
  // eslint-disable-next-line react-hooks/refs
  const [responder] = useState(() => {
    let startDistance = 0;
    const wants = (e: GestureResponderEvent) =>
      e.nativeEvent.touches.length >= 2 && (opts.current.enabled?.() ?? true);

    return PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (e) => wants(e),
      onMoveShouldSetPanResponderCapture: (e) => wants(e),
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        startDistance = e.nativeEvent.touches.length >= 2 ? touchDistance(e.nativeEvent.touches) : 0;
        opts.current.onStart?.();
      },
      onPanResponderMove: (e) => {
        const touches = e.nativeEvent.touches;
        if (touches.length < 2) return;
        const d = touchDistance(touches);
        if (!startDistance) startDistance = d;
        if (startDistance > 0) opts.current.onScale(d / startDistance);
      },
      onPanResponderRelease: () => {
        startDistance = 0;
        opts.current.onEnd?.();
      },
      onPanResponderTerminate: () => {
        startDistance = 0;
        opts.current.onEnd?.();
      },
    });
  });

  return responder.panHandlers;
}
