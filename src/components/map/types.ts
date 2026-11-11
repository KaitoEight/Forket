import type { Ref } from 'react';

import type { MapPlace } from '@/services/placeService';

export type { MapPlace };

export type LatLng = { latitude: number; longitude: number };

/** Khung bản đồ đang hiển thị (gửi lên mỗi khi người dùng kéo/zoom xong) */
export type MapViewport = {
  minLat: number;
  minLng: number;
  maxLat: number;
  maxLng: number;
  zoom: number;
};

/** Các lệnh điều khiển bản đồ từ phía React Native */
export type FoodMapHandle = {
  /** Bay tới toạ độ. offsetY > 0: đẩy điểm lên trên (chừa chỗ cho thẻ thông tin) */
  focus: (lat: number, lng: number, zoom?: number, offsetY?: number) => void;
  /** Hiện chấm xanh vị trí người dùng */
  setUser: (lat: number, lng: number) => void;
};

export type FoodMapProps = {
  places: MapPlace[];
  selectedId?: string | null;
  initialCenter?: LatLng;
  initialZoom?: number;
  onSelect?: (placeId: string | null) => void;
  onViewportChange?: (viewport: MapViewport) => void;
  ref?: Ref<FoodMapHandle>;
};

export type MapCommand =
  | { type: 'places'; places: MapPlace[] }
  | { type: 'selected'; id: string | null }
  | { type: 'focus'; lat: number; lng: number; zoom?: number; offsetY?: number }
  | { type: 'user'; lat: number; lng: number };

export type MapEvent =
  | { type: 'ready' }
  | ({ type: 'viewport' } & MapViewport)
  | { type: 'select'; id: string | null };

export const DEFAULT_CENTER: LatLng = { latitude: 10.7769, longitude: 106.7009 }; // TP.HCM
export const DEFAULT_ZOOM = 15;
