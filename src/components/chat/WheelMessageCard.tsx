import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius } from '@/constants/theme';
import { WHEEL_MODES, type WheelEntry, type WheelGame } from '@/services/wheelService';

type Props = {
  title: string | null;
  /** Chưa tải xong (hoặc server chưa có bảng) → undefined */
  game: WheelGame | undefined;
  entries: WheelEntry[];
  mine: boolean;
  meId: string | undefined;
  onOpen: () => void;
};

/** Thẻ minigame vòng quay trong chat — bấm để mở vòng quay */
export function WheelMessageCard({ title, game, entries, mine, meId, onOpen }: Props) {
  if (!game) {
    return (
      <View style={[styles.card, styles.cardTheirs, styles.gone]}>
        <Ionicons name="help-circle-outline" size={18} color={colors.textMuted} />
        <Text style={styles.muted}>Đang tải vòng quay…</Text>
      </View>
    );
  }

  const mode = WHEEL_MODES[game.mode];
  const active = entries.filter((e) => e.eliminated_order == null);
  const winner = game.winner_entry ? entries.find((e) => e.id === game.winner_entry) : undefined;
  const isFood = game.mode !== 'pay';
  const myEntry = entries.find((e) => e.user_id === meId);

  let status: string;
  let action: string;
  if (game.status === 'done' && winner) {
    status = isFood ? `🍽️ ${winner.label}` : `🎉 ${winner.label} trả tiền`;
    action = 'Xem vòng quay';
  } else if (game.status === 'ready') {
    status = game.mode === 'food_elim' ? `Còn ${active.length}/${entries.length} món` : `${entries.length} ${isFood ? 'món' : 'người'} đã sẵn sàng`;
    action = '🎡 Quay!';
  } else {
    status = entries.length === 0 ? 'Chưa ai thêm món' : `${entries.length} món đã thêm`;
    action = myEntry ? 'Xem / đổi món' : 'Thêm món của bạn';
  }

  return (
    <Pressable
      onPress={onOpen}
      style={({ pressed }) => [styles.card, mine ? styles.cardMine : styles.cardTheirs, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`${title ?? mode.label}. ${status}`}
    >
      <View style={styles.head}>
        <Ionicons name={mode.icon} size={14} color={colors.onAccent} />
        <Text style={styles.headText}>{mode.label}</Text>
      </View>
      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={2}>
          {title || mode.defaultTitle}
        </Text>
        <Text style={[styles.status, game.status === 'done' && styles.statusDone]} numberOfLines={2}>
          {status}
        </Text>
        {entries.length > 0 && game.status !== 'done' && (
          <View style={styles.chips}>
            {entries.slice(0, 6).map((e) => (
              <View key={e.id} style={[styles.chip, e.eliminated_order != null && styles.chipOut]}>
                <Text style={[styles.chipText, e.eliminated_order != null && styles.chipTextOut]} numberOfLines={1}>
                  {e.label}
                </Text>
              </View>
            ))}
            {entries.length > 6 && <Text style={styles.more}>+{entries.length - 6}</Text>}
          </View>
        )}
      </View>
      <View style={styles.footer}>
        <Text style={styles.footerText}>{action}</Text>
        <Ionicons name="chevron-forward" size={15} color={colors.accent} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 250,
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: 1,
    backgroundColor: colors.surface,
  },
  cardMine: { borderColor: colors.accent },
  cardTheirs: { borderColor: colors.border },
  gone: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 14 },
  muted: { color: colors.textMuted, fontSize: 13 },
  pressed: { opacity: 0.85 },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.accent,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  headText: { color: colors.onAccent, fontWeight: '800', fontSize: 13 },
  info: { padding: 12, gap: 4 },
  title: { color: colors.text, fontWeight: '800', fontSize: 17 },
  status: { color: colors.textMuted, fontSize: 14, fontWeight: '600' },
  statusDone: { color: colors.accent, fontWeight: '800', fontSize: 15 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  chip: {
    maxWidth: 110,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  chipOut: { opacity: 0.55 },
  chipText: { color: colors.text, fontSize: 12, fontWeight: '600' },
  chipTextOut: { textDecorationLine: 'line-through', color: colors.textMuted },
  more: { color: colors.textMuted, fontSize: 12, fontWeight: '700', alignSelf: 'center' },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  footerText: { color: colors.accent, fontWeight: '800', fontSize: 14 },
});
