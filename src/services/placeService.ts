import * as Location from 'expo-location';

import { requireUserId } from '../lib/auth';
import { supabase } from '../lib/supabase';

export type CurrentLocation = {
  latitude: number;
  longitude: number;
  /** Sai số GPS (mét) */
  accuracy: number;
  address: string;
  /** true = người dùng tự chọn địa chỉ / quán, không phải vị trí GPS */
  custom?: boolean;
};

export type NearbyPlace = {
  id: string;
  name: string;
  address?: string | null;
  distance_meters: number;
};

export type MapPlace = {
  id: string;
  name: string;
  address: string | null;
  lat: number;
  lng: number;
  post_count: number;
  cover_url: string | null;
  avg_rating: number | null;
  review_count: number;
  tags: string[];
  created_by: string | null;
};

export type Bounds = { minLat: number; minLng: number; maxLat: number; maxLng: number };

// ---------- Vị trí ----------

async function ensurePermission() {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') {
    throw new Error('Cần cấp quyền truy cập vị trí để ghim quán ăn!');
  }
}

/** Vị trí nhanh (dùng vị trí gần nhất nếu còn mới) — để căn giữa bản đồ */
export async function getQuickPosition() {
  await ensurePermission();
  const last = await Location.getLastKnownPositionAsync({ maxAge: 5 * 60_000 });
  if (last) return last.coords;
  const fresh = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  return fresh.coords;
}

/** Vị trí chính xác + địa chỉ — để ghim quán */
export async function getCurrentLocationAndAddress(): Promise<CurrentLocation> {
  await ensurePermission();

  // Dùng vị trí vừa có (≤ 30s, sai số ≤ 50m) để khỏi phải đợi GPS
  const last = await Location.getLastKnownPositionAsync({ maxAge: 30_000, requiredAccuracy: 50 });
  const loc =
    last ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }));
  const { latitude, longitude, accuracy } = loc.coords;

  const address = await reverseGeocode(latitude, longitude);
  return { latitude, longitude, accuracy: accuracy ?? 50, address };
}

async function reverseGeocode(latitude: number, longitude: number) {
  // 1. Geocoder có sẵn trên máy: nhanh, miễn phí, không bị giới hạn lượt gọi
  try {
    const [a] = await Location.reverseGeocodeAsync({ latitude, longitude });
    if (a) {
      if (a.formattedAddress) return a.formattedAddress;
      const street = [a.streetNumber, a.street].filter(Boolean).join(' ');
      const text = [street || a.name, a.district, a.city ?? a.subregion, a.region]
        .filter(Boolean)
        .join(', ');
      if (text) return text;
    }
  } catch (e) {
    console.warn('Geocoder trên máy lỗi, dùng OpenStreetMap:', e);
  }

  // 2. Dự phòng: Nominatim (OpenStreetMap)
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&accept-language=vi`,
      { headers: { 'User-Agent': 'Forket/1.0' } }
    );
    const data = await res.json();
    return (data.display_name as string) || '';
  } catch (e) {
    console.warn('Không lấy được tên đường tự động:', e);
    return '';
  }
}

// ---------- Quán gần đây ----------

/** Bán kính tìm quán tự giãn theo sai số GPS (trong nhà GPS hay lệch 50–150m) */
export function searchRadiusFor(accuracy: number) {
  return Math.round(Math.min(300, Math.max(100, accuracy * 1.5)));
}

export async function fetchNearbyRecommendations(
  lat: number,
  lng: number,
  radiusMeters = 100
): Promise<NearbyPlace[]> {
  const { data, error } = await supabase.rpc('get_nearby_places', {
    user_lat: lat,
    user_lng: lng,
    radius_meters: radiusMeters,
  });
  if (error) throw error;
  return ((data ?? []) as NearbyPlace[]).sort((a, b) => a.distance_meters - b.distance_meters);
}

/** "Bún Bò  Cô Ba" ≈ "bun bo co ba" — so tên quán không phân biệt dấu/hoa thường */
export function normalizeName(name: string) {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Tìm quán trùng tên trong danh sách quán gần đó, tránh ghim 2 lần cùng 1 quán */
export function findDuplicatePlace<T extends { name: string }>(name: string, nearby: T[]) {
  const key = normalizeName(name);
  if (!key) return undefined;
  return nearby.find((p) => {
    const other = normalizeName(p.name);
    if (other === key) return true;
    // "bun bo co ba" ≈ "bun bo co ba hue", nhưng "pho" không trùng "pho ha noi"
    const [short, long] = key.length < other.length ? [key, other] : [other, key];
    return short.length >= 6 && long.includes(short);
  });
}

export async function contributeNewPlace(
  name: string,
  lat: number,
  lng: number,
  address?: string,
  tags: string[] = []
) {
  const userId = await requireUserId();
  // Cú pháp WKT của PostGIS: POINT(kinh_độ vĩ_độ)
  const row: Record<string, unknown> = {
    name: name.trim(),
    address,
    lat,
    lng,
    location: `POINT(${lng} ${lat})`,
    created_by: userId,
  };
  if (tags.length > 0) row.tags = tags;
  let { data, error } = await supabase.from('places').insert(row).select('id, name, address').single();
  // Server chưa có cột tags → lưu quán không kèm tag
  if (error?.code === 'PGRST204' && row.tags) {
    delete row.tags;
    ({ data, error } = await supabase.from('places').insert(row).select('id, name, address').single());
  }

  if (error) throw error;
  return data as { id: string; name: string; address: string | null };
}

// ---------- Bản đồ ----------

/** Chỉ tải quán trong khung bản đồ đang xem (kèm số ảnh + ảnh mới nhất) */
export async function fetchPlacesInView(b: Bounds, maxResults = 200): Promise<MapPlace[]> {
  const { data, error } = await supabase.rpc('get_places_in_view', {
    min_lat: b.minLat,
    min_lng: b.minLng,
    max_lat: b.maxLat,
    max_lng: b.maxLng,
    max_results: maxResults,
  });
  if (!error) return normalizePlaces(data);

  // Chưa chạy migration get_places_in_view → lọc trực tiếp bảng places
  if (error.code !== 'PGRST202') throw error;
  const fallback = await supabase
    .from('places')
    .select('id, name, address, lat, lng')
    .gte('lat', b.minLat)
    .lte('lat', b.maxLat)
    .gte('lng', b.minLng)
    .lte('lng', b.maxLng)
    .limit(maxResults);
  if (fallback.error) throw fallback.error;
  return (fallback.data ?? []).map((p) => ({
    ...p,
    lat: Number(p.lat),
    lng: Number(p.lng),
    post_count: 0,
    cover_url: null,
    avg_rating: null,
    review_count: 0,
    tags: [],
    created_by: null,
  }));
}

function normalizePlaces(data: unknown): MapPlace[] {
  return ((data ?? []) as MapPlace[]).map((p) => ({
    ...p,
    lat: Number(p.lat),
    lng: Number(p.lng),
    avg_rating: p.avg_rating == null ? null : Number(p.avg_rating),
    review_count: Number(p.review_count ?? 0),
    post_count: Number(p.post_count ?? 0),
    tags: p.tags ?? [],
    created_by: p.created_by ?? null,
  }));
}

const NEEDS_PLACES_SQL =
  'Server chưa bật tính năng này: hãy chạy file SQL 20261112010000_places_tags_search.sql trong Supabase.';

function placesError(e: { code?: string; message?: string }) {
  return e.code === 'PGRST202' ? new Error(NEEDS_PLACES_SQL) : (e as Error);
}

/** Tìm quán theo tên trên toàn bộ dữ liệu (không dấu), gần mình trước */
export async function searchPlaces(q: string, near?: { latitude: number; longitude: number } | null) {
  const { data, error } = await supabase.rpc('search_places', {
    q,
    near_lat: near?.latitude ?? null,
    near_lng: near?.longitude ?? null,
    max_results: 20,
  });
  if (error) throw placesError(error);
  return normalizePlaces(data);
}

/** Thông tin đầy đủ (ảnh, điểm, tag) của các quán theo id */
export async function fetchPlacesByIds(ids: string[]): Promise<MapPlace[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase.rpc('get_places_by_ids', { ids });
  if (error) throw placesError(error);
  return normalizePlaces(data);
}

export type PlacePermissions = { is_owner: boolean; can_edit_tags: boolean; can_delete: boolean };

export async function fetchPlacePermissions(placeId: string): Promise<PlacePermissions> {
  const { data, error } = await supabase.rpc('get_place_permissions', { pid: placeId });
  if (error) return { is_owner: false, can_edit_tags: false, can_delete: false };
  return ((data ?? []) as PlacePermissions[])[0] ?? { is_owner: false, can_edit_tags: false, can_delete: false };
}

export async function updatePlace(placeId: string, input: { name: string; address: string | null; tags: string[] }) {
  const { error } = await supabase.rpc('update_place', {
    pid: placeId,
    new_name: input.name,
    new_address: input.address,
    new_tags: input.tags,
  });
  if (error) throw placesError(error);
}

// ---------- Giờ mở cửa + mức giá ----------

export type PlaceInfo = { open_hours: string | null; price_level: number | null };

export const PRICE_LEVELS = [
  { level: 1, label: 'Dưới 50k' },
  { level: 2, label: '50–150k' },
  { level: 3, label: '150–300k' },
  { level: 4, label: 'Trên 300k' },
] as const;

export function priceLevelLabel(level: number | null | undefined) {
  return PRICE_LEVELS.find((p) => p.level === level)?.label ?? null;
}

/** Giờ mở cửa + mức giá của quán (chưa chạy SQL → rỗng, không báo lỗi) */
export async function fetchPlaceInfo(placeId: string): Promise<PlaceInfo> {
  const { data, error } = await supabase.rpc('get_place_info', { pid: placeId });
  const row = error ? null : ((data ?? []) as PlaceInfo[])[0];
  return { open_hours: row?.open_hours ?? null, price_level: row?.price_level ?? null };
}

export async function setPlaceInfo(placeId: string, info: PlaceInfo) {
  const { error } = await supabase.rpc('set_place_info', {
    pid: placeId,
    hours: info.open_hours,
    level: info.price_level,
  });
  if (error) {
    if (error.code === 'PGRST202') {
      throw new Error('Server chưa bật giờ mở cửa: hãy chạy file SQL 20261114020000_comments_dishes_hours.sql trong Supabase.');
    }
    throw placesError(error);
  }
}

export async function deletePlace(placeId: string) {
  const { error } = await supabase.rpc('delete_place', { pid: placeId });
  if (error) throw placesError(error);
}

export async function releasePlace(placeId: string) {
  const { error } = await supabase.rpc('release_place', { pid: placeId });
  if (error) throw placesError(error);
}

/** Các quán mà những người này đã check-in (RLS: chỉ người đang chia sẻ hoạt động) → id quán + ai đã đi */
export async function fetchVisitedBy(userIds: string[]) {
  if (userIds.length === 0) return new Map<string, Set<string>>();
  const { data, error } = await supabase
    .from('posts')
    .select('place_id, created_by')
    .in('created_by', userIds)
    .not('place_id', 'is', null)
    .limit(2000);
  if (error) throw error;
  const map = new Map<string, Set<string>>();
  for (const row of (data ?? []) as { place_id: string; created_by: string }[]) {
    const set = map.get(row.place_id) ?? new Set<string>();
    set.add(row.created_by);
    map.set(row.place_id, set);
  }
  return map;
}

export function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371e3;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function formatDistance(m: number) {
  return m < 1000 ? `${Math.round(m)}m` : `${(m / 1000).toFixed(1)}km`;
}

// ---------- Realtime: bản đồ tự cập nhật ----------

/**
 * Lắng nghe mọi thay đổi có thể làm đổi thông tin 1 quán: ảnh mới / bị xoá, đánh giá, sửa quán.
 * RLS tự chỉ gửi những gì tôi xem được. onChange(placeId) — placeId = null nếu không biết quán nào.
 * Trả về hàm huỷ.
 */
export function subscribeToPlaceChanges(onChange: (placeId: string | null) => void) {
  const idOf = (row: unknown, key: string) => ((row as Record<string, unknown>)?.[key] as string | undefined) ?? null;
  const channel = supabase
    .channel(`place-changes-${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'posts' }, (payload) => {
      // DELETE chỉ có khoá chính → không biết quán nào, để nơi nhận tự tải lại
      onChange(idOf(payload.new, 'place_id') ?? idOf(payload.old, 'place_id'));
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'reviews' }, (payload) => {
      onChange(idOf(payload.new, 'place_id') ?? idOf(payload.old, 'place_id'));
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'places' }, (payload) => {
      onChange(idOf(payload.new, 'id'));
    })
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}

export type PlaceRow = { id: string; name: string; address: string | null };

/** Lắng nghe quán bị sửa (tên, địa chỉ…) — dùng cho Bảng tin. Trả về hàm huỷ. */
export function subscribeToPlaceEdits(onEdit: (place: PlaceRow) => void) {
  const channel = supabase
    .channel(`place-edits-${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'places' }, (payload) => {
      const row = payload.new as Partial<PlaceRow>;
      if (row.id && typeof row.name === 'string') onEdit({ id: row.id, name: row.name, address: row.address ?? null });
    })
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}

// ---------- Tìm địa chỉ (để chọn vị trí thủ công khi check-in) ----------

export type AddressSuggestion = {
  id: string;
  /** Tên gọn (tên toà nhà / quán / đường) */
  title: string;
  /** Phần địa chỉ còn lại */
  subtitle: string;
  /** Địa chỉ đầy đủ */
  address: string;
  lat: number;
  lng: number;
};

/**
 * Gợi ý địa chỉ từ OpenStreetMap (Nominatim: miễn phí, không cần API key).
 * Nominatim cho tối đa ~1 lượt/giây → nơi gọi cần chờ người dùng ngừng gõ.
 * Ưu tiên kết quả gần `near`; lỗi mạng → thử geocoder có sẵn trên máy.
 */
export async function searchAddress(
  query: string,
  near?: { latitude: number; longitude: number } | null
): Promise<AddressSuggestion[]> {
  const q = query.trim();
  if (q.length < 3) return [];

  try {
    const params = new URLSearchParams({
      q,
      format: 'jsonv2',
      limit: '6',
      'accept-language': 'vi',
      countrycodes: 'vn',
    });
    if (near) {
      const d = 0.4; // ~45km quanh vị trí hiện tại (chỉ ưu tiên, không loại kết quả ở xa)
      params.set('viewbox', `${near.longitude - d},${near.latitude + d},${near.longitude + d},${near.latitude - d}`);
    }
    const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
      headers: { 'User-Agent': 'Forket/1.0' },
    });
    if (!res.ok) throw new Error(`Nominatim ${res.status}`);
    const rows = (await res.json()) as {
      place_id: number;
      lat: string;
      lon: string;
      name?: string;
      display_name: string;
    }[];
    const list = rows.map((r) => {
      const parts = r.display_name.split(',').map((x) => x.trim());
      const title = r.name || parts[0] || q;
      // Bỏ phần đầu trùng tên, rút gọn còn 4 cụm cho dễ đọc
      const rest = (r.name ? parts.filter((x) => x !== r.name) : parts.slice(1)).slice(0, 4).join(', ');
      return {
        id: String(r.place_id),
        title,
        subtitle: rest,
        address: r.display_name,
        lat: parseFloat(r.lat),
        lng: parseFloat(r.lon),
      };
    });
    if (list.length > 0) return list;
  } catch (e) {
    console.warn('Nominatim lỗi, thử geocoder trên máy:', e);
  }

  // Dự phòng: geocoder có sẵn trên máy (chỉ trả toạ độ)
  try {
    const found = await Location.geocodeAsync(q);
    return found.slice(0, 3).map((f, i) => ({
      id: `device-${i}`,
      title: q,
      subtitle: 'Theo bản đồ trên máy',
      address: q,
      lat: f.latitude,
      lng: f.longitude,
    }));
  } catch {
    return [];
  }
}
