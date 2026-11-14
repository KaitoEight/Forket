import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { tagLabel } from '@/constants/placeTags';
import { colors } from '@/constants/theme';
import type { MapPlace } from '@/services/placeService';

/** Một dòng quán (ảnh bìa, tên, điểm, loại, địa chỉ). Bấm → mở quán trên bản đồ. `action` = nút bên phải. */
export function PlaceRow({ place, action }: { place: MapPlace; action?: ReactNode }) {
  const open = () =>
    router.navigate({ pathname: '/', params: { focusPlace: place.id, lat: String(place.lat), lng: String(place.lng) } });

  return (
    <Pressable style={({ pressed }) => [styles.row, pressed && styles.pressed]} onPress={open}>
      <View style={styles.thumb}>
        {place.cover_url ? (
          <Image source={{ uri: place.cover_url }} style={StyleSheet.absoluteFill} contentFit="cover" />
        ) : (
          <Ionicons name="restaurant" size={20} color={colors.caramel} />
        )}
      </View>
      <View style={styles.flex}>
        <Text style={styles.name} numberOfLines={1}>
          {place.name}
        </Text>
        <Text style={styles.sub} numberOfLines={1}>
          {[
            place.avg_rating != null ? `★ ${place.avg_rating.toFixed(1)}` : null,
            place.tags.slice(0, 2).map(tagLabel).join(' · ') || null,
            place.address,
          ]
            .filter(Boolean)
            .join(' · ')}
        </Text>
      </View>
      {action}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
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
});
