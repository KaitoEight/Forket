import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, View } from 'react-native';

import { colors } from '@/constants/theme';

type Props = {
  value: number;
  /** Có onChange → bấm được để chấm sao; không có → chỉ hiển thị */
  onChange?: (value: number) => void;
  size?: number;
};

export function StarRating({ value, onChange, size = 18 }: Props) {
  return (
    <View
      style={styles.row}
      accessibilityRole={onChange ? 'adjustable' : 'image'}
      accessibilityLabel={`${value} trên 5 sao`}
    >
      {[1, 2, 3, 4, 5].map((n) => {
        // Hiển thị nửa sao cho điểm trung bình (VD 4.5)
        const name = value >= n ? 'star' : value >= n - 0.5 ? 'star-half' : 'star-outline';
        const icon = (
          <Ionicons
            name={name}
            size={size}
            color={value >= n - 0.5 ? colors.star : onChange ? colors.textMuted : colors.border}
          />
        );
        if (!onChange) return <View key={n}>{icon}</View>;
        return (
          <Pressable
            key={n}
            hitSlop={6}
            accessibilityLabel={`${n} sao`}
            // Bấm lại đúng số sao đang chọn → bỏ chấm
            onPress={() => onChange(value === n ? 0 : n)}
          >
            {icon}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
