import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import FreeFoodMap, { type FoodMapHandle, type MapViewport } from '@/components/FreeFoodMap';
import { IconButton } from '@/components/IconButton';
import { PlaceReviews } from '@/components/PlaceReviews';
import { StarRating } from '@/components/StarRating';
import { colors, radius, shadow } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import {
  distanceMeters,
  fetchPlacesInView,
  formatDistance,
  getQuickPosition,
  normalizeName,
  type Bounds,
  type MapPlace,
} from '@/services/placeService';
import { fetchPostsByPlace, timeAgo, type Post } from '@/services/postService';

const MIN_ZOOM = 12; // Phóng xa hơn mức này thì không tải quán (quá nhiều)
const FOCUS_ZOOM = 16;
const CARD_OFFSET = 110; // đẩy quán lên trên để không bị thẻ thông tin che
const MAX_CACHED = 500;

type Photo = Omit<Post, 'place' | 'author' | 'reactions'>;
type Filter = 'all' | 'photos' | 'top';

const FILTERS: { key: Filter; label: string; icon: React.ComponentProps<typeof Ionicons>['name'] }[] = [
  { key: 'all', label: 'Tất cả', icon: 'restaurant' },
  { key: 'photos', label: 'Có ảnh bạn bè', icon: 'camera' },
  { key: 'top', label: 'Ngon 4★+', icon: 'star' },
];

function paddedBounds(v: MapViewport, pad = 0.25): Bounds {
  const dLat = (v.maxLat - v.minLat) * pad;
  const dLng = (v.maxLng - v.minLng) * pad;
  return {
    minLat: v.minLat - dLat,
    maxLat: v.maxLat + dLat,
    minLng: v.minLng - dLng,
    maxLng: v.maxLng + dLng,
  };
}

function contains(outer: Bounds, inner: Bounds) {
  return (
    inner.minLat >= outer.minLat &&
    inner.maxLat <= outer.maxLat &&
    inner.minLng >= outer.minLng &&
    inner.maxLng <= outer.maxLng
  );
}

export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const { session } = useAuth();
  const meId = session?.user.id;
  const [cardHeight, setCardHeight] = useState(0);
  const mapRef = useRef<FoodMapHandle>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadedBounds = useRef<Bounds[]>([]);

  const [placesById, setPlacesById] = useState<Map<string, MapPlace>>(new Map());
  const [loading, setLoading] = useState(false);
  const [tooFar, setTooFar] = useState(false);
  const [userPos, setUserPos] = useState<{ latitude: number; longitude: number } | null>(null);

  const [selected, setSelected] = useState<MapPlace | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [photosLoading, setPhotosLoading] = useState(false);

  const places = useMemo(() => [...placesById.values()], [placesById]);

  // Tìm quán + bộ lọc nhanh (lọc trên các quán đã tải trong vùng bản đồ)
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const visiblePlaces = useMemo(() => {
    const q = normalizeName(query);
    return places.filter((p) => {
      if (q && !normalizeName(p.name).includes(q)) return false;
      if (filter === 'photos') return p.post_count > 0;
      if (filter === 'top') return (p.avg_rating ?? 0) >= 4;
      return true;
    });
  }, [places, query, filter]);

  const jumpToFirstMatch = () => {
    const first = visiblePlaces[0];
    if (first) selectPlace(first.id);
  };

  // Căn bản đồ về vị trí hiện tại khi mở
  useEffect(() => {
    let cancelled = false;
    getQuickPosition()
      .then((c) => {
        if (cancelled) return;
        setUserPos({ latitude: c.latitude, longitude: c.longitude });
        mapRef.current?.setUser(c.latitude, c.longitude);
        mapRef.current?.focus(c.latitude, c.longitude, FOCUS_ZOOM);
      })
      .catch((e) => console.warn('Không lấy được vị trí:', e));
    return () => {
      cancelled = true;
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, []);

  const loadRegion = async (region: MapViewport) => {
    if (region.zoom < MIN_ZOOM) {
      setTooFar(true);
      return;
    }
    setTooFar(false);

    // Vùng này đã tải rồi → khỏi gọi lại server
    const view = paddedBounds(region, 0);
    if (loadedBounds.current.some((b) => contains(b, view))) return;

    const bounds = paddedBounds(region);
    setLoading(true);
    try {
      const found = await fetchPlacesInView(bounds);
      loadedBounds.current = [...loadedBounds.current.slice(-9), bounds];
      setPlacesById((prev) => {
        const next = prev.size > MAX_CACHED ? new Map<string, MapPlace>() : new Map(prev);
        for (const p of found) next.set(p.id, p);
        return next;
      });
    } catch (e) {
      console.warn('Không tải được quán:', e);
    } finally {
      setLoading(false);
    }
  };

  const onViewportChange = (region: MapViewport) => {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => loadRegion(region), 350);
  };

  const selectPlace = (placeId: string | null) => {
    const place = placeId ? (placesById.get(placeId) ?? null) : null;
    setSelected(place);
    setPhotos([]);
    if (!place) return;

    mapRef.current?.focus(place.lat, place.lng, FOCUS_ZOOM, CARD_OFFSET);
    if (place.post_count === 0) return;

    setPhotosLoading(true);
    fetchPostsByPlace(place.id)
      .then(setPhotos)
      .catch((e) => console.warn('Không tải được ảnh của quán:', e))
      .finally(() => setPhotosLoading(false));
  };

  // Có đánh giá mới → cập nhật điểm trên thẻ quán và dữ liệu marker
  const updateRating = (placeId: string, avg: number | null, count: number) => {
    setSelected((cur) => (cur?.id === placeId ? { ...cur, avg_rating: avg, review_count: count } : cur));
    setPlacesById((prev) => {
      const p = prev.get(placeId);
      if (!p) return prev;
      const next = new Map(prev);
      next.set(placeId, { ...p, avg_rating: avg, review_count: count });
      return next;
    });
  };

  const goToMe = async () => {
    try {
      const c = userPos ?? (await getQuickPosition());
      setUserPos({ latitude: c.latitude, longitude: c.longitude });
      mapRef.current?.setUser(c.latitude, c.longitude);
      mapRef.current?.focus(c.latitude, c.longitude, FOCUS_ZOOM);
    } catch (e) {
      console.warn('Không lấy được vị trí:', e);
    }
  };

  const openDirections = (p: MapPlace) => {
    const dest = `${p.lat},${p.lng}`;
    const url =
      Platform.OS === 'ios'
        ? `http://maps.apple.com/?daddr=${dest}&q=${encodeURIComponent(p.name)}`
        : `https://www.google.com/maps/dir/?api=1&destination=${dest}`;
    Linking.openURL(url);
  };

  const distance =
    selected && userPos
      ? formatDistance(distanceMeters(userPos.latitude, userPos.longitude, selected.lat, selected.lng))
      : null;

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />
      <FreeFoodMap
        ref={mapRef}
        places={visiblePlaces}
        selectedId={selected?.id}
        onSelect={selectPlace}
        onViewportChange={onViewportChange}
      />

      {/* Thanh trên: tìm quán + bộ lọc */}
      <View style={[styles.topBar, { top: insets.top + 8 }]} pointerEvents="box-none">
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color={colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={jumpToFirstMatch}
            placeholder="Tìm quán ngon quanh đây…"
            placeholderTextColor={colors.textMuted}
            returnKeyType="search"
            autoCorrect={false}
          />
          {!!query && (
            <Pressable hitSlop={8} onPress={() => setQuery('')}>
              <Ionicons name="close-circle" size={18} color={colors.textMuted} />
            </Pressable>
          )}
          <View style={styles.brandPill}>
            <Ionicons name="leaf" size={12} color={colors.accent} />
            <Text style={styles.brandPillText}>Focket</Text>
          </View>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {FILTERS.map((f) => {
            const active = filter === f.key;
            return (
              <Pressable
                key={f.key}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => setFilter(f.key)}
              >
                <Ionicons name={f.icon} size={13} color={active ? colors.onAccent : colors.caramel} />
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{f.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
        {(loading || tooFar) && (
          <View style={styles.statusPill}>
            {loading ? (
              <ActivityIndicator size="small" color={colors.onAccent} />
            ) : (
              <Ionicons name="search" size={14} color={colors.onAccent} />
            )}
            <Text style={styles.statusText}>
              {loading ? 'Đang tải quán…' : 'Phóng to để xem quán'}
            </Text>
          </View>
        )}
      </View>

      {/* Nút về vị trí của tôi */}
      <View style={[styles.locateBtn, { bottom: selected ? cardHeight + 12 : 20 }]}>
        <IconButton icon="locate" label="Vị trí của tôi" onPress={goToMe} />
      </View>

      {/* Thẻ thông tin quán đang chọn */}
      {selected && (
        <KeyboardAvoidingView
          behavior="padding"
          style={styles.cardWrap}
          pointerEvents="box-none"
        >
          <View
            style={[styles.card, { maxHeight: windowHeight * 0.65 }]}
            onLayout={(e) => setCardHeight(e.nativeEvent.layout.height)}
          >
            <View style={styles.cardHeader}>
              <View style={styles.cardThumb}>
                {selected.cover_url ? (
                  <Image source={{ uri: selected.cover_url }} style={StyleSheet.absoluteFill} contentFit="cover" />
                ) : (
                  <Text style={styles.cardThumbEmoji}>🍜</Text>
                )}
                {selected.avg_rating != null && (
                  <View style={styles.cardThumbBadge}>
                    <Text style={styles.cardThumbBadgeText}>★ {selected.avg_rating.toFixed(1)}</Text>
                  </View>
                )}
              </View>
              <View style={styles.flex}>
                <Text style={styles.placeName} numberOfLines={1}>
                  {selected.name}
                </Text>
                <View style={styles.ratingLine}>
                  {selected.avg_rating != null ? (
                    <>
                      <StarRating value={selected.avg_rating} size={14} />
                      <Text style={styles.ratingText}>
                        {selected.avg_rating.toFixed(1)} ({selected.review_count})
                      </Text>
                    </>
                  ) : (
                    <Text style={styles.placeMeta}>Chưa có đánh giá</Text>
                  )}
                </View>
                <Text style={styles.placeMeta} numberOfLines={1}>
                  {[distance, `${selected.post_count} ảnh`, selected.address].filter(Boolean).join(' · ')}
                </Text>
              </View>
              <IconButton icon="close" label="Đóng" onPress={() => selectPlace(null)} />
            </View>

            <ScrollView
              contentContainerStyle={[styles.cardBody, { paddingBottom: 16 }]}
              keyboardShouldPersistTaps="handled"
            >
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.photos}
              >
                {photosLoading && <ActivityIndicator color={colors.text} style={styles.photo} />}
                {!photosLoading && photos.length === 0 && (
                  <View style={[styles.photo, styles.noPhoto]}>
                    <Text style={styles.noPhotoText}>Chưa có ảnh</Text>
                  </View>
                )}
                {photos.map((ph) => (
                  <View key={ph.id} style={styles.photo}>
                    <Image
                      source={{ uri: ph.image_url }}
                      style={StyleSheet.absoluteFill}
                      contentFit="cover"
                      transition={150}
                    />
                    <Text style={styles.photoTime}>{timeAgo(ph.created_at)}</Text>
                  </View>
                ))}
              </ScrollView>

              <View style={styles.cardActions}>
                <Pressable style={styles.directionsBtn} onPress={() => openDirections(selected)}>
                  <Ionicons name="navigate" size={17} color={colors.onAccent} />
                  <Text style={styles.directionsText}>Chỉ đường</Text>
                </Pressable>
                <Pressable
                  style={styles.checkinBtn}
                  onPress={() =>
                    router.push({
                      pathname: '/camera',
                      params: { placeId: selected.id, placeName: selected.name },
                    })
                  }
                >
                  <Ionicons name="camera" size={17} color={colors.onAccent} />
                  <Text style={styles.directionsText}>Check-in</Text>
                </Pressable>
              </View>

              <PlaceReviews
                key={selected.id}
                placeId={selected.id}
                meId={meId}
                onStatsChange={(avg, count) => updateRating(selected.id, avg, count)}
              />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  topBar: { position: 'absolute', left: 0, right: 0, gap: 10 },
  searchBox: {
    marginHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    paddingLeft: 16,
    paddingRight: 6,
    height: 50,
    ...shadow,
  },
  searchInput: { flex: 1, color: colors.text, fontSize: 15, height: '100%' },
  brandPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.accentSoft,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: radius.pill,
  },
  brandPillText: { color: colors.accent, fontWeight: '900', fontSize: 12 },
  chips: { paddingHorizontal: 16, gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    height: 36,
    borderRadius: radius.pill,
  },
  chipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { color: colors.text, fontWeight: '700', fontSize: 13 },
  chipTextActive: { color: colors.onAccent },
  statusPill: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.brown,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.pill,
  },
  statusText: { color: colors.onAccent, fontWeight: '700', fontSize: 13 },
  locateBtn: { position: 'absolute', right: 16 },
  cardWrap: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  card: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: colors.border,
    paddingTop: 16,
    gap: 14,
    ...shadow,
  },
  cardThumb: {
    width: 72,
    height: 72,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: colors.caramelSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardThumbEmoji: { fontSize: 30 },
  cardThumbBadge: {
    position: 'absolute',
    left: 4,
    top: 4,
    backgroundColor: colors.caramel,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 8,
  },
  cardThumbBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  cardActions: { flexDirection: 'row', gap: 10, paddingHorizontal: 16 },
  cardBody: { gap: 16 },
  ratingLine: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  ratingText: { color: colors.text, fontWeight: '700', fontSize: 13 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16 },
  placeName: { color: colors.text, fontSize: 18, fontWeight: '800' },
  placeMeta: { color: colors.textMuted, fontSize: 13, marginTop: 2 },
  photos: { paddingHorizontal: 16, gap: 8 },
  photo: {
    width: 96,
    height: 96,
    borderRadius: 20,
    borderCurve: 'continuous',
    overflow: 'hidden',
    backgroundColor: colors.surface,
    justifyContent: 'center',
  },
  photoTime: {
    position: 'absolute',
    bottom: 6,
    left: 8,
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowRadius: 4,
  },
  noPhoto: { alignItems: 'center' },
  noPhotoText: { color: colors.textMuted, fontSize: 12 },
  directionsBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.brown,
    paddingVertical: 13,
    borderRadius: 16,
  },
  checkinBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.accent,
    paddingVertical: 13,
    borderRadius: 16,
  },
  directionsText: { color: colors.onAccent, fontWeight: '800', fontSize: 15 },
});
