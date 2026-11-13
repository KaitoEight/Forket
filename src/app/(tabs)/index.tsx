import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { router, useIsFocused, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
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

import { Avatar } from '@/components/Avatar';
import FreeFoodMap, { type FoodMapHandle, type MapViewport } from '@/components/FreeFoodMap';
import { FriendFilterSheet } from '@/components/FriendFilterSheet';
import { IconButton } from '@/components/IconButton';
import { PhotoViewer } from '@/components/PhotoViewer';
import { PlaceEditSheet } from '@/components/PlaceEditSheet';
import { PlaceReviews } from '@/components/PlaceReviews';
import { MustTryButton } from '@/components/MustTryButton';
import { WhatToEatSheet } from '@/components/WhatToEatSheet';
import { WishButton } from '@/components/WishButton';
import { useShake } from '@/hooks/useShake';
import { StarRating } from '@/components/StarRating';
import { placeInGroup, tagLabel, tagsInGroup, useCategories, type PlaceGroup } from '@/constants/placeTags';
import { colors, radius, shadow, statusBarStyle } from '@/constants/theme';
import { useAuth, type Profile } from '@/lib/auth';
import { fetchFriends } from '@/services/friendService';
import { formatMoney } from '@/lib/money';
import { useWishlistIds } from '@/services/wishlistService';
import {
  deletePlace,
  distanceMeters,
  fetchPlaceInfo,
  fetchPlacePermissions,
  fetchPlacesByIds,
  fetchPlacesInView,
  fetchVisitedBy,
  formatDistance,
  priceLevelLabel,
  getQuickPosition,
  releasePlace,
  searchPlaces,
  subscribeToPlaceChanges,
  type Bounds,
  type MapPlace,
  type PlaceInfo,
  type PlacePermissions,
} from '@/services/placeService';
import { fetchPostsByPlace, timeAgo, type PlacePhoto } from '@/services/postService';
import { fetchMyPosts, groupVisits, type VisitedPlace } from '@/services/profileService';
import { appAlert, type AppAlertButton } from '@/lib/appAlert';

const MIN_ZOOM = 12; // Phóng xa hơn mức này thì không tải quán (quá nhiều)
const FOCUS_ZOOM = 16;
const CARD_OFFSET = 110; // đẩy quán lên trên để không bị thẻ thông tin che
const MAX_CACHED = 500;

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

function inBounds(b: Bounds, p: { lat: number; lng: number }) {
  return p.lat >= b.minLat && p.lat <= b.maxLat && p.lng >= b.minLng && p.lng <= b.maxLng;
}

export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const { session, profile } = useAuth();
  const meId = session?.user.id;
  const params = useLocalSearchParams<{ focusPlace?: string; lat?: string; lng?: string }>();

  const [cardHeight, setCardHeight] = useState(0);
  const mapRef = useRef<FoodMapHandle>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadedBounds = useRef<Bounds[]>([]);
  const viewport = useRef<Bounds | null>(null);

  const [placesById, setPlacesById] = useState<Map<string, MapPlace>>(new Map());
  const [loading, setLoading] = useState(false);
  const [tooFar, setTooFar] = useState(false);
  const [userPos, setUserPos] = useState<{ latitude: number; longitude: number } | null>(null);

  const [selected, setSelected] = useState<MapPlace | null>(null);
  const [photos, setPhotos] = useState<PlacePhoto[]>([]);
  const [photosLoading, setPhotosLoading] = useState(false);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [perm, setPerm] = useState<PlacePermissions | null>(null);
  const [info, setInfo] = useState<PlaceInfo | null>(null);
  const [editing, setEditing] = useState(false);
  const [eatOpen, setEatOpen] = useState(false);

  // ---------- Tìm kiếm ----------
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [results, setResults] = useState<MapPlace[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [myVisits, setMyVisits] = useState<VisitedPlace[] | null>(null);

  // ---------- Bộ lọc ----------
  const [group, setGroup] = useState<PlaceGroup | null>(null);
  const [subTag, setSubTag] = useState<string | null>(null);
  const [onlyPhotos, setOnlyPhotos] = useState(false);
  const [onlyTop, setOnlyTop] = useState(false);
  const [onlyWish, setOnlyWish] = useState(false);
  const [people, setPeople] = useState<string[]>([]);
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [friends, setFriends] = useState<Profile[]>([]);
  const [visitedBy, setVisitedBy] = useState<Map<string, Set<string>> | null>(null);
  const [visitedLoading, setVisitedLoading] = useState(false);

  const categories = useCategories();
  const wishIds = useWishlistIds();

  // Lắc máy → "Hôm nay ăn gì?" (chỉ khi tab Bản đồ đang mở và không có bảng nào đè lên)
  const focused = useIsFocused();
  useShake(
    () => setEatOpen(true),
    focused && !eatOpen && !searchOpen && !editing && !peopleOpen && viewerIndex === null
  );
  const places = useMemo(() => [...placesById.values()], [placesById]);

  // Bản mới nhất của vài giá trị, để đọc trong callback realtime
  const selectedIdRef = useRef<string | null>(null);
  const knownIdsRef = useRef<string[]>([]);
  useEffect(() => {
    selectedIdRef.current = selected?.id ?? null;
  }, [selected?.id]);
  useEffect(() => {
    knownIdsRef.current = [...placesById.keys()];
  }, [placesById]);

  // Có ảnh / đánh giá mới hoặc quán được sửa → cập nhật ngay marker, thẻ quán, ảnh và điểm sao
  useEffect(() => {
    const pending = new Set<string | null>();
    let timer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const flush = async () => {
      timer = null;
      const wanted = new Set<string>();
      let reloadAll = false;
      for (const id of pending) {
        if (id === null) reloadAll = true;
        else wanted.add(id);
      }
      pending.clear();
      // Không biết quán nào đổi (VD: ảnh bị xoá) → tải lại các quán đang có trên bản đồ
      if (reloadAll) knownIdsRef.current.slice(0, 200).forEach((id) => wanted.add(id));
      const selectedNow = selectedIdRef.current;
      if (reloadAll && selectedNow) wanted.add(selectedNow);
      if (wanted.size === 0) return;

      try {
        const fresh = await fetchPlacesByIds([...wanted]);
        if (cancelled) return;
        const known = new Set(knownIdsRef.current);
        const view = viewport.current;
        const keep: MapPlace[] = [];
        const drop = new Set<string>();
        for (const p of fresh) {
          const empty = p.post_count === 0 && p.review_count === 0;
          if (empty) drop.add(p.id); // không còn ảnh / đánh giá nào → ẩn khỏi bản đồ
          else if (known.has(p.id) || (view && inBounds(view, p))) keep.push(p); // quán mới trong vùng đang xem
        }
        if (keep.length > 0) addPlaces(keep);
        if (drop.size > 0) {
          setPlacesById((prev) => {
            const next = new Map(prev);
            drop.forEach((id) => next.delete(id));
            return next;
          });
        }
        // Thẻ quán đang mở: cập nhật thông tin + tải lại ảnh
        const open = fresh.find((p) => p.id === selectedIdRef.current);
        if (open) {
          setSelected((cur) => (cur && cur.id === open.id ? { ...cur, ...open } : cur));
          fetchPostsByPlace(open.id)
            .then((list) => !cancelled && selectedIdRef.current === open.id && setPhotos(list))
            .catch(() => {});
        }
      } catch (e) {
        console.warn('Không cập nhật được bản đồ:', e);
      }
    };

    const unsubscribe = subscribeToPlaceChanges((placeId) => {
      pending.add(placeId);
      if (!timer) timer = setTimeout(flush, 700);
    });
    return () => {
      cancelled = true;
      unsubscribe();
      if (timer) clearTimeout(timer);
    };
  }, []);

  const visiblePlaces = useMemo(
    () =>
      places.filter((p) => {
        if (visitedBy && !visitedBy.has(p.id)) return false;
        if (subTag) {
          if (!p.tags.includes(subTag)) return false;
        } else if (group && !placeInGroup(p.tags, group)) return false;
        if (onlyPhotos && p.post_count === 0) return false;
        if (onlyTop && (p.avg_rating ?? 0) < 4) return false;
        if (onlyWish && !wishIds.has(p.id)) return false;
        return true;
      }),
    [places, visitedBy, group, subTag, onlyPhotos, onlyTop, onlyWish, wishIds]
  );

  const addPlaces = (list: MapPlace[]) => {
    if (list.length === 0) return;
    setPlacesById((prev) => {
      const next = prev.size > MAX_CACHED ? new Map<string, MapPlace>() : new Map(prev);
      for (const p of list) next.set(p.id, p);
      return next;
    });
  };

  // Căn bản đồ về vị trí hiện tại khi mở
  useEffect(() => {
    let cancelled = false;
    getQuickPosition()
      .then((c) => {
        if (cancelled) return;
        setUserPos({ latitude: c.latitude, longitude: c.longitude });
        mapRef.current?.setUser(c.latitude, c.longitude);
        if (!params.focusPlace) mapRef.current?.focus(c.latitude, c.longitude, FOCUS_ZOOM);
      })
      .catch((e) => console.warn('Không lấy được vị trí:', e));
    fetchFriends()
      .then((f) => !cancelled && setFriends(f))
      .catch(() => {});
    return () => {
      cancelled = true;
      if (debounce.current) clearTimeout(debounce.current);
    };
    // Chỉ chạy 1 lần khi mở bản đồ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mở quán từ nơi khác (hồ sơ bạn bè, chat…) → bay tới và mở thẻ quán
  useEffect(() => {
    const id = params.focusPlace;
    if (!id) return;
    const lat = Number(params.lat);
    const lng = Number(params.lng);
    if (Number.isFinite(lat) && Number.isFinite(lng)) mapRef.current?.focus(lat, lng, FOCUS_ZOOM, CARD_OFFSET);
    fetchPlacesByIds([id])
      .then(([p]) => {
        if (!p) return;
        addPlaces([p]);
        openPlace(p);
      })
      .catch((e) => console.warn('Không mở được quán:', e));
    router.setParams({ focusPlace: undefined, lat: undefined, lng: undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.focusPlace]);

  // Tìm quán trên toàn bộ dữ liệu (đợi ngừng gõ 300ms)
  useEffect(() => {
    const q = query.trim();
    // Ô trống → bảng hiện "đi gần đây" thay vì kết quả, khỏi xoá kết quả cũ
    if (!q) return;
    const t = setTimeout(() => {
      setSearching(true);
      searchPlaces(q, userPos)
        .then((list) => {
          setResults(list);
          setSearchError(null);
        })
        .catch((e) => setSearchError(e?.message ?? String(e)))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(t);
  }, [query, userPos]);

  // Lọc theo người: tải danh sách quán họ đã đi (trên toàn bản đồ, không chỉ vùng đang xem)
  const peopleRequest = useRef(0);
  const applyPeople = (ids: string[]) => {
    setPeople(ids);
    const req = ++peopleRequest.current;
    const stale = () => req !== peopleRequest.current;
    if (ids.length === 0) {
      setVisitedBy(null);
      setVisitedLoading(false);
      return;
    }
    setVisitedLoading(true);
    (async () => {
      try {
        const map = await fetchVisitedBy(ids);
        if (stale()) return;
        const missing = [...map.keys()].filter((id) => !placesById.has(id));
        const fetched = await fetchPlacesByIds(missing);
        if (stale()) return;
        addPlaces(fetched);
        setVisitedBy(map);
        // Không quán nào trong vùng đang xem → bay tới quán gần nhất trong danh sách
        const all = [...[...map.keys()].map((id) => placesById.get(id)).filter(Boolean), ...fetched] as MapPlace[];
        const v = viewport.current;
        if (all.length > 0 && v && !all.some((p) => inBounds(v, p))) {
          const ref = userPos ?? { latitude: all[0].lat, longitude: all[0].lng };
          const nearest = [...all].sort(
            (a, b) =>
              distanceMeters(ref.latitude, ref.longitude, a.lat, a.lng) -
              distanceMeters(ref.latitude, ref.longitude, b.lat, b.lng)
          )[0];
          mapRef.current?.focus(nearest.lat, nearest.lng, 14);
        }
      } catch (e: any) {
        if (!stale()) appAlert('Không lọc được', e?.message ?? String(e));
      } finally {
        if (!stale()) setVisitedLoading(false);
      }
    })();
  };

  const openSearch = () => {
    setSearchOpen(true);
    if (myVisits === null) {
      fetchMyPosts()
        .then((posts) => setMyVisits(groupVisits(posts)))
        .catch(() => setMyVisits([]));
    }
  };

  const closeSearch = () => {
    setSearchOpen(false);
    Keyboard.dismiss();
  };

  const pickResult = (p: MapPlace) => {
    addPlaces([p]);
    closeSearch();
    openPlace(p);
  };

  const pickVisited = async (v: VisitedPlace) => {
    closeSearch();
    mapRef.current?.focus(v.lat, v.lng, FOCUS_ZOOM, CARD_OFFSET);
    const cached = placesById.get(v.id);
    if (cached) return openPlace(cached);
    try {
      const [p] = await fetchPlacesByIds([v.id]);
      if (p) {
        addPlaces([p]);
        openPlace(p);
      }
    } catch (e) {
      console.warn('Không mở được quán:', e);
    }
  };

  const loadRegion = async (region: MapViewport) => {
    viewport.current = paddedBounds(region, 0);
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
      addPlaces(found);
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

  function openPlace(place: MapPlace | null) {
    setSelected(place);
    setPhotos([]);
    setPerm(null);
    setInfo(null);
    if (!place) return;

    mapRef.current?.focus(place.lat, place.lng, FOCUS_ZOOM, CARD_OFFSET);
    fetchPlacePermissions(place.id).then(setPerm);
    fetchPlaceInfo(place.id).then((i) => selectedIdRef.current === place.id && setInfo(i));
    if (place.post_count === 0) return;

    setPhotosLoading(true);
    fetchPostsByPlace(place.id)
      .then(setPhotos)
      .catch((e) => console.warn('Không tải được ảnh của quán:', e))
      .finally(() => setPhotosLoading(false));
  }

  const selectPlace = (placeId: string | null) => {
    if (searchOpen) closeSearch();
    openPlace(placeId ? (placesById.get(placeId) ?? null) : null);
  };

  const patchPlace = (placeId: string, patch: Partial<MapPlace>) => {
    setSelected((cur) => (cur?.id === placeId ? { ...cur, ...patch } : cur));
    setPlacesById((prev) => {
      const p = prev.get(placeId);
      if (!p) return prev;
      const next = new Map(prev);
      next.set(placeId, { ...p, ...patch });
      return next;
    });
  };

  // Có đánh giá mới → cập nhật điểm trên thẻ quán và dữ liệu marker
  const updateRating = (placeId: string, avg: number | null, count: number) =>
    patchPlace(placeId, { avg_rating: avg, review_count: count });

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

  const removeFromMap = (placeId: string) => {
    setPlacesById((prev) => {
      const next = new Map(prev);
      next.delete(placeId);
      return next;
    });
    setSelected(null);
  };

  const placeMenu = (p: MapPlace) => {
    if (!perm) return;
    const options: AppAlertButton[] = [];
    if (perm.can_edit_tags) {
      options.push({
        text: perm.is_owner ? 'Sửa thông tin quán' : 'Sửa loại, giờ mở cửa',
        icon: 'create-outline',
        onPress: () => setEditing(true),
      });
    }
    if (perm.can_delete) {
      options.push({
        text: 'Xoá quán',
        icon: 'trash-outline',
        style: 'destructive',
        onPress: () =>
          appAlert('Xoá quán này?', 'Ảnh check-in của bạn vẫn giữ trên Bảng tin, chỉ bỏ gắn quán.', [
            { text: 'Thôi', style: 'cancel' },
            {
              text: 'Xoá quán',
              style: 'destructive',
              onPress: async () => {
                try {
                  await deletePlace(p.id);
                  removeFromMap(p.id);
                } catch (e: any) {
                  appAlert('Không xoá được', e?.message ?? String(e));
                }
              },
            },
          ]),
      });
    } else if (perm.is_owner) {
      options.push({
        text: 'Bỏ quyền quản lý quán',
        icon: 'key-outline',
        style: 'destructive',
        onPress: () =>
          appAlert(
            'Bỏ quyền quản lý?',
            'Quán đã có ảnh hoặc đánh giá của người khác nên không xoá được. Bỏ quyền thì bạn không sửa tên, địa chỉ được nữa; quán vẫn ở lại cho mọi người.',
            [
              { text: 'Thôi', style: 'cancel' },
              {
                text: 'Bỏ quyền',
                style: 'destructive',
                onPress: async () => {
                  try {
                    await releasePlace(p.id);
                    patchPlace(p.id, { created_by: null });
                    setPerm(await fetchPlacePermissions(p.id));
                  } catch (e: any) {
                    appAlert('Không thực hiện được', e?.message ?? String(e));
                  }
                },
              },
            ]
          ),
      });
    }
    options.push({ text: 'Đóng', style: 'cancel' });
    appAlert(p.name, undefined, options);
  };

  // Món được nhắc nhiều nhất trong các lần check-in (kèm giá trung bình)
  const topDishes = useMemo(() => {
    const byKey = new Map<string, { key: string; name: string; count: number; prices: number[] }>();
    for (const ph of photos) {
      const name = ph.dish?.trim();
      if (!name) continue;
      const key = name.toLowerCase();
      const cur = byKey.get(key) ?? { key, name, count: 0, prices: [] };
      cur.count += 1;
      if (ph.price) cur.prices.push(ph.price);
      byKey.set(key, cur);
    }
    return [...byKey.values()]
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
      .map((d) => ({
        ...d,
        avgPrice: d.prices.length ? Math.round(d.prices.reduce((a, b) => a + b, 0) / d.prices.length / 1000) * 1000 : null,
      }));
  }, [photos]);

  const distance =
    selected && userPos
      ? formatDistance(distanceMeters(userPos.latitude, userPos.longitude, selected.lat, selected.lng))
      : null;

  const peopleList = useMemo(
    () => [...(profile ? [{ ...profile, isMe: true }] : []), ...friends],
    [profile, friends]
  );
  const peopleById = useMemo(() => new Map(peopleList.map((p) => [p.id, p])), [peopleList]);
  const visitorsOfSelected = selected && visitedBy ? [...(visitedBy.get(selected.id) ?? [])] : [];

  const topVisited = useMemo(
    () => (myVisits ? [...myVisits].sort((a, b) => b.visits - a.visits || b.lastVisit.localeCompare(a.lastVisit)).slice(0, 5) : []),
    [myVisits]
  );

  const chooseGroup = (g: PlaceGroup | null) => {
    setSubTag(null);
    setGroup((cur) => (cur === g ? null : g));
  };

  const filterActive = group || onlyPhotos || onlyTop || onlyWish || people.length > 0;

  // Bật lọc "Muốn đi": tải các quán đã lưu (kể cả ngoài vùng đang xem) rồi bay tới quán gần nhất
  const toggleWishFilter = () => {
    const on = !onlyWish;
    setOnlyWish(on);
    if (!on) return;
    const missing = [...wishIds].filter((id) => !placesById.has(id));
    fetchPlacesByIds(missing)
      .then((fetched) => {
        addPlaces(fetched);
        const all = [...[...wishIds].map((id) => placesById.get(id)).filter(Boolean), ...fetched] as MapPlace[];
        const v = viewport.current;
        if (all.length > 0 && v && !all.some((p) => inBounds(v, p))) {
          const ref = userPos ?? { latitude: all[0].lat, longitude: all[0].lng };
          const nearest = [...all].sort(
            (a, b) =>
              distanceMeters(ref.latitude, ref.longitude, a.lat, a.lng) -
              distanceMeters(ref.latitude, ref.longitude, b.lat, b.lng)
          )[0];
          mapRef.current?.focus(nearest.lat, nearest.lng, 14);
        }
      })
      .catch((e) => console.warn('Không tải được quán Muốn đi:', e));
  };

  return (
    <View style={styles.screen}>
      <StatusBar style={statusBarStyle} />
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
          {searchOpen ? (
            <Pressable hitSlop={8} onPress={closeSearch} accessibilityLabel="Đóng tìm kiếm">
              <Ionicons name="arrow-back" size={20} color={colors.text} />
            </Pressable>
          ) : (
            <Ionicons name="search" size={18} color={colors.textMuted} />
          )}
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            onFocus={openSearch}
            onSubmitEditing={() => results[0] && pickResult(results[0])}
            placeholder="Tìm quán đã lưu trên Forket…"
            placeholderTextColor={colors.textMuted}
            returnKeyType="search"
            autoCorrect={false}
          />
          {searching && <ActivityIndicator size="small" color={colors.textMuted} />}
          {!!query && !searching && (
            <Pressable hitSlop={8} onPress={() => setQuery('')}>
              <Ionicons name="close-circle" size={18} color={colors.textMuted} />
            </Pressable>
          )}
          {!searchOpen && (
            <View style={styles.brandPill}>
              <Ionicons name="leaf" size={12} color={colors.accent} />
              <Text style={styles.brandPillText}>Forket</Text>
            </View>
          )}
        </View>

        {searchOpen ? (
          <SearchPanel
            query={query.trim()}
            results={results}
            error={searchError}
            searching={searching}
            recent={myVisits?.slice(0, 5) ?? null}
            top={topVisited}
            userPos={userPos}
            maxHeight={windowHeight * 0.6}
            onPick={pickResult}
            onPickVisited={pickVisited}
          />
        ) : (
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
              <Chip icon="dice" label="Hôm nay ăn gì?" onPress={() => setEatOpen(true)} />
              <Chip
                icon="people"
                label={people.length > 0 ? `Bạn bè · ${people.length}` : 'Quán bạn bè đi'}
                active={people.length > 0}
                onPress={() => setPeopleOpen(true)}
                caret
              />
              {categories.groups.map((g) => (
                <Chip
                  key={g.key}
                  icon={g.icon as React.ComponentProps<typeof Ionicons>['name']}
                  label={g.label}
                  active={group === g.key}
                  onPress={() => chooseGroup(g.key)}
                />
              ))}
              <Chip icon="bookmark" label="Muốn đi" active={onlyWish} onPress={toggleWishFilter} />
              <Chip icon="camera" label="Có ảnh" active={onlyPhotos} onPress={() => setOnlyPhotos((v) => !v)} />
              <Chip icon="star" label="Ngon 4★+" active={onlyTop} onPress={() => setOnlyTop((v) => !v)} />
              {filterActive && (
                <Chip
                  icon="close"
                  label="Bỏ lọc"
                  onPress={() => {
                    setGroup(null);
                    setSubTag(null);
                    setOnlyPhotos(false);
                    setOnlyTop(false);
                    setOnlyWish(false);
                    applyPeople([]);
                  }}
                />
              )}
            </ScrollView>
            {group && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                {tagsInGroup(group).map((t) => (
                  <Chip
                    key={t.key}
                    small
                    label={t.label}
                    active={subTag === t.key}
                    onPress={() => setSubTag((cur) => (cur === t.key ? null : t.key))}
                  />
                ))}
              </ScrollView>
            )}
            {(loading || tooFar || visitedLoading) && (
              <View style={styles.statusPill}>
                {loading || visitedLoading ? (
                  <ActivityIndicator size="small" color={colors.onAccent} />
                ) : (
                  <Ionicons name="search" size={14} color={colors.onAccent} />
                )}
                <Text style={styles.statusText}>
                  {visitedLoading ? 'Đang tìm quán bạn bè đã đi…' : loading ? 'Đang tải quán…' : 'Phóng to để xem quán'}
                </Text>
              </View>
            )}
            {visitedBy && !visitedLoading && visiblePlaces.length === 0 && (
              <View style={styles.statusPill}>
                <Text style={styles.statusText}>Chưa có quán nào khớp bộ lọc</Text>
              </View>
            )}
          </>
        )}
      </View>

      {/* Nút về vị trí của tôi */}
      {!searchOpen && (
        <View style={[styles.locateBtn, { bottom: selected ? cardHeight + 12 : 20 }]}>
          <IconButton icon="locate" label="Vị trí của tôi" onPress={goToMe} />
        </View>
      )}

      {/* Thẻ thông tin quán đang chọn */}
      {selected && !searchOpen && (
        <KeyboardAvoidingView behavior="padding" style={styles.cardWrap} pointerEvents="box-none">
          <View
            style={[styles.card, { maxHeight: windowHeight * 0.65 }]}
            onLayout={(e) => setCardHeight(e.nativeEvent.layout.height)}
          >
            <View style={styles.cardHeader}>
              <Pressable
                style={styles.cardThumb}
                onPress={() => photos.length > 0 && setViewerIndex(0)}
                disabled={photos.length === 0}
              >
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
              </Pressable>
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
              {perm && (perm.can_edit_tags || perm.is_owner) && (
                <IconButton icon="ellipsis-horizontal" label="Quản lý quán" onPress={() => placeMenu(selected)} />
              )}
              <IconButton icon="close" label="Đóng" onPress={() => selectPlace(null)} />
            </View>

            <ScrollView contentContainerStyle={[styles.cardBody, { paddingBottom: 16 }]} keyboardShouldPersistTaps="handled">
              {(selected.tags.length > 0 || perm?.can_edit_tags) && (
                <View style={styles.tagRow}>
                  {selected.tags.map((t) => (
                    <View key={t} style={styles.tag}>
                      <Text style={styles.tagText}>{tagLabel(t)}</Text>
                    </View>
                  ))}
                  {selected.tags.length === 0 && perm?.can_edit_tags && (
                    <Pressable style={[styles.tag, styles.tagAdd]} onPress={() => setEditing(true)}>
                      <Ionicons name="add" size={13} color={colors.accent} />
                      <Text style={[styles.tagText, styles.tagAddText]}>Thêm loại quán</Text>
                    </Pressable>
                  )}
                </View>
              )}

              {(info?.open_hours || info?.price_level) && (
                <Text style={styles.infoLine}>
                  {[
                    info.open_hours ? `🕒 ${info.open_hours}` : null,
                    info.price_level ? `💰 ${priceLevelLabel(info.price_level)}/người` : null,
                  ]
                    .filter(Boolean)
                    .join('   ')}
                </Text>
              )}

              {topDishes.length > 0 && (
                <View style={styles.dishBlock}>
                  <Text style={styles.dishTitle}>Món nên thử</Text>
                  <View style={styles.tagRowInner}>
                    {topDishes.map((d) => (
                      <View key={d.key} style={styles.dishChip}>
                        <Text style={styles.dishChipText}>
                          {d.name}
                          {d.avgPrice ? ` · ${formatMoney(d.avgPrice)}` : ''}
                          {d.count > 1 ? ` (${d.count})` : ''}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {visitorsOfSelected.length > 0 && (
                <View style={styles.visitors}>
                  {visitorsOfSelected.slice(0, 5).map((id) => {
                    const p = peopleById.get(id);
                    return p ? <Avatar key={id} name={p.display_name} seed={p.username} uri={p.avatar_url} size={24} /> : null;
                  })}
                  <Text style={styles.placeMeta} numberOfLines={1}>
                    {visitorsOfSelected
                      .map((id) => (id === meId ? 'Bạn' : peopleById.get(id)?.display_name))
                      .filter(Boolean)
                      .join(', ')}{' '}
                    đã đến đây
                  </Text>
                </View>
              )}

              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photos}>
                {photosLoading && <ActivityIndicator color={colors.text} style={styles.photo} />}
                {!photosLoading && photos.length === 0 && (
                  <View style={[styles.photo, styles.noPhoto]}>
                    <Text style={styles.noPhotoText}>Chưa có ảnh</Text>
                  </View>
                )}
                {photos.map((ph, i) => (
                  <Pressable key={ph.id} style={styles.photo} onPress={() => setViewerIndex(i)}>
                    <Image
                      source={{ uri: ph.thumb_url ?? ph.image_url }}
                      style={StyleSheet.absoluteFill}
                      contentFit="cover"
                      transition={150}
                    />
                    <Text style={styles.photoTime}>{timeAgo(ph.created_at)}</Text>
                  </Pressable>
                ))}
              </ScrollView>

              <View style={styles.cardActions}>
                <Pressable style={[styles.actionBtn, styles.directionsBtn]} onPress={() => openDirections(selected)}>
                  <Ionicons name="navigate" size={17} color={colors.onAccent} />
                  <Text style={styles.actionText}>Chỉ đường</Text>
                </Pressable>
                <Pressable
                  style={[styles.actionBtn, styles.checkinBtn]}
                  onPress={() =>
                    router.push({ pathname: '/camera', params: { placeId: selected.id, placeName: selected.name } })
                  }
                >
                  <Ionicons name="camera" size={17} color={colors.onAccent} />
                  <Text style={styles.actionText}>Check-in</Text>
                </Pressable>
                <MustTryButton placeId={selected.id} compact />
                <WishButton placeId={selected.id} compact />
                <Pressable
                  style={[styles.actionBtn, styles.shareBtn]}
                  accessibilityLabel="Gửi vào chat"
                  onPress={() => router.push({ pathname: '/share-place', params: { placeId: selected.id } })}
                >
                  <Ionicons name="paper-plane" size={17} color={colors.onAccent} />
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

      <PhotoViewer
        photos={photos}
        index={viewerIndex}
        onClose={() => setViewerIndex(null)}
        title={selected?.name}
      />

      {eatOpen && (
        <WhatToEatSheet
          userPos={userPos}
          onClose={() => setEatOpen(false)}
          onOpenPlace={(p) => {
            setEatOpen(false);
            addPlaces([p]);
            openPlace(p);
          }}
          onDirections={openDirections}
          onInvite={(p) => {
            setEatOpen(false);
            router.push({ pathname: '/share-place', params: { placeId: p.id } });
          }}
        />
      )}

      <FriendFilterSheet
        visible={peopleOpen}
        people={peopleList}
        selected={people}
        onChange={setPeople}
        onClose={() => {
          setPeopleOpen(false);
          applyPeople(people);
        }}
      />

      {editing && selected && perm && (
        <PlaceEditSheet
          place={selected}
          info={info}
          isOwner={perm.is_owner}
          onClose={() => setEditing(false)}
          onSaved={(patch, nextInfo) => {
            patchPlace(selected.id, patch);
            setInfo(nextInfo);
          }}
        />
      )}
    </View>
  );
}

function Chip({
  icon,
  label,
  active,
  onPress,
  small,
  caret,
}: {
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  active?: boolean;
  onPress: () => void;
  small?: boolean;
  caret?: boolean;
}) {
  return (
    <Pressable style={[styles.chip, small && styles.chipSmall, active && styles.chipActive]} onPress={onPress}>
      {icon && <Ionicons name={icon} size={13} color={active ? colors.onAccent : colors.caramel} />}
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
      {caret && <Ionicons name="chevron-down" size={12} color={active ? colors.onAccent : colors.textMuted} />}
    </Pressable>
  );
}

/** Bảng dưới ô tìm kiếm: chưa gõ → quán đi gần đây / đi nhiều nhất; đã gõ → kết quả */
function SearchPanel({
  query,
  results,
  error,
  searching,
  recent,
  top,
  userPos,
  maxHeight,
  onPick,
  onPickVisited,
}: {
  query: string;
  results: MapPlace[];
  error: string | null;
  searching: boolean;
  recent: VisitedPlace[] | null;
  top: VisitedPlace[];
  userPos: { latitude: number; longitude: number } | null;
  maxHeight: number;
  onPick: (p: MapPlace) => void;
  onPickVisited: (v: VisitedPlace) => void;
}) {
  const dist = (lat: number, lng: number) =>
    userPos ? formatDistance(distanceMeters(userPos.latitude, userPos.longitude, lat, lng)) : null;

  return (
    <View style={[styles.panel, { maxHeight }]}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.panelBody}>
        {query ? (
          error ? (
            <Text style={styles.panelEmpty}>{error}</Text>
          ) : results.length === 0 ? (
            <Text style={styles.panelEmpty}>{searching ? 'Đang tìm…' : `Không có quán nào tên “${query}”.`}</Text>
          ) : (
            results.map((p) => (
              <ResultRow
                key={p.id}
                cover={p.cover_url}
                title={p.name}
                sub={[
                  dist(p.lat, p.lng),
                  p.avg_rating != null ? `★ ${p.avg_rating.toFixed(1)}` : null,
                  p.tags.map(tagLabel).join(', ') || p.address,
                ]
                  .filter(Boolean)
                  .join(' · ')}
                onPress={() => onPick(p)}
              />
            ))
          )
        ) : recent === null ? (
          <ActivityIndicator color={colors.accent} style={styles.panelLoader} />
        ) : recent.length === 0 ? (
          <Text style={styles.panelEmpty}>Bạn chưa check-in quán nào. Gõ tên quán để tìm nhé.</Text>
        ) : (
          <>
            <Text style={styles.panelTitle}>Đã đi gần đây</Text>
            {recent.map((v) => (
              <ResultRow
                key={`r-${v.id}`}
                cover={v.cover}
                icon="time-outline"
                title={v.name}
                sub={[timeAgo(v.lastVisit), dist(v.lat, v.lng)].filter(Boolean).join(' · ')}
                onPress={() => onPickVisited(v)}
              />
            ))}
            {top.some((v) => v.visits > 1) && (
              <>
                <Text style={styles.panelTitle}>Đi nhiều nhất</Text>
                {top
                  .filter((v) => v.visits > 1)
                  .map((v) => (
                    <ResultRow
                      key={`t-${v.id}`}
                      cover={v.cover}
                      icon="flame-outline"
                      title={v.name}
                      sub={`${v.visits} lần${dist(v.lat, v.lng) ? ` · ${dist(v.lat, v.lng)}` : ''}`}
                      onPress={() => onPickVisited(v)}
                    />
                  ))}
              </>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function ResultRow({
  cover,
  icon,
  title,
  sub,
  onPress,
}: {
  cover: string | null;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  sub: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={({ pressed }) => [styles.resultRow, pressed && styles.resultPressed]} onPress={onPress}>
      <View style={styles.resultThumb}>
        {cover ? (
          <Image source={{ uri: cover }} style={StyleSheet.absoluteFill} contentFit="cover" />
        ) : (
          <Ionicons name={icon ?? 'restaurant'} size={18} color={colors.caramel} />
        )}
      </View>
      <View style={styles.flex}>
        <Text style={styles.resultTitle} numberOfLines={1}>
          {title}
        </Text>
        {!!sub && (
          <Text style={styles.placeMeta} numberOfLines={1}>
            {sub}
          </Text>
        )}
      </View>
    </Pressable>
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
  chipSmall: { height: 32, paddingHorizontal: 12 },
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
  panel: {
    marginHorizontal: 16,
    backgroundColor: colors.surface,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    ...shadow,
  },
  panelBody: { paddingVertical: 8 },
  panelTitle: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 2,
  },
  panelEmpty: { color: colors.textMuted, fontSize: 14, textAlign: 'center', padding: 20, lineHeight: 20 },
  panelLoader: { marginVertical: 20 },
  resultRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 8 },
  resultPressed: { backgroundColor: colors.surfaceHigh },
  resultThumb: {
    width: 42,
    height: 42,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: colors.caramelSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultTitle: { color: colors.text, fontWeight: '700', fontSize: 15 },
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
  cardBody: { gap: 14 },
  ratingLine: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  ratingText: { color: colors.text, fontWeight: '700', fontSize: 13 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16 },
  placeName: { color: colors.text, fontSize: 18, fontWeight: '800' },
  placeMeta: { color: colors.textMuted, fontSize: 13, marginTop: 2, flexShrink: 1 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 16 },
  infoLine: { color: colors.text, fontSize: 13, fontWeight: '600', paddingHorizontal: 16 },
  dishBlock: { gap: 6, paddingHorizontal: 16 },
  dishTitle: { color: colors.textMuted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  tagRowInner: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  dishChip: { backgroundColor: colors.caramelSoft, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6 },
  dishChipText: { color: colors.brown, fontSize: 13, fontWeight: '700' },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.caramelSoft,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  tagText: { color: colors.brown, fontSize: 12, fontWeight: '700' },
  tagAdd: { backgroundColor: colors.accentSoft },
  tagAddText: { color: colors.accent },
  visitors: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 16 },
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
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    borderRadius: 16,
  },
  directionsBtn: { flex: 1, backgroundColor: colors.brown },
  checkinBtn: { flex: 1, backgroundColor: colors.accent },
  shareBtn: { width: 52, backgroundColor: colors.caramel },
  actionText: { color: colors.onAccent, fontWeight: '800', fontSize: 15 },
});
