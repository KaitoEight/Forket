import { Image } from 'expo-image';
import { StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import {
  GestureDetector,
  usePanGesture,
  usePinchGesture,
  useSimultaneousGestures,
  useTapGesture,
} from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

type Props = {
  uri: string;
  /** Khung chứa ảnh (mặc định: lấp đầy khung cha) */
  style?: StyleProp<ViewStyle>;
  contentFit?: 'cover' | 'contain';
  maxScale?: number;
  transition?: number;
};

function clamp(v: number, min: number, max: number) {
  'worklet';
  return Math.min(max, Math.max(min, v));
}

/**
 * Ảnh có thể zoom: chụm 2 ngón để phóng to / thu nhỏ, kéo 2 ngón để xem phần khác, chạm đúp để phóng to / về cũ.
 * Chưa zoom thì 1 ngón vẫn cuộn danh sách / vuốt trang bình thường.
 * Dùng trong Modal thì bọc nội dung Modal bằng GestureHandlerRootView (Android yêu cầu).
 */
export function ZoomableImage({ uri, style, contentFit = 'contain', maxScale = 4, transition = 150 }: Props) {
  const scale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const width = useSharedValue(0);
  const height = useSharedValue(0);

  /** Không cho kéo ảnh ra khỏi khung */
  const settle = () => {
    'worklet';
    if (scale.value < 1.05) {
      scale.value = withTiming(1, { duration: 150 });
      tx.value = withTiming(0, { duration: 150 });
      ty.value = withTiming(0, { duration: 150 });
      return;
    }
    const maxX = ((scale.value - 1) * width.value) / 2;
    const maxY = ((scale.value - 1) * height.value) / 2;
    tx.value = withTiming(clamp(tx.value, -maxX, maxX), { duration: 150 });
    ty.value = withTiming(clamp(ty.value, -maxY, maxY), { duration: 150 });
  };

  const pinch = usePinchGesture({
    onUpdate: (e) => {
      scale.value = clamp(scale.value * e.scaleChange, 0.8, maxScale);
    },
    onDeactivate: settle,
  });

  const pan = usePanGesture({
    minPointers: 2,
    onUpdate: (e) => {
      tx.value += e.changeX;
      ty.value += e.changeY;
    },
    onDeactivate: settle,
  });

  const doubleTap = useTapGesture({
    numberOfTaps: 2,
    onActivate: () => {
      const zoomedIn = scale.value > 1.05;
      scale.value = withTiming(zoomedIn ? 1 : Math.min(2.5, maxScale), { duration: 200 });
      if (zoomedIn) {
        tx.value = withTiming(0, { duration: 200 });
        ty.value = withTiming(0, { duration: 200 });
      }
    },
  });

  const gesture = useSimultaneousGestures(pinch, pan, doubleTap);

  const animated = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }],
  }));

  const onLayout = (e: LayoutChangeEvent) => {
    width.value = e.nativeEvent.layout.width;
    height.value = e.nativeEvent.layout.height;
  };

  return (
    <View style={[styles.box, style]} onLayout={onLayout}>
      <GestureDetector gesture={gesture}>
        <Animated.View style={[StyleSheet.absoluteFill, animated]}>
          <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit={contentFit} transition={transition} />
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { ...StyleSheet.absoluteFill, overflow: 'hidden' },
});
