import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { Easing, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Wheel } from '@/components/chat/Wheel';
import { colors, radius } from '@/constants/theme';
import {
  WHEEL_MODES,
  addWheelEntry,
  deleteWheelEntry,
  spinWheel,
  startWheel,
  wheelLabelKey,
  type WheelEntry,
  type WheelGame,
} from '@/services/wheelService';

/** Mỗi người thêm tối đa chừng này món (server cũng chặn) */
const MAX_PER_PERSON = 5;

/** Thời gian vòng quay chạy; server chặn quay chồng lên nhau trong 5 giây */
const SPIN_MS = 4000;

type Person = { display_name: string };

/** Góc (độ, chiều kim đồng hồ) cần xoay để tâm ô `index` nằm đúng dưới kim ở đỉnh */
function angleFor(index: number, n: number, jitter = 0) {
  const step = 360 / n;
  return (((360 - (index + 0.5) * step + jitter) % 360) + 360) % 360;
}

/** Mở lại vòng đã quay xong (quay 1 lần / trả tiền) → để sẵn ô thắng dưới kim */
function restingRotation(game: WheelGame, entries: WheelEntry[]) {
  if (game.status !== 'done' || game.mode === 'food_elim' || !game.winner_entry) return 0;
  const index = entries.findIndex((e) => e.id === game.winner_entry);
  return index >= 0 ? angleFor(index, entries.length) : 0;
}

type Anim = { segs: WheelEntry[]; index: number; key: number; resetAfter: boolean };

type Props = {
  game: WheelGame;
  entries: WheelEntry[];
  title: string;
  meId: string | undefined;
  /** Là trưởng nhóm → xoá được món của mọi người */
  canManage: boolean;
  people: Map<string, Person>;
  onClose: () => void;
  /** Tải lại dữ liệu vòng quay sau khi mình thay đổi */
  onChanged: () => Promise<void>;
};

/** Vòng quay toàn màn hình: gom món, bắt đầu, quay, xem kết quả. Mọi máy cùng chạy animation theo kết quả của server. */
export function WheelSheet({ game, entries, title, meId, canManage, people, onClose, onChanged }: Props) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const size = Math.min(width - 48, 300);
  const mode = WHEEL_MODES[game.mode];
  const isFood = game.mode !== 'pay';

  const myCount = entries.filter((e) => e.user_id === meId).length;
  const [dish, setDish] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rotation = useSharedValue(restingRotation(game, entries));

  // Có lượt quay mới (của mình hoặc của người khác) → chạy animation tới đúng ô server đã chọn.
  // Chỉnh state ngay lúc render vì phụ thuộc vào props (cách React khuyên dùng).
  const [seen, setSeen] = useState(game.spin_count);
  const [anim, setAnim] = useState<Anim | null>(null);
  if (game.spin_count !== seen) {
    setSeen(game.spin_count);
    if (game.spin_count > seen && game.last_picked) {
      // Các ô trước lượt quay = ô còn lại + ô vừa trúng (nếu bị loại)
      const segs = entries.filter((e) => e.eliminated_order == null || e.id === game.last_picked);
      const index = segs.findIndex((e) => e.id === game.last_picked);
      if (index >= 0) setAnim({ segs, index, key: game.spin_count, resetAfter: game.mode === 'food_elim' });
    }
  }

  useEffect(() => {
    if (!anim) return;
    const n = anim.segs.length;
    const jitter = (Math.random() - 0.5) * (360 / n) * 0.6;
    rotation.value = 0;
    rotation.value = withTiming(5 * 360 + angleFor(anim.index, n, jitter), {
      duration: SPIN_MS,
      easing: Easing.out(Easing.cubic),
    });
    const t = setTimeout(() => {
      // Chế độ loại dần: ô vừa trúng biến mất nên đặt lại góc; chế độ khác giữ nguyên để ô thắng nằm dưới kim
      if (anim.resetAfter) rotation.value = 0;
      setAnim(null);
    }, SPIN_MS + 250);
    return () => clearTimeout(t);
  }, [anim, rotation]);

  const spinning = !!anim;
  const active = entries.filter((e) => e.eliminated_order == null);
  const segments = (anim ? anim.segs : active).map((e) => ({ id: e.id, label: e.label }));
  const eliminated = entries.filter((e) => e.eliminated_order != null).sort((a, b) => a.eliminated_order! - b.eliminated_order!);
  const winner = game.winner_entry ? entries.find((e) => e.id === game.winner_entry) : undefined;
  const lastOut = !game.winner_entry && game.last_picked ? entries.find((e) => e.id === game.last_picked) : undefined;
  const isCreator = game.created_by === meId;
  const creatorName = people.get(game.created_by)?.display_name ?? 'người tạo';

  const run = async (fn: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await fn();
      await onChanged();
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  const addDish = async () => {
    const label = dish.trim();
    if (!label || busy) return;
    // Báo trùng ngay trên máy (bỏ dấu, hoa thường); server vẫn kiểm lại
    if (entries.some((e) => wheelLabelKey(e.label) === wheelLabelKey(label))) {
      setError(`Món “${label}” đã có trong vòng quay rồi.`);
      return;
    }
    if (myCount >= MAX_PER_PERSON) {
      setError(`Mỗi người thêm tối đa ${MAX_PER_PERSON} món.`);
      return;
    }
    await run(async () => {
      await addWheelEntry(game.id, label);
      setDish('');
    });
  };

  const canDelete = (e: WheelEntry) =>
    game.status === 'collecting' && (e.user_id === meId || canManage || isCreator);
  const dropEntry = (e: WheelEntry) => run(() => deleteWheelEntry(e.id));

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.backdrop} behavior="padding">
        <Pressable style={styles.flex} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.handle} />
          <View style={styles.head}>
            <Ionicons name={mode.icon} size={20} color={colors.accent} />
            <Text style={styles.title} numberOfLines={2}>
              {title}
            </Text>
            <Pressable onPress={onClose} accessibilityLabel="Đóng" hitSlop={10}>
              <Ionicons name="close" size={24} color={colors.textMuted} />
            </Pressable>
          </View>
          <Text style={styles.hint}>{mode.label} · {mode.hint}</Text>

          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={styles.wheelWrap}>
              <Wheel segments={segments} rotation={rotation} size={size} />
            </View>

            {/* Kết quả */}
            {!spinning && game.status === 'done' && winner && (
              <View style={styles.result}>
                <Text style={styles.resultEmoji}>{isFood ? '🍽️' : '🎉'}</Text>
                <Text style={styles.resultText}>
                  {isFood ? `Món được chọn: ${winner.label}` : `${winner.label} là người được chọn!`}
                </Text>
                {isFood && !!winner.user_id && (
                  <Text style={styles.resultSub}>món của {winner.user_id === meId ? 'bạn' : (people.get(winner.user_id)?.display_name ?? 'một người bạn')}</Text>
                )}
              </View>
            )}
            {!spinning && game.status === 'ready' && lastOut && (
              <View style={[styles.result, styles.resultOut]}>
                <Text style={styles.resultText}>❌ Loại: {lastOut.label}</Text>
                <Text style={styles.resultSub}>còn {active.length} món</Text>
              </View>
            )}

            {/* Gom món */}
            {isFood && game.status === 'collecting' && (
              <View style={styles.section}>
                <Text style={styles.label}>
                  Thêm món ({myCount}/{MAX_PER_PERSON} món của bạn)
                </Text>
                <View style={styles.inputRow}>
                  <TextInput
                    style={styles.input}
                    value={dish}
                    onChangeText={(t) => {
                      setDish(t);
                      setError(null);
                    }}
                    placeholder="vd: Bún bò Huế"
                    placeholderTextColor={colors.textMuted}
                    maxLength={40}
                    returnKeyType="done"
                    blurOnSubmit={false}
                    onSubmitEditing={addDish}
                  />
                  <Pressable
                    style={[styles.addBtn, (!dish.trim() || busy) && styles.dim]}
                    onPress={addDish}
                    disabled={busy || !dish.trim()}
                  >
                    <Text style={styles.addText}>Thêm</Text>
                  </Pressable>
                </View>
              </View>
            )}

            {/* Các ô */}
            {entries.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.label}>{game.mode === 'pay' ? 'Người tham gia' : 'Các món'} ({entries.length})</Text>
                <View style={styles.chips}>
                  {entries.map((e) => {
                    const out = e.eliminated_order != null;
                    const by = isFood && e.user_id ? (e.user_id === meId ? 'bạn' : people.get(e.user_id)?.display_name) : null;
                    return (
                      <View key={e.id} style={[styles.chip, out && styles.chipOut, e.id === game.winner_entry && styles.chipWin]}>
                        <Text style={[styles.chipText, out && styles.chipTextOut, styles.chipLabel]} numberOfLines={1}>
                          {e.label}
                          {by ? ` · ${by}` : ''}
                        </Text>
                        {canDelete(e) && (
                          <Pressable
                            onPress={() => dropEntry(e)}
                            disabled={busy}
                            hitSlop={8}
                            accessibilityLabel={`Xoá ${e.label}`}
                          >
                            <Ionicons name="close-circle" size={17} color={colors.textMuted} />
                          </Pressable>
                        )}
                      </View>
                    );
                  })}
                </View>
                {eliminated.length > 0 && (
                  <Text style={styles.sub}>Đã loại: {eliminated.map((e) => e.label).join(' → ')}</Text>
                )}
              </View>
            )}

            {!!error && <Text style={styles.error}>{error}</Text>}
          </ScrollView>

          {/* Nút hành động */}
          {game.status === 'collecting' &&
            (isCreator ? (
              <Pressable
                style={[styles.primary, (entries.length < 2 || busy) && styles.dim]}
                onPress={() => run(() => startWheel(game.id))}
                disabled={entries.length < 2 || busy}
              >
                {busy ? (
                  <ActivityIndicator color={colors.onAccent} />
                ) : (
                  <Text style={styles.primaryText}>
                    {entries.length < 2 ? 'Cần ít nhất 2 món để bắt đầu' : `Bắt đầu quay (${entries.length} món)`}
                  </Text>
                )}
              </Pressable>
            ) : (
              <Text style={styles.wait}>Chờ {creatorName} bấm “Bắt đầu quay”…</Text>
            ))}

          {game.status === 'ready' && (
            <Pressable
              style={[styles.primary, (busy || spinning) && styles.dim]}
              onPress={() => run(() => spinWheel(game.id))}
              disabled={busy || spinning}
            >
              {busy || spinning ? (
                <ActivityIndicator color={colors.onAccent} />
              ) : (
                <Text style={styles.primaryText}>🎡 Quay!</Text>
              )}
            </Pressable>
          )}

          {game.status === 'done' && (
            <Pressable style={[styles.primary, styles.ghostBtn]} onPress={onClose}>
              <Text style={styles.ghostText}>Đóng</Text>
            </Pressable>
          )}
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
    maxHeight: '92%',
    gap: 8,
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
  },
  handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: colors.border },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { flex: 1, color: colors.text, fontSize: 19, fontWeight: '800' },
  hint: { color: colors.textMuted, fontSize: 13, lineHeight: 18 },
  body: { gap: 14, paddingVertical: 8 },
  wheelWrap: { alignItems: 'center' },
  result: {
    alignItems: 'center',
    gap: 2,
    backgroundColor: colors.accentSoft,
    borderRadius: 20,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  resultOut: { backgroundColor: colors.caramelSoft },
  resultEmoji: { fontSize: 30 },
  resultText: { color: colors.text, fontSize: 20, fontWeight: '900', textAlign: 'center' },
  resultSub: { color: colors.textMuted, fontSize: 13 },
  section: { gap: 8 },
  label: { color: colors.text, fontWeight: '700', fontSize: 14 },
  inputRow: { flexDirection: 'row', gap: 8 },
  input: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 48,
    fontSize: 16,
  },
  addBtn: {
    paddingHorizontal: 18,
    height: 48,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addText: { color: colors.onAccent, fontWeight: '800', fontSize: 15 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chipLabel: { flexShrink: 1 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: '100%',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  chipOut: { backgroundColor: colors.surfaceHigh, opacity: 0.6 },
  chipWin: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  chipText: { color: colors.text, fontWeight: '600', fontSize: 14 },
  chipTextOut: { textDecorationLine: 'line-through', color: colors.textMuted },
  sub: { color: colors.textMuted, fontSize: 13 },
  error: { color: colors.danger, fontSize: 14, fontWeight: '600' },
  primary: {
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: { color: colors.onAccent, fontWeight: '800', fontSize: 17 },
  ghostBtn: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  ghostText: { color: colors.text, fontWeight: '800', fontSize: 16 },
  wait: { color: colors.textMuted, textAlign: 'center', fontSize: 14, paddingVertical: 14 },
  dim: { opacity: 0.55 },
});
