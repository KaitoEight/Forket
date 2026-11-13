import Ionicons from '@expo/vector-icons/Ionicons';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenHeader } from '@/components/SettingsUI';
import { tagLabel } from '@/constants/placeTags';
import { colors, radius, statusBarStyle } from '@/constants/theme';
import { appAlert } from '@/lib/appAlert';
import { formatMoney } from '@/lib/money';
import { buildWrapped, fetchYearPosts, type Wrapped } from '@/services/wrappedService';

/** "Forket Wrapped": tổng kết năm ăn uống của tôi */
export default function WrappedScreen() {
  const insets = useSafeAreaInsets();
  const year = new Date().getFullYear();
  const [data, setData] = useState<Wrapped | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetchYearPosts(year)
      .then((posts) => active && setData(buildWrapped(year, posts)))
      .catch((e) => active && setError(e?.message ?? String(e)));
    return () => {
      active = false;
    };
  }, [year]);

  const summary = useMemo(() => (data ? summaryText(data) : ''), [data]);

  const share = async () => {
    try {
      await Share.share({ message: summary });
    } catch (e: any) {
      appAlert('Không chia sẻ được', e?.message ?? String(e));
    }
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <StatusBar style={statusBarStyle} />
      <ScreenHeader title={`Tổng kết ${year}`} />
      {error ? (
        <Text style={styles.empty}>{error}</Text>
      ) : !data ? (
        <ActivityIndicator color={colors.accent} style={styles.loader} />
      ) : data.checkIns === 0 ? (
        <Text style={styles.empty}>Năm nay bạn chưa check-in món nào. Chụp món đầu tiên để có tổng kết nhé!</Text>
      ) : (
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}>
          <View style={styles.hero}>
            <Text style={styles.heroLabel}>Năm {year} của bạn</Text>
            <Text style={styles.heroNumber}>{data.checkIns}</Text>
            <Text style={styles.heroSub}>
              lần check-in tại {data.places} quán khác nhau
            </Text>
          </View>

          {data.topPlaces.length > 0 && (
            <Card title="Quán bạn ghé nhiều nhất">
              {data.topPlaces.map((p, i) => (
                <View key={p.id} style={styles.rankRow}>
                  <Text style={styles.rank}>{i + 1}</Text>
                  <Text style={styles.rankName} numberOfLines={1}>
                    {p.name}
                  </Text>
                  <Text style={styles.rankCount}>{p.visits} lần</Text>
                </View>
              ))}
            </Card>
          )}

          <View style={styles.pair}>
            {data.busiestMonth && (
              <Mini icon="calendar" label="Tháng ăn nhiều nhất" value={`Tháng ${data.busiestMonth.month}`} sub={`${data.busiestMonth.count} lần`} />
            )}
            {data.tagCounts[0] && (
              <Mini icon="restaurant" label="Gu của bạn" value={tagLabel(data.tagCounts[0].tag)} sub={`${data.tagCounts[0].count} lần`} />
            )}
          </View>

          {data.topDish && (
            <Card title="Món bạn ăn nhiều nhất">
              <Text style={styles.big}>{data.topDish.name}</Text>
              <Text style={styles.muted}>{data.topDish.count} lần</Text>
            </Card>
          )}

          {data.totalSpent > 0 && (
            <Card title="Đã chi cho các bữa có ghi giá">
              <Text style={styles.big}>{formatMoney(data.totalSpent)}</Text>
              <Text style={styles.muted}>
                qua {data.spentCount} bữa · trung bình {formatMoney(Math.round(data.totalSpent / data.spentCount))}/bữa
              </Text>
            </Card>
          )}

          <Pressable style={({ pressed }) => [styles.shareBtn, pressed && styles.pressed]} onPress={share}>
            <Ionicons name="share-outline" size={18} color={colors.onAccent} />
            <Text style={styles.shareText}>Chia sẻ tổng kết</Text>
          </Pressable>
        </ScrollView>
      )}
    </View>
  );
}

function summaryText(w: Wrapped) {
  const lines = [`🍽️ Forket ${w.year} của mình: ${w.checkIns} lần check-in tại ${w.places} quán.`];
  if (w.topPlaces[0]) lines.push(`📍 Quán ghé nhiều nhất: ${w.topPlaces[0].name} (${w.topPlaces[0].visits} lần).`);
  if (w.topDish) lines.push(`🍜 Món ăn nhiều nhất: ${w.topDish.name} (${w.topDish.count} lần).`);
  if (w.busiestMonth) lines.push(`📅 Tháng ăn nhiều nhất: tháng ${w.busiestMonth.month}.`);
  return lines.join('\n');
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Mini({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <View style={[styles.card, styles.mini]}>
      <Ionicons name={icon} size={18} color={colors.caramel} />
      <Text style={styles.cardTitle}>{label}</Text>
      <Text style={styles.miniValue} numberOfLines={2}>
        {value}
      </Text>
      <Text style={styles.muted}>{sub}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  loader: { marginTop: 40 },
  empty: { color: colors.textMuted, fontSize: 15, textAlign: 'center', marginTop: 60, paddingHorizontal: 32, lineHeight: 22 },
  content: { padding: 16, gap: 12 },
  hero: {
    backgroundColor: colors.accent,
    borderRadius: 28,
    padding: 24,
    alignItems: 'center',
    gap: 2,
  },
  heroLabel: { color: colors.accentSoft, fontWeight: '700', fontSize: 14 },
  heroNumber: { color: colors.onAccent, fontWeight: '900', fontSize: 72, lineHeight: 80 },
  heroSub: { color: colors.accentSoft, fontSize: 15, textAlign: 'center' },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    gap: 6,
  },
  cardTitle: { color: colors.textMuted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  rankRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  rank: { color: colors.caramel, fontWeight: '900', fontSize: 20, width: 22 },
  rankName: { flex: 1, color: colors.text, fontWeight: '700', fontSize: 16 },
  rankCount: { color: colors.textMuted, fontWeight: '700', fontSize: 14 },
  pair: { flexDirection: 'row', gap: 12 },
  mini: { flex: 1 },
  miniValue: { color: colors.text, fontWeight: '900', fontSize: 20 },
  big: { color: colors.text, fontWeight: '900', fontSize: 24 },
  muted: { color: colors.textMuted, fontSize: 14 },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: colors.brown,
    marginTop: 4,
  },
  shareText: { color: colors.onAccent, fontWeight: '800', fontSize: 16 },
  pressed: { opacity: 0.85 },
});
