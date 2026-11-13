import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  Vibration,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { tagLabel } from '@/constants/placeTags';
import { colors, radius } from '@/constants/theme';
import { fetchConversations } from '@/services/chatService';
import { fetchGroupMustTry, useMustTryIds } from '@/services/mustTryService';
import {
  distanceMeters,
  fetchPlacesByIds,
  fetchPlacesInView,
  formatDistance,
  getQuickPosition,
  type MapPlace,
} from '@/services/placeService';

type Pos = { latitude: number; longitude: number };
type Candidate = { place: MapPlace; badges: string[] };
type Group = { id: string; title: string };

const RADIUS_OPTIONS = [1, 3, 5];
const ROLL_MS = 1500;

type Sources = {
  pos: Pos | null;
  near: boolean;
  radiusKm: number;
  mine: boolean;
  mineIds: string[];
  groups: Group[];
};

/** Gom các quán từ những nguồn đã chọn (hợp, bỏ trùng); mỗi quán kèm lý do được chọn */
async function buildPool(src: Sources): Promise<Candidate[]> {
  const byId = new Map<string, Candidate>();
  const add = (p: MapPlace, badge: string) => {
    const cur = byId.get(p.id);
    if (cur) cur.badges.push(badge);
    else byId.set(p.id, { place: p, badges: [badge] });
  };

  if (src.near && src.pos) {
    const { latitude: lat, longitude: lng } = src.pos;
    const dLat = src.radiusKm / 111.32;
    const dLng = src.radiusKm / (111.32 * Math.max(Math.cos((lat * Math.PI) / 180), 0.01));
    const found = await fetchPlacesInView(
      { minLat: lat - dLat, maxLat: lat + dLat, minLng: lng - dLng, maxLng: lng + dLng },
      300
    );
    for (const p of found) {
      if (distanceMeters(lat, lng, p.lat, p.lng) <= src.radiusKm * 1000) add(p, `Trong ${src.radiusKm}km quanh bạn`);
    }
  }

  // Must try của tôi + của từng nhóm → tải thông tin quán một lần
  const groupHits: { group: Group; placeId: string; count: number }[] = [];
  if (src.groups.length > 0) {
    const results = await Promise.all(src.groups.map((g) => fetchGroupMustTry(g.id)));
    results.forEach((rows, i) => {
      for (const r of rows) groupHits.push({ group: src.groups[i], placeId: r.place_id, count: r.user_ids.length });
    });
  }
  const wanted = new Set<string>([...(src.mine ? src.mineIds : []), ...groupHits.map((h) => h.placeId)]);
  const loaded = new Map<string, MapPlace>();
  for (const id of wanted) {
    const known = byId.get(id);
    if (known) loaded.set(id, known.place);
  }
  const missing = [...wanted].filter((id) => !loaded.has(id));
  for (const p of await fetchPlacesByIds(missing)) loaded.set(p.id, p);

  if (src.mine) {
    for (const id of src.mineIds) {
      const p = loaded.get(id);
      if (p) add(p, '❤️ Must try của bạn');
    }
  }
  for (const h of groupHits) {
    const p = loaded.get(h.placeId);
    if (p) add(p, `❤️ ${h.count} người trong “${h.group.title}” muốn thử`);
  }
  return [...byId.values()];
}

type Props = {
  userPos: Pos | null;
  onClose: () => void;
  /** Xem quán trên bản đồ */
  onOpenPlace: (place: MapPlace) => void;
  onDirections: (place: MapPlace) => void;
  /** Rủ bạn đi quán này (mở màn gửi quán vào chat) */
  onInvite: (place: MapPlace) => void;
};

/** "Hôm nay ăn gì?": chọn ngẫu nhiên 1 quán trong bán kính quanh tôi, Must try của tôi và / hoặc Must try của các nhóm chat */
export function WhatToEatSheet({ userPos, onClose, onOpenPlace, onDirections, onInvite }: Props) {
  const insets = useSafeAreaInsets();
  const mustTry = useMustTryIds();
  const mineIds = [...mustTry];

  const [pos, setPos] = useState<Pos | null>(userPos);
  const [near, setNear] = useState(true);
  const [radiusKm, setRadiusKm] = useState(3);
  const [mine, setMine] = useState(false);
  const [groupList, setGroupList] = useState<Group[]>([]);
  const [groupIds, setGroupIds] = useState<Set<string>>(new Set());
  const [locating, setLocating] = useState(false);

  // Nguồn đã chọn → khoá để biết kết quả tải về còn đúng không (loading = kết quả chưa khớp khoá hiện tại)
  const groups = groupList.filter((g) => groupIds.has(g.id));
  const key = JSON.stringify([
    near && pos ? [pos.latitude.toFixed(3), pos.longitude.toFixed(3), radiusKm] : null,
    mine ? mineIds.sort() : null,
    groups.map((g) => g.id).sort(),
  ]);
  const [loaded, setLoaded] = useState<{ key: string; pool: Candidate[]; error: string | null } | null>(null);
  const loading = loaded?.key !== key;
  const pool = loaded?.key === key ? loaded.pool : [];
  const poolRef = useRef<Candidate[]>([]);

  // ---------- Quay ----------
  const [shown, setShown] = useState<Candidate | null>(null);
  const [rolling, setRolling] = useState(false);
  const timers = useRef<{ iv?: ReturnType<typeof setInterval>; to?: ReturnType<typeof setTimeout> }>({});
  const lastId = useRef<string | null>(null);
  const autoRoll = useRef(true); // lắc máy xong là ra quán luôn, không cần bấm thêm

  const startRoll = useCallback((list: Candidate[]) => {
    if (list.length === 0) return;
    clearInterval(timers.current.iv);
    clearTimeout(timers.current.to);
    setRolling(true);
    timers.current.iv = setInterval(() => setShown(list[Math.floor(Math.random() * list.length)]), 90);
    timers.current.to = setTimeout(() => {
      clearInterval(timers.current.iv);
      // Quay lại thì không trúng đúng quán vừa ra (nếu còn lựa chọn khác)
      const choices = list.length > 1 ? list.filter((c) => c.place.id !== lastId.current) : list;
      const final = choices[Math.floor(Math.random() * choices.length)];
      lastId.current = final.place.id;
      setShown(final);
      setRolling(false);
      try {
        Vibration.vibrate(40);
      } catch {
        // thiết bị không rung được → bỏ qua
      }
    }, ROLL_MS);
  }, []);

  useEffect(
    () => () => {
      clearInterval(timers.current.iv);
      clearTimeout(timers.current.to);
    },
    []
  );

  // Nhóm chat của tôi (để chọn Must try của nhóm)
  useEffect(() => {
    let active = true;
    fetchConversations()
      .then((list) => {
        if (!active) return;
        setGroupList(
          list.filter((c) => c.is_group && c.conversation_id).map((c) => ({ id: c.conversation_id!, title: c.title }))
        );
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  // Tải danh sách quán mỗi khi đổi nguồn
  useEffect(() => {
    let active = true;
    const src: Sources = { pos, near, radiusKm, mine, mineIds: [...mustTry], groups: groupList.filter((g) => groupIds.has(g.id)) };
    buildPool(src)
      .then((list) => {
        if (!active) return;
        poolRef.current = list;
        setLoaded({ key, pool: list, error: null });
        if (autoRoll.current && list.length > 0) {
          autoRoll.current = false;
          startRoll(list);
        }
      })
      .catch((e) => active && setLoaded({ key, pool: [], error: e?.message ?? String(e) }));
    return () => {
      active = false;
    };
    // `key` đã gồm mọi nguồn; các giá trị còn lại chỉ để đọc
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const locate = async () => {
    setLocating(true);
    try {
      const c = await getQuickPosition();
      setPos({ latitude: c.latitude, longitude: c.longitude });
    } catch (e) {
      console.warn('Không lấy được vị trí:', e);
    } finally {
      setLocating(false);
    }
  };

  const toggleGroup = (id: string) =>
    setGroupIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const noSource = !near && !mine && groupIds.size === 0;
  const result = shown && !rolling ? shown : null;
  const distance = shown && pos ? formatDistance(distanceMeters(pos.latitude, pos.longitude, shown.place.lat, shown.place.lng)) : null;
  const error = loaded?.key === key ? loaded.error : null;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={styles.flex} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.handle} />
          <View style={styles.head}>
            <Text style={styles.title}>🎲 Hôm nay ăn gì?</Text>
            <Pressable onPress={onClose} accessibilityLabel="Đóng" hitSlop={10}>
              <Ionicons name="close" size={24} color={colors.textMuted} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
            {/* Nguồn */}
            <Text style={styles.label}>Chọn trong…</Text>
            <View style={styles.chips}>
              <Source icon="navigate" label="Gần tôi" active={near} onPress={() => setNear((v) => !v)} />
              <Source
                icon="heart"
                label={`Must try của tôi${mustTry.size > 0 ? ` (${mustTry.size})` : ''}`}
                active={mine}
                onPress={() => setMine((v) => !v)}
              />
              {groupList.map((g) => (
                <Source key={g.id} icon="people" label={g.title} active={groupIds.has(g.id)} onPress={() => toggleGroup(g.id)} />
              ))}
            </View>
            {near && (
              <View style={styles.radiusRow}>
                <Text style={styles.sub}>Bán kính:</Text>
                {RADIUS_OPTIONS.map((r) => (
                  <Pressable key={r} style={[styles.radius, radiusKm === r && styles.radiusOn]} onPress={() => setRadiusKm(r)}>
                    <Text style={[styles.radiusText, radiusKm === r && styles.radiusTextOn]}>{r}km</Text>
                  </Pressable>
                ))}
              </View>
            )}
            {near && !pos && (
              <Pressable style={styles.locate} onPress={locate} disabled={locating}>
                {locating ? <ActivityIndicator color={colors.accent} /> : <Ionicons name="locate" size={16} color={colors.accent} />}
                <Text style={styles.locateText}>Chưa có vị trí của bạn — bấm để cho phép</Text>
              </Pressable>
            )}

            {/* Kết quả */}
            <View style={styles.resultBox}>
              {noSource ? (
                <Text style={styles.empty}>Chọn ít nhất một nguồn ở trên nhé.</Text>
              ) : error ? (
                <Text style={styles.errorText}>{error}</Text>
              ) : loading && !shown ? (
                <ActivityIndicator color={colors.accent} />
              ) : !shown ? (
                <Text style={styles.empty}>
                  Chưa có quán nào trong nguồn đã chọn.{'\n'}Thả tim ❤️ vài quán hoặc tăng bán kính nhé.
                </Text>
              ) : (
                <>
                  <View style={[styles.cover, rolling && styles.coverRolling]}>
                    {shown.place.cover_url ? (
                      <Image source={{ uri: shown.place.cover_url }} style={StyleSheet.absoluteFill} contentFit="cover" />
                    ) : (
                      <Ionicons name="restaurant" size={34} color={colors.caramel} />
                    )}
                  </View>
                  <Text style={[styles.placeName, rolling && styles.rolling]} numberOfLines={2}>
                    {shown.place.name}
                  </Text>
                  {!rolling && (
                    <>
                      <Text style={styles.meta} numberOfLines={2}>
                        {[
                          shown.place.avg_rating != null ? `★ ${shown.place.avg_rating.toFixed(1)}` : null,
                          shown.place.tags.slice(0, 2).map(tagLabel).join(' · ') || null,
                          distance,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </Text>
                      {!!shown.place.address && (
                        <Text style={styles.address} numberOfLines={2}>
                          {shown.place.address}
                        </Text>
                      )}
                      <View style={styles.badges}>
                        {shown.badges.slice(0, 3).map((b) => (
                          <View key={b} style={styles.badge}>
                            <Text style={styles.badgeText} numberOfLines={1}>
                              {b}
                            </Text>
                          </View>
                        ))}
                      </View>
                    </>
                  )}
                </>
              )}
            </View>
            {!loading && pool.length > 0 && <Text style={styles.count}>Đang chọn trong {pool.length} quán</Text>}
          </ScrollView>

          {/* Hành động */}
          <View style={styles.actions}>
            {result ? (
              <>
                <Pressable style={[styles.btn, styles.btnPrimary]} onPress={() => onInvite(result.place)}>
                  <Ionicons name="paper-plane" size={17} color={colors.onAccent} />
                  <Text style={styles.btnPrimaryText}>Rủ bạn đi</Text>
                </Pressable>
                <Pressable style={[styles.btn, styles.btnGhost]} onPress={() => onDirections(result.place)}>
                  <Ionicons name="navigate" size={17} color={colors.accent} />
                  <Text style={styles.btnGhostText}>Chỉ đường</Text>
                </Pressable>
                <Pressable style={[styles.btn, styles.btnGhost]} onPress={() => onOpenPlace(result.place)}>
                  <Ionicons name="map" size={17} color={colors.accent} />
                  <Text style={styles.btnGhostText}>Bản đồ</Text>
                </Pressable>
              </>
            ) : null}
            <Pressable
              style={[styles.btn, styles.btnRoll, (rolling || pool.length === 0) && styles.dim]}
              onPress={() => startRoll(poolRef.current)}
              disabled={rolling || pool.length === 0}
            >
              <Ionicons name="shuffle" size={18} color={colors.onAccent} />
              <Text style={styles.btnPrimaryText}>{rolling ? 'Đang quay…' : shown ? 'Quay lại' : 'Quay'}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function Source({
  icon,
  label,
  active,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={[styles.source, active && styles.sourceOn]} onPress={onPress} accessibilityState={{ selected: active }}>
      <Ionicons name={icon} size={14} color={active ? colors.onAccent : colors.caramel} />
      <Text style={[styles.sourceText, active && styles.sourceTextOn]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
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
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: colors.text, fontSize: 20, fontWeight: '900' },
  body: { gap: 10, paddingVertical: 8 },
  label: { color: colors.text, fontWeight: '700', fontSize: 14 },
  sub: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  source: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: '100%',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.pill,
  },
  sourceOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  sourceText: { color: colors.text, fontWeight: '700', fontSize: 14, flexShrink: 1 },
  sourceTextOn: { color: colors.onAccent },
  radiusRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  radius: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  radiusOn: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  radiusText: { color: colors.textMuted, fontWeight: '700', fontSize: 13 },
  radiusTextOn: { color: colors.accent },
  locate: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  locateText: { color: colors.accent, fontWeight: '700', fontSize: 14 },
  resultBox: {
    minHeight: 190,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 24,
    padding: 16,
    marginTop: 4,
  },
  cover: {
    width: 120,
    height: 90,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: colors.caramelSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverRolling: { opacity: 0.6 },
  placeName: { color: colors.text, fontSize: 22, fontWeight: '900', textAlign: 'center' },
  rolling: { color: colors.textMuted },
  meta: { color: colors.brown, fontSize: 14, fontWeight: '700', textAlign: 'center' },
  address: { color: colors.textMuted, fontSize: 13, textAlign: 'center' },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center', marginTop: 2 },
  badge: { maxWidth: '100%', backgroundColor: colors.accentSoft, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { color: colors.accent, fontSize: 12, fontWeight: '700' },
  empty: { color: colors.textMuted, fontSize: 14, textAlign: 'center', lineHeight: 21 },
  errorText: { color: colors.danger, fontSize: 14, textAlign: 'center' },
  count: { color: colors.textMuted, fontSize: 12, textAlign: 'center' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 46,
    paddingHorizontal: 16,
    borderRadius: radius.pill,
  },
  btnPrimary: { backgroundColor: colors.accent, flexGrow: 1 },
  btnPrimaryText: { color: colors.onAccent, fontWeight: '800', fontSize: 15 },
  btnGhost: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  btnGhostText: { color: colors.accent, fontWeight: '800', fontSize: 14 },
  btnRoll: { backgroundColor: colors.brown, flexGrow: 1, flexBasis: '100%' },
  dim: { opacity: 0.55 },
});
