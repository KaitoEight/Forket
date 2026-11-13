import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { colors, radius } from '@/constants/theme';

const DAY_LABELS = ['Hôm nay', 'Ngày mai', 'Ngày kia'];
const FIRST_HOUR = 6;
const LAST_HOUR = 23;

/** Các mốc mỗi 30 phút từ 06:00 đến 23:30 */
const SLOTS = Array.from({ length: (LAST_HOUR - FIRST_HOUR + 1) * 2 }, (_, i) => ({
  h: FIRST_HOUR + Math.floor(i / 2),
  m: (i % 2) * 30,
}));

const pad = (n: number) => String(n).padStart(2, '0');

function atSlot(dayOffset: number, h: number, m: number) {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(h, m, 0, 0);
  return d;
}

type Props = {
  value: Date | null;
  onChange: (value: Date | null) => void;
};

/** Chọn giờ hẹn cho lời rủ: ngày (hôm nay / mai / kia) + mốc giờ cách nhau 30 phút. Mặc định: không hẹn giờ. */
export function InviteTimePicker({ value, onChange }: Props) {
  const [day, setDay] = useState(0);
  const [now] = useState(() => Date.now());

  const pickDay = (d: number) => {
    setDay(d);
    // Đổi ngày thì giữ nguyên giờ đã chọn (nếu có)
    if (value) onChange(atSlot(d, value.getHours(), value.getMinutes()));
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.dayRow}>
        <Chip label="Không hẹn giờ" active={!value} onPress={() => onChange(null)} />
        {DAY_LABELS.map((label, i) => (
          <Chip key={label} label={label} active={!!value && day === i} onPress={() => pickDay(i)} />
        ))}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.slots}>
        {SLOTS.map(({ h, m }) => {
          const slot = atSlot(day, h, m);
          const past = slot.getTime() <= now;
          const active = !!value && value.getTime() === slot.getTime();
          return (
            <Chip
              key={`${h}:${m}`}
              small
              label={`${pad(h)}:${pad(m)}`}
              active={active}
              disabled={past}
              onPress={() => onChange(slot)}
            />
          );
        })}
      </ScrollView>
    </View>
  );
}

function Chip({
  label,
  active,
  disabled,
  small,
  onPress,
}: {
  label: string;
  active: boolean;
  disabled?: boolean;
  small?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityState={{ selected: active, disabled }}
      style={[styles.chip, small && styles.chipSmall, active && styles.chipOn, disabled && styles.chipOff]}
    >
      <Text style={[styles.chipText, active && styles.chipTextOn]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  dayRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  slots: { gap: 6, paddingRight: 8 },
  chip: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.pill,
  },
  chipSmall: { paddingHorizontal: 11, paddingVertical: 6 },
  chipOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipOff: { opacity: 0.35 },
  chipText: { color: colors.text, fontWeight: '700', fontSize: 13 },
  chipTextOn: { color: colors.onAccent },
});
