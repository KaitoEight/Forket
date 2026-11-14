import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import { appAlert } from '@/lib/appAlert';

type Props = {
  placeId: string;
  active: boolean;
  toggle: (placeId: string) => Promise<unknown>;
  icon: { on: React.ComponentProps<typeof Ionicons>['name']; off: React.ComponentProps<typeof Ionicons>['name'] };
  label: { on: string; off: string };
  /** Màu viền / icon, nền nhạt khi tắt, nền đậm khi bật */
  tone: { main: string; soft: string; onText: string; offText: string };
  /** Chỉ icon */
  compact?: boolean;
};

/** Nút bật / tắt một danh sách quán của tôi ("Yêu thích"…) */
export function PlaceListButton({ placeId, active, toggle, icon, label, tone, compact }: Props) {
  const [busy, setBusy] = useState(false);

  const press = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await toggle(placeId);
    } catch (e: any) {
      appAlert('Không lưu được', e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Pressable
      onPress={press}
      accessibilityLabel={active ? label.on : label.off}
      accessibilityState={{ selected: active }}
      style={({ pressed }) => [
        styles.btn,
        compact && styles.compact,
        { borderColor: tone.main, backgroundColor: active ? tone.main : tone.soft },
        pressed && styles.pressed,
      ]}
    >
      <Ionicons name={active ? icon.on : icon.off} size={17} color={active ? tone.onText : tone.main} />
      {!compact && <Text style={[styles.text, { color: active ? tone.onText : tone.offText }]}>{active ? label.on : label.off}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 44,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
  },
  compact: { width: 44, paddingHorizontal: 0 },
  pressed: { opacity: 0.8 },
  text: { fontWeight: '800', fontSize: 14 },
});
