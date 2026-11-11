import * as Location from 'expo-location';

import { requireUserId } from '../lib/auth';
import { supabase } from '../lib/supabase';

export type CurrentLocation = {
  latitude: number;
  longitude: number;
  /** Sai số GPS (mét) */
  accuracy: number;
  address: string;
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

export async function contributeNewPlace(name: string, lat: number, lng: number, address?: string) {
  const userId = await requireUserId();
  // Cú pháp WKT của PostGIS: POINT(kinh_độ vĩ_độ)
  const { data, error } = await supabase
    .from('places')
    .insert({
      name: name.trim(),
      address,
      lat,
      lng,
      location: `POINT(${lng} ${lat})`,
      created_by: userId,
    })
    .select('id, name, address')
    .single();

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
  if (!error) {
    return ((data ?? []) as MapPlace[]).map((p) => ({
      ...p,
      avg_rating: p.avg_rating == null ? null : Number(p.avg_rating),
      review_count: Number(p.review_count ?? 0),
      post_count: Number(p.post_count ?? 0),
    }));
  }

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
  }));
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
