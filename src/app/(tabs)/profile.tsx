import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { IconButton } from '@/components/IconButton';
import { MustTryButton } from '@/components/MustTryButton';
import { NotificationBell } from '@/components/NotificationBell';
import { PhotoViewer } from '@/components/PhotoViewer';
import { PlaceRow } from '@/components/PlaceRow';
import { StarRating } from '@/components/StarRating';
import { colors, radius, statusBarStyle } from '@/constants/theme';
import { usePlacesByIds } from '@/hooks/usePlacesByIds';
import { useAuth } from '@/lib/auth';
import { useMustTryIds } from '@/services/mustTryService';
import { countIncomingRequests } from '@/services/friendService';
import { deletePost, timeAgo } from '@/services/postService';
import {
  countFriends,
  fetchMyPosts,
  fetchMyReviews,
  type MyPost,
  type MyReview,
} from '@/services/profileService';
import { appAlert } from '@/lib/appAlert';

type Section = 'posts' | 'saved' | 'reviews';

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { profile } = useAuth();

  const [posts, setPosts] = useState<MyPost[]>([]);
  const [reviews, setReviews] = useState<MyReview[]>([]);
  const [friends, setFriends] = useState(0);
  const [requests, setRequests] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [section, setSection] = useState<Section>('posts');
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const savedIds = useMustTryIds();
  const saved = usePlacesByIds(savedIds);

  const load = useCallback(async () => {
    const [p, r, f, q] = await Promise.allSettled([
      fetchMyPosts(),
      fetchMyReviews(),
      countFriends(),
      countIncomingRequests(),
    ]);
    if (p.status === 'fulfilled') setPosts(p.value);
    if (r.status === 'fulfilled') setReviews(r.value);
    if (f.status === 'fulfilled') setFriends(f.value);
    if (q.status === 'fulfilled') setRequests(q.value);
  }, []);

  // Mỗi lần mở tab Hồ sơ → cập nhật (vừa check-in món mới, vừa kết bạn…)
  useFocusEffect(
    useCallback(() => {
      let active = true;
      load().finally(() => active && setLoading(false));
      return () => {
        active = false;
      };
    }, [load])
  );

  const confirmDelete = (post: MyPost) =>
    appAlert('Xoá ảnh này?', 'Ảnh, lời nhắn và cảm xúc trên ảnh sẽ bị xoá vĩnh viễn.', [
      { text: 'Thôi', style: 'cancel' },
      {
        text: 'Xoá',
        style: 'destructive',
        onPress: async () => {
          try {
            await deletePost(post);
            setPosts((prev) => prev.filter((p) => p.id !== post.id));
            setViewerIndex(null);
          } catch (e: any) {
            appAlert('Không xoá được', e?.message ?? String(e));
          }
        },
      },
    ]);

  const placesVisited = new Set(posts.map((p) => p.place?.id).filter(Boolean)).size;
  const tile = (width - 16 * 2 - 8 * 2) / 3;


  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <StatusBar style={statusBarStyle} />
      <View style={styles.header}>
        <View style={styles.brand}>
          <Ionicons name="leaf" size={20} color={colors.accent} />
          <Text style={styles.brandText}>Hồ sơ</Text>
        </View>
        <View style={styles.headerActions}>
          <NotificationBell />
          <IconButton
            icon="person-add-outline"
            label="Thêm bạn"
            badge={requests}
            onPress={() => router.push('/friends')}
          />
          <IconButton icon="settings-outline" label="Cài đặt" onPress={() => router.push('/settings')} />
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={colors.accent}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
          />
        }
      >
        {/* Ảnh đại diện + chỉ số */}
        <View style={styles.top}>
          <View style={styles.avatarRing}>
            {profile && (
              <Avatar name={profile.display_name} seed={profile.username} uri={profile.avatar_url} size={84} />
            )}
          </View>
          <View style={styles.stats}>
            <Stat value={placesVisited} label="Quán đã đi" />
            <Stat value={posts.length} label="Món check-in" />
            <Stat value={friends} label="Bạn bè" onPress={() => router.push('/friends')} />
          </View>
        </View>

        <View style={styles.identity}>
          <Text style={styles.name}>{profile?.display_name}</Text>
          <Text style={styles.username}>@{profile?.username}</Text>
          {profile?.bio ? (
            <Text style={styles.bio}>{profile.bio}</Text>
          ) : (
            <Pressable onPress={() => router.push('/settings/profile')} hitSlop={6}>
              <Text style={styles.addBio}>+ Thêm bio</Text>
            </Pressable>
          )}
          {profile?.share_activity === false && (
            <View style={styles.privateChip}>
              <Ionicons name="eye-off" size={13} color={colors.textMuted} />
              <Text style={styles.privateText}>Chế độ riêng tư: bạn bè không thấy hoạt động của bạn</Text>
            </View>
          )}
          {reviews.length > 0 && (
            <View style={styles.tasteChip}>
              <Ionicons name="restaurant" size={13} color={colors.brown} />
              <Text style={styles.tasteText}>Đã đánh giá {reviews.length} quán</Text>
            </View>
          )}
        </View>

        <Pressable
          style={({ pressed }) => [styles.wrappedBtn, pressed && styles.pressed]}
          onPress={() => router.push('/wrapped')}
        >
          <Ionicons name="sparkles" size={16} color={colors.caramel} />
          <Text style={styles.wrappedText}>Tổng kết {new Date().getFullYear()} của bạn</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </Pressable>

        {/* Chuyển giữa ảnh món ăn, quán đã lưu và đánh giá */}
        <View style={styles.segment}>
          <SegmentButton label="Món đã check-in" active={section === 'posts'} onPress={() => setSection('posts')} />
          <SegmentButton label="Quán đã lưu" active={section === 'saved'} onPress={() => setSection('saved')} />
          <SegmentButton label="Đánh giá" active={section === 'reviews'} onPress={() => setSection('reviews')} />
        </View>

        {loading ? (
          <ActivityIndicator color={colors.accent} style={styles.loader} />
        ) : section === 'posts' ? (
          posts.length === 0 ? (
            <Empty
              emoji="🍜"
              text="Chưa có món nào. Bấm Check-in để chụp món đầu tiên!"
            />
          ) : (
            <View style={styles.grid}>
              {posts.map((p, i) => (
                <Pressable
                  key={p.id}
                  style={[styles.tile, { width: tile, height: tile * 1.2 }]}
                  onPress={() => setViewerIndex(i)}
                  onLongPress={() => confirmDelete(p)}
                  delayLongPress={450}
                >
                  <Image
                    source={{ uri: p.thumb_url ?? p.image_url }}
                    style={StyleSheet.absoluteFill}
                    contentFit="cover"
                    transition={150}
                  />
                  <View style={styles.tileShade} />
                  <Text style={styles.tileText} numberOfLines={2}>
                    {p.place?.name ?? timeAgo(p.created_at)}
                  </Text>
                </Pressable>
              ))}
            </View>
          )
        ) : section === 'saved' ? (
          saved.loading ? (
            <ActivityIndicator color={colors.accent} style={styles.loader} />
          ) : saved.rows.length === 0 ? (
            <Empty
              emoji="❤️"
              text="Chưa lưu quán nào. Bấm trái tim trên thẻ quán ở Bản đồ để lưu quán yêu thích. Lắc máy ở tab Bản đồ sẽ chọn giúp bạn hôm nay ăn gì!"
            />
          ) : (
            <View>
              {saved.rows.map((place) => (
                <PlaceRow key={place.id} place={place} action={<MustTryButton placeId={place.id} compact />} />
              ))}
            </View>
          )
        ) : reviews.length === 0 ? (
          <Empty emoji="⭐" text="Chưa đánh giá quán nào. Mở quán trên bản đồ để chấm điểm nhé." />
        ) : (
          <View style={styles.reviewList}>
            {reviews.map((r) => (
              <View key={r.id} style={styles.reviewCard}>
                <View style={styles.reviewTop}>
                  <Text style={styles.reviewPlace} numberOfLines={1}>
                    {r.place?.name ?? 'Quán đã xoá'}
                  </Text>
                  <Text style={styles.reviewTime}>{timeAgo(r.updated_at)}</Text>
                </View>
                <StarRating value={r.rating} size={15} />
                {r.comment ? <Text style={styles.reviewComment}>{r.comment}</Text> : null}
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <PhotoViewer
        photos={posts}
        index={viewerIndex}
        onClose={() => setViewerIndex(null)}
        footer={(photo) => {
          const post = posts.find((x) => x.id === photo.id);
          if (!post) return null;
          return (
            <View style={styles.viewerFooter}>
              <Text style={styles.viewerCaption} numberOfLines={2}>
                {[post.place?.name, timeAgo(post.created_at)].filter(Boolean).join(' · ')}
              </Text>
              <Pressable
                style={styles.viewerDelete}
                accessibilityLabel="Xoá ảnh"
                onPress={() => {
                  // Đóng bảng xem ảnh trước, để hộp xác nhận không bị nằm dưới Modal
                  setViewerIndex(null);
                  setTimeout(() => confirmDelete(post), 300);
                }}
              >
                <Ionicons name="trash-outline" size={18} color="#fff" />
                <Text style={styles.viewerBtnText}>Xoá ảnh</Text>
              </Pressable>
            </View>
          );
        }}
      />
    </View>
  );
}

function Stat({ value, label, onPress }: { value: number; label: string; onPress?: () => void }) {
  return (
    <Pressable style={styles.stat} onPress={onPress} disabled={!onPress}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </Pressable>
  );
}

function SegmentButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable style={[styles.segmentBtn, active && styles.segmentBtnActive]} onPress={onPress}>
      <Text
        style={[styles.segmentText, active && styles.segmentTextActive]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.8}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function Empty({ emoji, text }: { emoji: string; text: string }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyEmoji}>{emoji}</Text>
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerActions: { flexDirection: 'row', gap: 8 },
  bio: { color: colors.text, fontSize: 14, lineHeight: 20, marginTop: 4 },
  addBio: { color: colors.accent, fontSize: 14, fontWeight: '700', marginTop: 4 },
  privateChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: colors.surfaceHigh,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    marginTop: 4,
  },
  privateText: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  brandText: { color: colors.text, fontSize: 22, fontWeight: '900' },
  content: { padding: 16, gap: 16, paddingBottom: 32 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatarRing: {
    padding: 4,
    borderRadius: 50,
    borderWidth: 3,
    borderColor: colors.accent,
  },
  stats: { flex: 1, flexDirection: 'row', gap: 8 },
  stat: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    paddingVertical: 12,
    gap: 2,
  },
  statValue: { color: colors.text, fontSize: 20, fontWeight: '900' },
  statLabel: { color: colors.textMuted, fontSize: 11, fontWeight: '600', textAlign: 'center' },
  identity: { gap: 4 },
  name: { color: colors.text, fontSize: 22, fontWeight: '900' },
  username: { color: colors.textMuted, fontSize: 14 },
  tasteChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: colors.caramelSoft,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    marginTop: 4,
  },
  tasteText: { color: colors.brown, fontSize: 12, fontWeight: '700' },
  pressed: { opacity: 0.85 },
  wrappedBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 10,
    paddingHorizontal: 14,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.caramelSoft,
  },
  wrappedText: { flex: 1, color: colors.brown, fontWeight: '800', fontSize: 14 },
  segment: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border },
  segmentBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    paddingVertical: 12,
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
    marginBottom: -1,
  },
  segmentBtnActive: { borderBottomColor: colors.accent },
  segmentText: { color: colors.textMuted, fontWeight: '700', fontSize: 13, textAlign: 'center' },
  segmentTextActive: { color: colors.accent },
  loader: { marginTop: 24 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: { borderRadius: 16, overflow: 'hidden', backgroundColor: colors.surfaceHigh, justifyContent: 'flex-end' },
  tileShade: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(0,0,0,0.18)' },
  tileText: {
    color: colors.onPhoto,
    fontWeight: '800',
    fontSize: 12,
    padding: 8,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowRadius: 4,
  },
  reviewList: { gap: 10 },
  reviewCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 14,
    gap: 6,
  },
  reviewTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  reviewPlace: { flex: 1, color: colors.text, fontWeight: '800', fontSize: 15 },
  reviewTime: { color: colors.textMuted, fontSize: 12 },
  reviewComment: { color: colors.text, fontSize: 14, lineHeight: 20 },
  empty: { alignItems: 'center', gap: 8, paddingVertical: 32 },
  emptyEmoji: { fontSize: 44 },
  emptyText: { color: colors.textMuted, fontSize: 14, textAlign: 'center', lineHeight: 20 },
  viewerFooter: { gap: 10, alignItems: 'flex-start' },
  viewerCaption: { color: '#fff', fontSize: 15, fontWeight: '700' },
  viewerDelete: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 18,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.danger,
  },
  viewerBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
});
