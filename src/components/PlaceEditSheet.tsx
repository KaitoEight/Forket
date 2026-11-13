import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TagPicker } from '@/components/TagPicker';
import { colors, radius } from '@/constants/theme';
import {
  PRICE_LEVELS,
  setPlaceInfo,
  updatePlace,
  type MapPlace,
  type PlaceInfo,
} from '@/services/placeService';
import { appAlert } from '@/lib/appAlert';

type Props = {
  place: MapPlace;
  /** Giờ mở cửa + mức giá hiện có */
  info: PlaceInfo | null;
  /** Người ghim quán: sửa được tên + địa chỉ; người khác chỉ sửa tag */
  isOwner: boolean;
  onClose: () => void;
  onSaved: (patch: Pick<MapPlace, 'name' | 'address' | 'tags'>, info: PlaceInfo) => void;
};

export function PlaceEditSheet({ place, info, isOwner, onClose, onSaved }: Props) {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState(place.name);
  const [address, setAddress] = useState(place.address ?? '');
  const [tags, setTags] = useState<string[]>(place.tags ?? []);
  const [hours, setHours] = useState(info?.open_hours ?? '');
  const [level, setLevel] = useState<number | null>(info?.price_level ?? null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (isOwner && !name.trim()) {
      appAlert('Thiếu tên quán');
      return;
    }
    setSaving(true);
    try {
      const patch = isOwner
        ? { name: name.trim(), address: address.trim() || null, tags }
        : { name: place.name, address: place.address, tags };
      await updatePlace(place.id, patch);
      const nextInfo: PlaceInfo = { open_hours: hours.trim() || null, price_level: level };
      // Chỉ gọi khi có thay đổi (server cũ chưa có hàm này vẫn lưu được loại quán)
      if (nextInfo.open_hours !== (info?.open_hours ?? null) || nextInfo.price_level !== (info?.price_level ?? null)) {
        await setPlaceInfo(place.id, nextInfo);
      }
      onSaved(patch, nextInfo);
      onClose();
    } catch (e: any) {
      appAlert('Không lưu được', e?.message ?? String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.backdrop} behavior="padding">
        <Pressable style={styles.flex} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.handle} />
          <Text style={styles.title}>Sửa thông tin quán</Text>
          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            {isOwner && (
              <>
                <Text style={styles.label}>Tên quán</Text>
                <TextInput
                  style={styles.input}
                  value={name}
                  onChangeText={setName}
                  maxLength={120}
                  placeholderTextColor={colors.textMuted}
                />
                <Text style={styles.label}>Địa chỉ</Text>
                <TextInput
                  style={styles.input}
                  value={address}
                  onChangeText={setAddress}
                  placeholder="Số nhà, đường…"
                  placeholderTextColor={colors.textMuted}
                />
              </>
            )}
            <Text style={styles.label}>Loại quán</Text>
            <TagPicker value={tags} onChange={setTags} />

            <Text style={styles.label}>Giờ mở cửa (không bắt buộc)</Text>
            <TextInput
              style={styles.input}
              value={hours}
              onChangeText={setHours}
              placeholder="vd: 06:00 – 21:00, nghỉ thứ Hai"
              placeholderTextColor={colors.textMuted}
              maxLength={80}
            />

            <Text style={styles.label}>Mức giá mỗi người (không bắt buộc)</Text>
            <View style={styles.levels}>
              {PRICE_LEVELS.map((p) => {
                const on = level === p.level;
                return (
                  <Pressable
                    key={p.level}
                    style={[styles.level, on && styles.levelOn]}
                    onPress={() => setLevel(on ? null : p.level)}
                    accessibilityState={{ selected: on }}
                  >
                    <Text style={[styles.levelText, on && styles.levelTextOn]}>{p.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
          <View style={styles.actions}>
            <Pressable style={styles.ghost} onPress={onClose}>
              <Text style={styles.ghostText}>Huỷ</Text>
            </Pressable>
            <Pressable style={[styles.save, saving && styles.dim]} onPress={save} disabled={saving}>
              {saving ? <ActivityIndicator color={colors.onAccent} /> : <Text style={styles.saveText}>Lưu</Text>}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  backdrop: { flex: 1, backgroundColor: colors.overlay },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 10,
    paddingHorizontal: 16,
    maxHeight: '85%',
    gap: 12,
  },
  handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: colors.border },
  title: { color: colors.text, fontSize: 18, fontWeight: '800' },
  body: { gap: 8, paddingBottom: 8 },
  label: { color: colors.text, fontWeight: '700', fontSize: 14, marginTop: 4 },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 46,
    fontSize: 15,
  },
  levels: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  level: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: radius.pill,
  },
  levelOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  levelText: { color: colors.text, fontWeight: '700', fontSize: 14 },
  levelTextOn: { color: colors.onAccent },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
  ghost: { paddingHorizontal: 18, height: 46, justifyContent: 'center' },
  ghostText: { color: colors.textMuted, fontWeight: '700', fontSize: 15 },
  save: {
    backgroundColor: colors.accent,
    paddingHorizontal: 28,
    height: 46,
    borderRadius: radius.pill,
    justifyContent: 'center',
  },
  saveText: { color: colors.onAccent, fontWeight: '800', fontSize: 15 },
  dim: { opacity: 0.6 },
});
