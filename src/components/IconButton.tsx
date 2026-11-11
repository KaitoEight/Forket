import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { colors } from '@/constants/theme';

type Props = {
  icon: ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
  size?: number;
  color?: string;
  disabled?: boolean;
};

// Nút tròn nền xám, dùng cho thanh trên và hàng điều khiển camera
export function IconButton({ icon, label, onPress, size = 22, color = colors.text, disabled }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.btn, (pressed || disabled) && styles.dim]}
    >
      <Ionicons name={icon} size={size} color={color} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dim: { opacity: 0.5 },
});
