import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, PanResponder, StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';

import { touchDistance } from '@/hooks/usePinch';

type Props = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  maxScale?: number;
};

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/**
 * Chụm 2 ngón để zoom vào/ra ảnh, kéo để xem phần khác khi đang phóng to.
 * - Chưa zoom: chạm 1 ngón / vuốt dọc vẫn là cuộn danh sách như bình thường.
 * - Đang zoom: kéo 1 ngón để di chuyển ảnh. Chụm nhỏ lại (hoặc về gần 1x) để thu về như cũ.
 */
export function PinchZoom({ children, style, maxScale = 4 }: Props) {
  // Giá trị animation tạo 1 lần (useState thay vì useRef để đọc được lúc render)
  const [scale] = useState(() => new Animated.Value(1));
  const [tx] = useState(() => new Animated.Value(0));
  const [ty] = useState(() => new Animated.Value(0));

  const size = useRef({ w: 0, h: 0 });
  const cur = useRef({ scale: 1, tx: 0, ty: 0 });
  const maxRef = useRef(maxScale);
  useEffect(() => {
    maxRef.current = maxScale;
  }, [maxScale]);

  const apply = (s: number, x: number, y: number) => {
    // Không cho kéo ảnh ra khỏi khung
    const maxX = ((s - 1) * size.current.w) / 2;
    const maxY = ((s - 1) * size.current.h) / 2;
    const nx = clamp(x, -maxX, maxX);
    const ny = clamp(y, -maxY, maxY);
    cur.current = { scale: s, tx: nx, ty: ny };
    scale.setValue(s);
    tx.setValue(nx);
    ty.setValue(ny);
  };

  const reset = () => {
    cur.current = { scale: 1, tx: 0, ty: 0 };
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, useNativeDriver: false, friction: 8 }),
      Animated.spring(tx, { toValue: 0, useNativeDriver: false, friction: 8 }),
      Animated.spring(ty, { toValue: 0, useNativeDriver: false, friction: 8 }),
    ]).start();
  };

  // `cur` / `size` chỉ đọc trong các hàm xử lý cử chỉ (sau render). PanResponder phải tạo đúng 1 lần.
  // eslint-disable-next-line react-hooks/refs
  const [responder] = useState(() => {
    // Mốc lúc bắt đầu (hoặc lúc số ngón thay đổi) để tính độ lệch
    let base = { scale: 1, tx: 0, ty: 0, dist: 0, mx: 0, my: 0, count: 0 };

    const rebase = (touches: readonly { pageX: number; pageY: number }[]) => {
      const c = cur.current;
      base = {
        scale: c.scale,
        tx: c.tx,
        ty: c.ty,
        dist: touches.length >= 2 ? touchDistance(touches) : 0,
        mx: touches.reduce((a, t) => a + t.pageX, 0) / Math.max(touches.length, 1),
        my: touches.reduce((a, t) => a + t.pageY, 0) / Math.max(touches.length, 1),
        count: touches.length,
      };
    };

    return PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      // 2 ngón → chụm; đang zoom thì 1 ngón để kéo ảnh
      onMoveShouldSetPanResponder: (e) => e.nativeEvent.touches.length >= 2 || cur.current.scale > 1.02,
      onMoveShouldSetPanResponderCapture: (e) => e.nativeEvent.touches.length >= 2 || cur.current.scale > 1.02,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => rebase(e.nativeEvent.touches),
      onPanResponderMove: (e) => {
        const touches = e.nativeEvent.touches;
        if (touches.length === 0) return;
        // Số ngón đổi giữa chừng (nhấc 1 ngón / đặt thêm) → tính lại mốc để ảnh không bị giật
        if (touches.length !== base.count) rebase(touches);

        const mx = touches.reduce((a, t) => a + t.pageX, 0) / touches.length;
        const my = touches.reduce((a, t) => a + t.pageY, 0) / touches.length;
        let s = base.scale;
        if (touches.length >= 2 && base.dist > 0) {
          s = clamp(base.scale * (touchDistance(touches) / base.dist), 0.8, maxRef.current);
        }
        apply(s, base.tx + (mx - base.mx), base.ty + (my - base.my));
      },
      onPanResponderRelease: () => {
        if (cur.current.scale < 1.08) reset();
      },
      onPanResponderTerminate: () => {
        if (cur.current.scale < 1.08) reset();
      },
    });
  });

  const onLayout = (e: LayoutChangeEvent) => {
    size.current = { w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height };
  };

  return (
    <View style={[styles.box, style]} onLayout={onLayout} {...responder.panHandlers}>
      <Animated.View
        style={[StyleSheet.absoluteFill, { transform: [{ translateX: tx }, { translateY: ty }, { scale }] }]}
      >
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { ...StyleSheet.absoluteFill, overflow: 'hidden' },
});
