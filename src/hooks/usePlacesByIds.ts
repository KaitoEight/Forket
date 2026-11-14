import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { fetchPlacesByIds, type MapPlace } from '@/services/placeService';

/**
 * Thông tin các quán theo id (VD: danh sách yêu thích). Chỉ tải những quán chưa có; tải lại mỗi lần màn hình được mở.
 * `loading` = đang tải mà chưa có quán nào để hiện.
 */
export function usePlacesByIds(ids: ReadonlySet<string>) {
  const [places, setPlaces] = useState<Map<string, MapPlace>>(new Map());
  const [loading, setLoading] = useState(true);

  const missingKey = [...ids].filter((id) => !places.has(id)).join(',');
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
        .catch((e) => console.warn('Không tải được danh sách quán:', e))
        .finally(() => active && setLoading(false));
      return () => {
        active = false;
      };
    }, [missingKey])
  );

  const rows = [...ids].map((id) => places.get(id)).filter((p): p is MapPlace => !!p);
  return { rows, loading: loading && rows.length === 0 && ids.size > 0 };
}
