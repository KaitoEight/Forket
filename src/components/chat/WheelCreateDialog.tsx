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

import { colors, radius } from '@/constants/theme';
import { WHEEL_MODES, type WheelMode } from '@/services/wheelService';

export type WheelPerson = { id: string; display_name: string };

type Props = {
  mode: WheelMode;
  /** Thành viên cuộc trò chuyện (chọn người tham gia "Ai trả tiền?") */
  people: WheelPerson[];
  meId: string | undefined;
  onClose: () => void;
  onCreate: (title: string, memberIds: string[]) => Promise<void>;
};

/** Hộp tạo vòng quay: đặt tiêu đề (+ chọn người tham gia với "Ai trả tiền?") */
export function WheelCreateDialog({ mode, people, meId, onClose, onCreate }: Props) {
  const info = WHEEL_MODES[mode];
  const [title, setTitle] = useState(info.defaultTitle);
  const [picked, setPicked] = useState<Set<string>>(() => new Set(people.map((p) => p.id)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needPeople = mode === 'pay';
  const canCreate = !!title.trim() && (!needPeople || picked.size >= 2) && !busy;

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const create = async () => {
    if (!canCreate) return;
    setBusy(true);
    setError(null);
    try {
      await onCreate(title.trim(), needPeople ? [...picked] : []);
      onClose();
    } catch (e: any) {
      setError(e?.message ?? String(e));
      setBusy(false);
    }
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.backdrop} behavior="padding">
        <View style={styles.dialog}>
          <Text style={styles.heading}>{info.label}</Text>
          <Text style={styles.hint}>{info.hint}</Text>

          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder="Tiêu đề"
            placeholderTextColor={colors.textMuted}
            maxLength={80}
            returnKeyType="done"
            onSubmitEditing={needPeople ? undefined : create}
          />

          {needPeople && (
            <>
              <Text style={styles.label}>
                Ai tham gia? ({picked.size}/{people.length})
              </Text>
              <ScrollView style={styles.peopleScroll} contentContainerStyle={styles.chips} keyboardShouldPersistTaps="handled">
                {people.map((p) => {
                  const on = picked.has(p.id);
                  return (
                    <Pressable key={p.id} style={[styles.chip, on && styles.chipOn]} onPress={() => toggle(p.id)}>
                      <Text style={[styles.chipText, on && styles.chipTextOn]}>
                        {p.display_name}
                        {p.id === meId ? ' (bạn)' : ''}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
              {picked.size < 2 && <Text style={styles.warn}>Chọn ít nhất 2 người.</Text>}
            </>
          )}

          {!!error && <Text style={styles.error}>{error}</Text>}

          <View style={styles.actions}>
            <Pressable style={styles.ghost} onPress={onClose} disabled={busy}>
              <Text style={styles.ghostText}>Huỷ</Text>
            </Pressable>
            <Pressable style={[styles.primary, !canCreate && styles.dim]} onPress={create} disabled={!canCreate}>
              {busy ? <ActivityIndicator color={colors.onAccent} /> : <Text style={styles.primaryText}>Tạo vòng quay</Text>}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'center', padding: 24 },
  dialog: {
    backgroundColor: colors.bg,
    borderRadius: 24,
    padding: 18,
    gap: 10,
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
  },
  heading: { color: colors.text, fontSize: 18, fontWeight: '800' },
  hint: { color: colors.textMuted, fontSize: 13, lineHeight: 18 },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 48,
    fontSize: 16,
  },
  label: { color: colors.text, fontWeight: '700', fontSize: 14, marginTop: 4 },
  peopleScroll: { maxHeight: 180 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.pill,
  },
  chipOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { color: colors.text, fontWeight: '600', fontSize: 14 },
  chipTextOn: { color: colors.onAccent },
  warn: { color: colors.caramel, fontSize: 13, fontWeight: '600' },
  error: { color: colors.danger, fontSize: 14, fontWeight: '600' },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 6 },
  ghost: { paddingHorizontal: 16, height: 44, justifyContent: 'center' },
  ghostText: { color: colors.textMuted, fontWeight: '700' },
  primary: {
    paddingHorizontal: 20,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: { color: colors.onAccent, fontWeight: '800', fontSize: 15 },
  dim: { opacity: 0.55 },
});
