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

import { colors, radius } from '@/constants/theme';
import { MAX_AMOUNT, formatMoney, parseAmount } from '@/lib/money';
import type { BillItem, BillItemInput } from '@/services/chatService';

export type BillPerson = { id: string; display_name: string };

type Props = {
  /** Thành viên cuộc trò chuyện (chọn nhanh tên người ăn) */
  people: BillPerson[];
  /** Có → đang sửa dòng này; không → thêm dòng mới */
  item?: BillItem;
  onClose: () => void;
  onSave: (input: BillItemInput) => Promise<void>;
  onDelete?: () => Promise<void>;
};

/** Thêm / sửa 1 dòng: tên người ăn, số tiền, tên món (không bắt buộc) */
export function BillItemSheet({ people, item, onClose, onSave, onDelete }: Props) {
  const insets = useSafeAreaInsets();
  const [userId, setUserId] = useState<string | null>(item?.user_id ?? null);
  const [name, setName] = useState(item?.person_name ?? '');
  const [amountText, setAmountText] = useState(item ? String(item.amount) : '');
  const [dish, setDish] = useState(item?.item_name ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amount = parseAmount(amountText);
  const amountInvalid = amountText.trim().length > 0 && (amount === null || amount > MAX_AMOUNT);

  const pickPerson = (p: BillPerson) => {
    // Bấm lại người đang chọn → bỏ chọn
    if (userId === p.id) {
      setUserId(null);
      return;
    }
    setUserId(p.id);
    setName(p.display_name);
  };

  const save = async () => {
    setError(null);
    if (!name.trim()) return setError('Nhập tên người ăn.');
    if (amount === null || amount > MAX_AMOUNT) return setError('Số tiền chưa hợp lệ (vd: 50000, 50k, 1.5tr).');
    setBusy(true);
    try {
      await onSave({
        person_name: name.trim(),
        user_id: userId,
        amount,
        item_name: dish.trim() || null,
      });
      onClose();
    } catch (e: any) {
      setError(e?.message ?? String(e));
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!onDelete) return;
    setBusy(true);
    try {
      await onDelete();
      onClose();
    } catch (e: any) {
      setError(e?.message ?? String(e));
      setBusy(false);
    }
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.backdrop} behavior="padding">
        <Pressable style={styles.flex} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.handle} />
          <Text style={styles.title}>{item ? 'Sửa dòng' : 'Thêm dòng'}</Text>

          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            <Text style={styles.label}>Người ăn</Text>
            {people.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                {people.map((p) => {
                  const on = userId === p.id;
                  return (
                    <Pressable key={p.id} style={[styles.chip, on && styles.chipOn]} onPress={() => pickPerson(p)}>
                      <Text style={[styles.chipText, on && styles.chipTextOn]}>{p.display_name}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={(t) => {
                setName(t);
                // Gõ tay khác với tên đã chọn → coi là người ngoài app
                const picked = people.find((p) => p.id === userId);
                if (picked && picked.display_name !== t) setUserId(null);
              }}
              placeholder="Tên người ăn (gõ tên nếu không có trong chat)"
              placeholderTextColor={colors.textMuted}
              maxLength={40}
            />

            <Text style={styles.label}>Số tiền</Text>
            <TextInput
              style={[styles.input, amountInvalid && styles.inputError]}
              value={amountText}
              onChangeText={setAmountText}
              placeholder="vd: 50000, 50k, 1.5tr"
              placeholderTextColor={colors.textMuted}
              keyboardType="numbers-and-punctuation"
              maxLength={14}
            />
            {amount !== null && amount <= MAX_AMOUNT && <Text style={styles.hint}>= {formatMoney(amount)}</Text>}

            <Text style={styles.label}>Tên món (không bắt buộc)</Text>
            <TextInput
              style={styles.input}
              value={dish}
              onChangeText={setDish}
              placeholder="vd: Bún bò đặc biệt"
              placeholderTextColor={colors.textMuted}
              maxLength={60}
            />

            {error && <Text style={styles.error}>{error}</Text>}
          </ScrollView>

          <View style={styles.actions}>
            {onDelete && (
              <Pressable style={styles.deleteBtn} onPress={remove} disabled={busy}>
                <Text style={styles.deleteText}>Xoá dòng</Text>
              </Pressable>
            )}
            <View style={styles.flex} />
            <Pressable style={styles.ghost} onPress={onClose} disabled={busy}>
              <Text style={styles.ghostText}>Huỷ</Text>
            </Pressable>
            <Pressable style={[styles.save, busy && styles.dim]} onPress={save} disabled={busy}>
              {busy ? <ActivityIndicator color={colors.onAccent} /> : <Text style={styles.saveText}>Lưu</Text>}
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
    maxHeight: '88%',
    gap: 10,
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
  },
  handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: colors.border },
  title: { color: colors.text, fontSize: 18, fontWeight: '800' },
  body: { gap: 8, paddingBottom: 8 },
  label: { color: colors.text, fontWeight: '700', fontSize: 14, marginTop: 4 },
  chips: { gap: 6 },
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
  inputError: { borderColor: colors.danger },
  hint: { color: colors.accent, fontWeight: '700', fontSize: 13 },
  error: { color: colors.danger, fontSize: 14 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  deleteBtn: { height: 46, justifyContent: 'center', paddingHorizontal: 6 },
  deleteText: { color: colors.danger, fontWeight: '800', fontSize: 15 },
  ghost: { paddingHorizontal: 16, height: 46, justifyContent: 'center' },
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
