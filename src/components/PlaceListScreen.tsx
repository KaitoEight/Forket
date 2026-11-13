import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenHeader } from '@/components/SettingsUI';
import { tagLabel } from '@/constants/placeTags';
import { colors, statusBarStyle } from '@/constants/theme';
import { fetchPlacesByIds, type MapPlace } from '@/services/placeService';

type Props = {
  title: string;
  /** Id các quán trong danh sách (từ kho cập nhật tức thì) */
  ids: ReadonlySet<string>;
  emptyIcon: React.ComponentProps<typeof Ionicons>['name'];
  emptyText: string;
  /** Nút bên phải mỗi dòng (bỏ quán khỏi danh sách) */
  renderAction: (placeId: string) => React.ReactNode;
};

/** Màn danh sách quán của tôi: bấm một quán → mở trên bản đồ */
export function PlaceListScreen({ title, ids, emptyIcon, emptyText, renderAction }: Props) {
  const insets = useSafeAreaInsets();
  const [places, setPlaces] = useState<Map<string, MapPlace>>(new Map());
  const [loading, setLoading] = useState(true);
  const idList = [...ids];

  // Tải thông tin các quán chưa có (mỗi lần mở màn)
  const missingKey = idList.filter((id) => !places.has(id)).join(',');
  useFocusEffect(
    useCallback(() => {
      let active = true;
      const missing = missingKey ? missingKey.split(',') : [];
      if (missing.length === 0) {
        setLoading(false);
        return;
      }
      fetchPlacesByIds(missing)
        .then((list) => {
          if (!active) return;
          setPlaces((prev) => {
            const next = new Map(prev);
            for (const p of list) next.set(p.id, p);
            return next;
          });
        })
        .catch((e) => console.warn(`Không tải được danh sách "${title}":`, e))
        .finally(() => active && setLoading(false));
      return () => {
        active = false;
      };
    }, [missingKey, title])
  );

  const rows = idList.map((id) => places.get(id)).filter((p): p is MapPlace => !!p);

  const open = (p: MapPlace) =>
    router.navigate({ pathname: '/', params: { focusPlace: p.id, lat: String(p.lat), lng: String(p.lng) } });

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <StatusBar style={statusBarStyle} />
      <ScreenHeader title={title} />
      {loading && rows.length === 0 && idList.length > 0 ? (
        <ActivityIndicator color={colors.accent} style={styles.loader} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(p) => p.id}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 24 }]}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name={emptyIcon} size={40} color={colors.textMuted} />
              <Text style={styles.emptyTitle}>Chưa có quán nào</Text>
              <Text style={styles.emptyText}>{emptyText}</Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable style={({ pressed }) => [styles.row, pressed && styles.pressed]} onPress={() => open(item)}>
              <View style={styles.thumb}>
                {item.cover_url ? (
                  <Image source={{ uri: item.cover_url }} style={StyleSheet.absoluteFill} contentFit="cover" />
                ) : (
                  <Ionicons name="restaurant" size={20} color={colors.caramel} />
                )}
              </View>
              <View style={styles.flex}>
                <Text style={styles.name} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={styles.sub} numberOfLines={1}>
                  {[
                    item.avg_rating != null ? `★ ${item.avg_rating.toFixed(1)}` : null,
                    item.tags.slice(0, 2).map(tagLabel).join(' · ') || null,
                    item.address,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </View>
              {renderAction(item.id)}
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: colors.bg },
  loader: { marginTop: 40 },
  list: { paddingHorizontal: 16, gap: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderRadius: 14 },
  pressed: { backgroundColor: colors.surface },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: colors.caramelSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { color: colors.text, fontWeight: '800', fontSize: 16 },
  sub: { color: colors.textMuted, fontSize: 13, marginTop: 2 },
  empty: { alignItems: 'center', gap: 8, paddingTop: 80, paddingHorizontal: 32 },
  emptyTitle: { color: colors.text, fontWeight: '800', fontSize: 17 },
  emptyText: { color: colors.textMuted, fontSize: 14, textAlign: 'center', lineHeight: 20 },
});
