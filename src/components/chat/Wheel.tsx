import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import Svg, { Circle, G, Path, Text as SvgText } from 'react-native-svg';

import { colors } from '@/constants/theme';

export type WheelSegment = { id: string; label: string };

const SLICE_COLORS = [colors.accent, colors.caramel, colors.brown, colors.fresh, colors.accentDark];

function sliceColor(i: number, n: number) {
  // Ô cuối không được trùng màu ô đầu (khi số ô chia 5 dư 1)
  if (i === n - 1 && n > 1 && i % SLICE_COLORS.length === 0) return colors.danger;
  return SLICE_COLORS[i % SLICE_COLORS.length];
}

/** Điểm trên đường tròn, góc tính theo chiều kim đồng hồ từ đỉnh */
function point(cx: number, cy: number, r: number, deg: number) {
  const rad = (deg * Math.PI) / 180;
  return { x: cx + r * Math.sin(rad), y: cy - r * Math.cos(rad) };
}

function slicePath(cx: number, cy: number, r: number, a0: number, a1: number) {
  const p0 = point(cx, cy, r, a0);
  const p1 = point(cx, cy, r, a1);
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${p0.x} ${p0.y} A ${r} ${r} 0 ${large} 1 ${p1.x} ${p1.y} Z`;
}

function shorten(label: string, max: number) {
  const chars = [...label.trim()];
  return chars.length > max ? `${chars.slice(0, max - 1).join('')}…` : label.trim();
}

/** Vòng quay: các ô chia đều, kim chỉ ở đỉnh. `rotation` (độ, chiều kim đồng hồ) điều khiển bằng reanimated. */
export function Wheel({
  segments,
  rotation,
  size,
}: {
  segments: WheelSegment[];
  rotation: SharedValue<number>;
  size: number;
}) {
  const spin = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotation.value}deg` }] }));
  const r = size / 2 - 4;
  const c = size / 2;
  const n = segments.length;
  const step = n > 0 ? 360 / n : 360;
  const fontSize = n > 10 ? 10 : n > 6 ? 12 : 14;
  const maxChars = n > 10 ? 9 : 13;

  return (
    <View style={{ width: size, height: size + 14, alignItems: 'center' }}>
      {/* Kim chỉ */}
      <View style={styles.pointerWrap} pointerEvents="none">
        <View style={styles.pointer} />
      </View>

      <Animated.View style={[{ width: size, height: size, marginTop: 14 }, spin]}>
        <Svg width={size} height={size}>
          {n === 0 ? (
            <Circle cx={c} cy={c} r={r} fill={colors.surfaceHigh} stroke={colors.border} strokeWidth={2} />
          ) : n === 1 ? (
            <>
              <Circle cx={c} cy={c} r={r} fill={sliceColor(0, 1)} />
              <SvgText x={c} y={c + 5} fill={colors.onPhoto} fontSize={16} fontWeight="800" textAnchor="middle">
                {shorten(segments[0].label, 16)}
              </SvgText>
            </>
          ) : (
            segments.map((s, i) => {
              const a0 = i * step;
              const a1 = (i + 1) * step;
              const mid = (a0 + a1) / 2;
              const t = point(c, c, r - 12, mid);
              return (
                <G key={s.id}>
                  <Path d={slicePath(c, c, r, a0, a1)} fill={sliceColor(i, n)} stroke={colors.surface} strokeWidth={2} />
                  <SvgText
                    x={t.x}
                    y={t.y + fontSize / 3}
                    fill={colors.onPhoto}
                    fontSize={fontSize}
                    fontWeight="800"
                    textAnchor="end"
                    transform={`rotate(${mid - 90} ${t.x} ${t.y})`}
                  >
                    {shorten(s.label, maxChars)}
                  </SvgText>
                </G>
              );
            })
          )}
          <Circle cx={c} cy={c} r={r} fill="none" stroke={colors.surface} strokeWidth={4} />
          <Circle cx={c} cy={c} r={14} fill={colors.surface} stroke={colors.border} strokeWidth={2} />
        </Svg>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  pointerWrap: { position: 'absolute', top: 0, left: 0, right: 0, alignItems: 'center', zIndex: 2 },
  pointer: {
    width: 0,
    height: 0,
    borderLeftWidth: 11,
    borderRightWidth: 11,
    borderTopWidth: 22,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: colors.text,
  },
});
