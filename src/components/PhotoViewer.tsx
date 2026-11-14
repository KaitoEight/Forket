import Ionicons from '@expo/vector-icons/Ionicons';
import { useState, type ReactNode } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { ZoomableImage } from '@/components/ZoomableImage';
import { timeAgo } from '@/services/postService';

export type ViewerPhoto = {
  id: string;
  image_url: string;
  caption?: string | null;
  created_at?: string;
  author?: { username: string; display_name: string; avatar_url?: string | null } | null;
};

type Props = {
  photos: ViewerPhoto[];
  /** Vị trí ảnh đang mở; null = đóng */
  index: number | null;
  onClose: () => void;
  title?: string;
  /** Nút / nội dung thêm ở cuối màn hình cho ảnh đang xem (VD: nút xoá ảnh của mình) */
  footer?: (photo: ViewerPhoto) => ReactNode;
};

/** Xem ảnh toàn màn hình: vuốt ngang để qua ảnh khác, chụm 2 ngón (hoặc chạm đúp) để phóng to */
export function PhotoViewer({ photos, index, onClose, title, footer }: Props) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [current, setCurrent] = useState(index ?? 0);
  const [openedAt, setOpenedAt] = useState<number | null>(index);

  // Mở ở ảnh khác → nhảy tới ảnh đó
  if (index !== openedAt) {
    setOpenedAt(index);
    if (index != null) setCurrent(index);
  }

  const photo = photos[current];

  return (
    <Modal visible={index != null} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      {/* Android: cử chỉ trong Modal cần GestureHandlerRootView riêng */}
      <GestureHandlerRootView style={styles.backdrop}>
        <FlatList
          data={photos}
          horizontal
          pagingEnabled
          initialScrollIndex={index ?? 0}
          getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
          keyExtractor={(p) => p.id}
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(e) => setCurrent(Math.round(e.nativeEvent.contentOffset.x / width))}
          renderItem={({ item }) => (
            <View style={{ width, height }}>
              <ZoomableImage uri={item.image_url} contentFit="contain" />
            </View>
          )}
        />

        <View style={[styles.top, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
          <Text style={styles.title} numberOfLines={1}>
            {title ?? ''}
            {photos.length > 1 ? `  ${current + 1}/${photos.length}` : ''}
          </Text>
          <Pressable style={styles.close} onPress={onClose} accessibilityLabel="Đóng" hitSlop={8}>
            <Ionicons name="close" size={26} color="#fff" />
          </Pressable>
        </View>

        {photo && (photo.author || photo.caption || footer) && (
          <View style={[styles.bottom, { paddingBottom: insets.bottom + 16 }]} pointerEvents="box-none">
            {photo.author && (
              <View style={styles.authorRow} pointerEvents="none">
                <Avatar
                  name={photo.author.display_name}
                  seed={photo.author.username}
                  uri={photo.author.avatar_url}
                  size={28}
                />
                <Text style={styles.author}>{photo.author.display_name}</Text>
                {photo.created_at && <Text style={styles.time}>{timeAgo(photo.created_at)}</Text>}
              </View>
            )}
            {photo.caption ? (
              <Text style={styles.caption} pointerEvents="none">
                {photo.caption}
              </Text>
            ) : null}
            {footer?.(photo)}
          </View>
        )}
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)' },
  top: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 12,
  },
  title: { flex: 1, color: '#fff', fontWeight: '800', fontSize: 16 },
  close: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 20, gap: 8 },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  author: { color: '#fff', fontWeight: '800', fontSize: 14 },
  time: { color: 'rgba(255,255,255,0.7)', fontSize: 13 },
  caption: { color: '#fff', fontSize: 15, lineHeight: 21 },
});
