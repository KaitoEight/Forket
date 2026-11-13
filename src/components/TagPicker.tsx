import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { colors, radius } from '@/constants/theme';
import { MAX_PLACE_TAGS, tagsInGroup, useCategories } from '@/constants/placeTags';

/** Chọn 1–3 loại cho quán, chia theo nhóm (Đồ ăn / Đồ uống / Giải trí…) lấy từ database */
export function TagPicker({
  value,
  onChange,
  compact,
}: {
  value: string[];
  onChange: (tags: string[]) => void;
  /** 1 hàng cuộn ngang (dùng ở màn camera, ít chỗ) */
  compact?: boolean;
}) {
  const { groups, tags } = useCategories();

  const toggle = (key: string) => {
    if (value.includes(key)) onChange(value.filter((k) => k !== key));
    else if (value.length < MAX_PLACE_TAGS) onChange([...value, key]);
  };

  if (compact) {
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.compactRow}
        keyboardShouldPersistTaps="handled"
      >
        {tags.map((t) => {
          const on = value.includes(t.key);
          const full = !on && value.length >= MAX_PLACE_TAGS;
          return (
            <Pressable
              key={t.key}
              style={[styles.chip, on && styles.chipOn, full && styles.chipFull]}
              onPress={() => toggle(t.key)}
              disabled={full}
            >
              <Text style={[styles.chipText, on && styles.chipTextOn]}>{t.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    );
  }

  return (
    <View style={styles.wrap}>
      {groups.map((g) => (
        <View key={g.key} style={styles.group}>
          <Text style={styles.groupTitle}>{g.label}</Text>
          <View style={styles.chips}>
            {tagsInGroup(g.key).map((t) => {
              const on = value.includes(t.key);
              const full = !on && value.length >= MAX_PLACE_TAGS;
              return (
                <Pressable
                  key={t.key}
                  style={[styles.chip, on && styles.chipOn, full && styles.chipFull]}
                  onPress={() => toggle(t.key)}
                  disabled={full}
                  accessibilityState={{ selected: on }}
                >
                  <Text style={[styles.chipText, on && styles.chipTextOn]}>{t.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}
      <Text style={styles.hint}>Chọn tối đa {MAX_PLACE_TAGS} loại</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  compactRow: { paddingHorizontal: 16, gap: 6 },
  group: { gap: 6 },
  groupTitle: { color: colors.textMuted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.pill,
  },
  chipOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipFull: { opacity: 0.4 },
  chipText: { color: colors.text, fontWeight: '600', fontSize: 13 },
  chipTextOn: { color: colors.onAccent },
  hint: { color: colors.textMuted, fontSize: 12 },
});
