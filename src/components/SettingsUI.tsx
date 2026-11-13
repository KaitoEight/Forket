import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps, ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { IconButton } from '@/components/IconButton';
import { colors } from '@/constants/theme';
import { goBack } from '@/lib/navigation';

type IconName = ComponentProps<typeof Ionicons>['name'];

/** Thanh tiêu đề: nút quay lại · tiêu đề · (nút phải) */
export function ScreenHeader({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <View style={styles.header}>
      <IconButton icon="chevron-back" label="Quay lại" onPress={() => goBack()} />
      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>
      {right ?? <View style={styles.headerSpacer} />}
    </View>
  );
}

export function SettingsSection({ title, footer, children }: { title?: string; footer?: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      {title && <Text style={styles.sectionTitle}>{title}</Text>}
      <View style={styles.card}>{children}</View>
      {footer && <Text style={styles.footer}>{footer}</Text>}
    </View>
  );
}

export function SettingsRow({
  icon,
  label,
  value,
  onPress,
  danger,
  right,
  last,
}: {
  icon: IconName;
  label: string;
  value?: string;
  onPress?: () => void;
  danger?: boolean;
  right?: ReactNode;
  last?: boolean;
}) {
  const tint = danger ? colors.danger : colors.text;
  return (
    <Pressable
      style={({ pressed }) => [styles.row, !last && styles.rowBorder, pressed && onPress && styles.rowPressed]}
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
    >
      <View style={[styles.iconWrap, danger && styles.iconWrapDanger]}>
        <Ionicons name={icon} size={18} color={danger ? colors.danger : colors.accent} />
      </View>
      <Text style={[styles.label, { color: tint }]} numberOfLines={1}>
        {label}
      </Text>
      {value ? (
        <Text style={styles.value} numberOfLines={1}>
          {value}
        </Text>
      ) : null}
      {right ?? (onPress ? <Ionicons name="chevron-forward" size={18} color={colors.textMuted} /> : null)}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 12,
  },
  title: { flex: 1, textAlign: 'center', color: colors.text, fontSize: 18, fontWeight: '800' },
  headerSpacer: { width: 52 },
  section: { gap: 8 },
  sectionTitle: {
    color: colors.textMuted,
    fontWeight: '700',
    fontSize: 13,
    textTransform: 'uppercase',
    marginLeft: 4,
  },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    overflow: 'hidden',
  },
  footer: { color: colors.textMuted, fontSize: 12, lineHeight: 17, marginHorizontal: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, minHeight: 54 },
  rowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  rowPressed: { backgroundColor: colors.surfaceHigh },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapDanger: { backgroundColor: colors.dangerSoft },
  label: { flex: 1, fontSize: 15, fontWeight: '600' },
  value: { color: colors.textMuted, fontSize: 14, maxWidth: '45%' },
});
