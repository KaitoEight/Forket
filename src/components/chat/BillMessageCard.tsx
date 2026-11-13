import Ionicons from '@expo/vector-icons/Ionicons';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius } from '@/constants/theme';
import { formatMoney } from '@/lib/money';
import type { BillItem } from '@/services/chatService';

type Props = {
  title: string | null;
  items: BillItem[];
  mine: boolean;
  meId: string | undefined;
  /** Người tạo bảng: sửa mọi dòng, đổi tên bảng, tick đã trả cho mọi dòng */
  isBillOwner: boolean;
  onAdd: () => void;
  onEdit: (item: BillItem) => void;
  onTogglePaid: (item: BillItem) => void;
  onRename: () => void;
};

/** Bảng tính tiền trong chat: Người ăn · Món · Số tiền, tick đã trả, dòng cuối là tổng cộng */
export function BillMessageCard({
  title,
  items,
  mine,
  meId,
  isBillOwner,
  onAdd,
  onEdit,
  onTogglePaid,
  onRename,
}: Props) {
  const total = items.reduce((sum, i) => sum + i.amount, 0);
  const paidTotal = items.reduce((sum, i) => sum + (i.paid ? i.amount : 0), 0);
  const anyPaid = items.some((i) => i.paid);

  // Mỗi người trả bao nhiêu (gộp các dòng cùng 1 người) — chỉ hiện khi có người ăn nhiều dòng
  const perPerson = useMemo(() => {
    const map = new Map<string, { name: string; amount: number; rows: number }>();
    for (const i of items) {
      const key = i.user_id ?? `n:${i.person_name.trim().toLowerCase()}`;
      const cur = map.get(key) ?? { name: i.person_name, amount: 0, rows: 0 };
      cur.amount += i.amount;
      cur.rows += 1;
      map.set(key, cur);
    }
    return [...map.entries()].map(([key, v]) => ({ key, ...v }));
  }, [items]);
  const showPerPerson = perPerson.some((p) => p.rows > 1);

  return (
    <View style={[styles.card, mine ? styles.cardMine : styles.cardTheirs]}>
      <Pressable
        style={styles.head}
        onPress={onRename}
        disabled={!isBillOwner}
        accessibilityLabel={isBillOwner ? 'Đổi tên bảng' : undefined}
      >
        <Ionicons name="receipt" size={16} color={colors.onAccent} />
        <Text style={styles.headTitle} numberOfLines={1}>
          {title || 'Tính tiền'}
        </Text>
        {isBillOwner ? (
          <Ionicons name="create-outline" size={16} color={colors.accentSoft} />
        ) : (
          <Text style={styles.headCount}>{items.length} dòng</Text>
        )}
      </Pressable>

      <View style={styles.tableHead}>
        <View style={styles.checkSpacer} />
        <Text style={[styles.th, styles.colPerson]}>Người ăn</Text>
        <Text style={[styles.th, styles.colAmount]}>Số tiền</Text>
      </View>

      {items.length === 0 ? (
        <Text style={styles.empty}>Chưa có dòng nào. Bấm “Thêm dòng” để ghi.</Text>
      ) : (
        items.map((item, i) => {
          const canEdit = isBillOwner || item.created_by === meId;
          const canPay = canEdit || item.user_id === meId;
          return (
            <View key={item.id} style={[styles.row, i % 2 === 1 && styles.rowAlt, item.paid && styles.rowPaid]}>
              <Pressable
                style={styles.check}
                hitSlop={6}
                onPress={() => onTogglePaid(item)}
                disabled={!canPay}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: item.paid, disabled: !canPay }}
                accessibilityLabel={`${item.person_name}: ${item.paid ? 'đã trả' : 'chưa trả'}`}
              >
                <Ionicons
                  name={item.paid ? 'checkmark-circle' : 'ellipse-outline'}
                  size={24}
                  color={item.paid ? colors.fresh : canPay ? colors.textMuted : colors.border}
                />
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.rowMain, pressed && canEdit && styles.rowPressed]}
                onPress={() => onEdit(item)}
                disabled={!canEdit}
                accessibilityLabel={`${item.person_name} ${formatMoney(item.amount)}`}
              >
                <View style={styles.colPerson}>
                  <Text style={[styles.person, item.paid && styles.textPaid]} numberOfLines={1}>
                    {item.person_name}
                  </Text>
                  {!!item.item_name && (
                    <Text style={styles.dish} numberOfLines={1}>
                      {item.item_name}
                    </Text>
                  )}
                </View>
                <Text style={[styles.amount, styles.colAmount, item.paid && styles.amountPaid]}>
                  {formatMoney(item.amount)}
                </Text>
              </Pressable>
            </View>
          );
        })
      )}

      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>Tổng cộng</Text>
        <Text style={styles.totalValue}>{formatMoney(total)}</Text>
      </View>

      {anyPaid && (
        <View style={styles.paidSummary}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Đã trả</Text>
            <Text style={[styles.summaryValue, { color: colors.fresh }]}>{formatMoney(paidTotal)}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>{total - paidTotal > 0 ? 'Còn lại' : 'Đã trả đủ'}</Text>
            <Text style={[styles.summaryValue, total - paidTotal > 0 ? { color: colors.danger } : { color: colors.fresh }]}>
              {total - paidTotal > 0 ? formatMoney(total - paidTotal) : '✓'}
            </Text>
          </View>
        </View>
      )}

      {showPerPerson && (
        <View style={styles.perPerson}>
          <Text style={styles.perTitle}>Mỗi người</Text>
          {perPerson.map((p) => (
            <View key={p.key} style={styles.perRow}>
              <Text style={styles.perName} numberOfLines={1}>
                {p.name}
              </Text>
              <Text style={styles.perAmount}>{formatMoney(p.amount)}</Text>
            </View>
          ))}
        </View>
      )}

      <Pressable style={({ pressed }) => [styles.add, pressed && styles.rowPressed]} onPress={onAdd}>
        <Ionicons name="add-circle" size={18} color={colors.accent} />
        <Text style={styles.addText}>Thêm dòng</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 300,
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: 1,
    backgroundColor: colors.surface,
  },
  cardMine: { borderColor: colors.accent },
  cardTheirs: { borderColor: colors.border },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.accent,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  headTitle: { flex: 1, color: colors.onAccent, fontWeight: '800', fontSize: 14 },
  headCount: { color: colors.accentSoft, fontSize: 12, fontWeight: '700' },
  tableHead: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: colors.surfaceHigh,
  },
  checkSpacer: { width: 32 },
  th: { color: colors.textMuted, fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  colPerson: { flex: 1 },
  colAmount: { minWidth: 92, textAlign: 'right' },
  row: { flexDirection: 'row', alignItems: 'center', paddingLeft: 12 },
  rowAlt: { backgroundColor: colors.bg },
  rowPaid: { opacity: 0.85 },
  check: { width: 32, height: 44, justifyContent: 'center' },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingRight: 12, paddingVertical: 9 },
  rowPressed: { backgroundColor: colors.accentSoft },
  person: { color: colors.text, fontWeight: '700', fontSize: 14 },
  textPaid: { color: colors.textMuted, textDecorationLine: 'line-through' },
  dish: { color: colors.textMuted, fontSize: 12, marginTop: 1 },
  amount: { color: colors.text, fontWeight: '800', fontSize: 14 },
  amountPaid: { color: colors.fresh },
  empty: { color: colors.textMuted, fontSize: 13, textAlign: 'center', padding: 16 },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 2,
    borderTopColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  totalLabel: { color: colors.accent, fontWeight: '800', fontSize: 14 },
  totalValue: { color: colors.accent, fontWeight: '900', fontSize: 17 },
  paidSummary: { paddingHorizontal: 12, paddingVertical: 8, gap: 3, backgroundColor: colors.surface },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between' },
  summaryLabel: { color: colors.textMuted, fontSize: 13, fontWeight: '700' },
  summaryValue: { fontSize: 14, fontWeight: '900' },
  perPerson: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  perTitle: { color: colors.textMuted, fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  perRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  perName: { flex: 1, color: colors.text, fontSize: 13 },
  perAmount: { color: colors.brown, fontWeight: '800', fontSize: 13 },
  add: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    borderRadius: radius.pill,
  },
  addText: { color: colors.accent, fontWeight: '800', fontSize: 14 },
});
