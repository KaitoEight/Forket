import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
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
import { StarRating } from '@/components/StarRating';
import { colors, radius } from '@/constants/theme';
import { signOut, useAuth } from '@/lib/auth';
import { countIncomingRequests } from '@/services/friendService';
import { deletePost, timeAgo } from '@/services/postService';
import {
  countFriends,
  fetchMyPosts,
  fetchMyReviews,
  type MyPost,
  type MyReview,
} from '@/services/profileService';

type Section = 'posts' | 'reviews';

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
  const [viewer, setViewer] = useState<MyPost | null>(null);

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
    Alert.alert('Xoá ảnh này?', 'Ảnh, lời nhắn và cảm xúc trên ảnh sẽ bị xoá vĩnh viễn.', [
      { text: 'Thôi', style: 'cancel' },
      {
        text: 'Xoá',
        style: 'destructive',
        onPress: async () => {
          try {
            await deletePost(post);
            setPosts((prev) => prev.filter((p) => p.id !== post.id));
            setViewer(null);
          } catch (e: any) {
            Alert.alert('Không xoá được', e?.message ?? String(e));
          }
        },
      },
    ]);

  const placesVisited = new Set(posts.map((p) => p.place?.id).filter(Boolean)).size;
  const tile = (width - 16 * 2 - 8 * 2) / 3;

  const openSettings = () =>
    Alert.alert(profile?.display_name ?? 'Tài khoản', `@${profile?.username ?? ''}`, [
      { text: 'Đóng', style: 'cancel' },
      { text: 'Đăng xuất', style: 'destructive', onPress: () => signOut() },
    ]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <View style={styles.brand}>
          <Ionicons name="leaf" size={20} color={colors.accent} />
          <Text style={styles.brandText}>Hồ sơ</Text>
        </View>
        <IconButton icon="settings-outline" label="Cài đặt" onPress={openSettings} />
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
            {profile && <Avatar name={profile.display_name} seed={profile.username} size={84} />}
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
          {reviews.length > 0 && (
            <View style={styles.tasteChip}>
              <Ionicons name="restaurant" size={13} color={colors.brown} />
              <Text style={styles.tasteText}>Đã đánh giá {reviews.length} quán</Text>
            </View>
          )}
        </View>

        <View style={styles.actions}>
          <Pressable
            style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}
            onPress={() => router.push('/camera')}
          >
            <Ionicons name="camera" size={18} color={colors.onAccent} />
            <Text style={styles.primaryText}>Check-in món mới</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressed]}
            onPress={() => router.push('/friends')}
          >
            <Ionicons name="person-add" size={17} color={colors.onAccent} />
            <Text style={styles.primaryText}>Thêm bạn</Text>
            {requests > 0 && (
              <View style={styles.reqBadge}>
                <Text style={styles.reqBadgeText}>{requests}</Text>
              </View>
            )}
          </Pressable>
        </View>

        {/* Chuyển giữa ảnh món ăn và đánh giá */}
        <View style={styles.segment}>
          <SegmentButton
            icon="grid"
            label={`Món đã check-in (${posts.length})`}
            active={section === 'posts'}
            onPress={() => setSection('posts')}
          />
          <SegmentButton
            icon="star"
            label={`Đánh giá (${reviews.length})`}
            active={section === 'reviews'}
            onPress={() => setSection('reviews')}
          />
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
              {posts.map((p) => (
                <Pressable
                  key={p.id}
                  style={[styles.tile, { width: tile, height: tile * 1.2 }]}
                  onPress={() => setViewer(p)}
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

      <Modal visible={!!viewer} transparent animationType="fade" onRequestClose={() => setViewer(null)}>
        <Pressable style={styles.viewer} onPress={() => setViewer(null)}>
          {viewer && (
            <>
              <Image source={{ uri: viewer.image_url }} style={styles.viewerImage} contentFit="contain" />
              <Text style={styles.viewerCaption}>
                {[viewer.place?.name, viewer.caption, timeAgo(viewer.created_at)].filter(Boolean).join(' · ')}
              </Text>
              <View style={styles.viewerActions}>
                <Pressable style={styles.viewerBtn} onPress={() => setViewer(null)}>
                  <Ionicons name="close" size={18} color="#fff" />
                  <Text style={styles.viewerBtnText}>Đóng</Text>
                </Pressable>
                <Pressable
                  style={[styles.viewerBtn, styles.viewerDelete]}
                  onPress={() => confirmDelete(viewer)}
                >
                  <Ionicons name="trash-outline" size={18} color="#fff" />
                  <Text style={styles.viewerBtnText}>Xoá ảnh</Text>
                </Pressable>
              </View>
            </>
          )}
        </Pressable>
      </Modal>
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

function SegmentButton({
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
    <Pressable style={[styles.segmentBtn, active && styles.segmentBtnActive]} onPress={onPress}>
      <Ionicons name={icon} size={15} color={active ? colors.accent : colors.textMuted} />
      <Text style={[styles.segmentText, active && styles.segmentTextActive]} numberOfLines={1}>
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
  actions: { flexDirection: 'row', gap: 10 },
  primaryBtn: {
    flex: 1.4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.accent,
    height: 50,
    borderRadius: 16,
  },
  secondaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.brown,
    height: 50,
    borderRadius: 16,
  },
  primaryText: { color: colors.onAccent, fontWeight: '800', fontSize: 15 },
  pressed: { opacity: 0.85 },
  reqBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    backgroundColor: colors.caramel,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reqBadgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  segment: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border },
  segmentBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
    marginBottom: -1,
  },
  segmentBtnActive: { borderBottomColor: colors.accent },
  segmentText: { color: colors.textMuted, fontWeight: '700', fontSize: 13 },
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
  viewer: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  viewerImage: { width: '100%', height: '70%' },
  viewerActions: { flexDirection: 'row', gap: 12 },
  viewerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 18,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  viewerDelete: { backgroundColor: colors.danger },
  viewerBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  viewerCaption: { color: '#fff', fontSize: 15, fontWeight: '700', paddingHorizontal: 24, textAlign: 'center' },
});
