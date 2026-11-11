import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  AppState,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { IconButton } from '@/components/IconButton';
import { colors, radius } from '@/constants/theme';
import { useKeyboardVisible } from '@/hooks/useKeyboardVisible';
import { useAuth } from '@/lib/auth';
import { sendMessage } from '@/services/chatService';
import {
  fetchPostById,
  fetchPosts,
  mergePosts,
  deletePost,
  subscribeToDeletedPosts,
  subscribeToNewPosts,
  timeAgo,
  type Post,
} from '@/services/postService';
import {
  QUICK_EMOJIS,
  subscribeToReactions,
  summarizeReactions,
  toggleReaction,
} from '@/services/reactionService';

type Burst = { id: number; emoji: string };

// Thanh trả lời và thanh "Hoạt động" cao bằng nhau → lướt qua lại không làm lệch trang ảnh
const ACTION_BAR_HEIGHT = 52;

export default function HistoryScreen() {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const meId = session?.user.id;
  const { width } = useWindowDimensions();
  const size = Math.min(width - 16, 520);
  const keyboard = useKeyboardVisible();

  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pageHeight, setPageHeight] = useState(0);
  const [footerHeight, setFooterHeight] = useState(0);
  const [newCount, setNewCount] = useState(0);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [bursts, setBursts] = useState<Burst[]>([]);
  const [toast, setToast] = useState<string | null>(null);

  const listRef = useRef<FlatList<Post>>(null);
  const pageIndex = useRef(0);
  const knownIds = useRef(new Set<string>());
  const burstId = useRef(0);

  useEffect(() => {
    knownIds.current = new Set(posts.map((p) => p.id));
  }, [posts]);

  const replacePost = (post: Post) =>
    setPosts((prev) => prev.map((p) => (p.id === post.id ? post : p)));

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetchPosts()
        .then((data) => !cancelled && setPosts((prev) => mergePosts(prev, data)))
        .catch((e) => !cancelled && setError(e?.message ?? String(e)));
    load().finally(() => !cancelled && setLoading(false));

    // Ảnh mới của bạn bè hiện ngay lập tức
    const unsubPosts = subscribeToNewPosts((post) => {
      if (cancelled || knownIds.current.has(post.id)) return;
      knownIds.current.add(post.id);
      if (pageIndex.current > 0) setNewCount((n) => n + 1);
      setPosts((prev) => mergePosts(prev, [post]));
      setError(null);
    });

    // Có người thả cảm xúc → cập nhật ảnh đó
    const unsubReactions = subscribeToReactions((postId) => {
      if (cancelled || !knownIds.current.has(postId)) return;
      fetchPostById(postId)
        .then((p) => p && !cancelled && replacePost(p))
        .catch(() => {});
    });

    // Bạn bè xoá ảnh → gỡ khỏi bảng tin ngay
    const unsubDeleted = subscribeToDeletedPosts((postId) => {
      if (!cancelled) setPosts((prev) => prev.filter((p) => p.id !== postId));
    });

    // Quay lại app từ nền → tải lại (phòng khi realtime bị ngắt lúc app ngủ)
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') load();
    });

    return () => {
      cancelled = true;
      unsubPosts();
      unsubReactions();
      unsubDeleted();
      appState.remove();
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 1800);
    return () => clearTimeout(t);
  }, [toast]);

  const currentPost = posts.find((p) => p.id === currentId) ?? posts[0];

  const scrollToTop = () => {
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
    pageIndex.current = 0;
    setCurrentId(posts[0]?.id ?? null);
    setNewCount(0);
  };

  const retry = async () => {
    setLoading(true);
    try {
      setPosts(await fetchPosts());
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  };

  const react = async (post: Post, emoji: string) => {
    if (!meId) return;
    const already = post.reactions.some((r) => r.user_id === meId && r.emoji === emoji);
    if (!already) setBursts((b) => [...b, { id: ++burstId.current, emoji }]);

    // Cập nhật ngay trên màn hình, gửi lên server sau
    replacePost({
      ...post,
      reactions: already
        ? post.reactions.filter((r) => !(r.user_id === meId && r.emoji === emoji))
        : [...post.reactions, { emoji, user_id: meId, user: null }],
    });
    try {
      await toggleReaction(post.id, emoji, already);
    } catch (e: any) {
      replacePost(post);
      Alert.alert('Không thả cảm xúc được', e?.message ?? String(e));
    }
  };

  const reply = async (post: Post, text: string) => {
    if (!post.author) return false;
    try {
      await sendMessage(post.author.id, text, post.id);
      setToast(`Đã gửi cho ${post.author.display_name} ✓`);
      return true;
    } catch (e: any) {
      Alert.alert('Không gửi được tin nhắn', e?.message ?? String(e));
      return false;
    }
  };

  const removePost = (post: Post) =>
    Alert.alert('Xoá ảnh này?', 'Ảnh, lời nhắn và cảm xúc trên ảnh sẽ bị xoá vĩnh viễn.', [
      { text: 'Thôi', style: 'cancel' },
      {
        text: 'Xoá',
        style: 'destructive',
        onPress: async () => {
          try {
            await deletePost(post);
            const idx = posts.findIndex((p) => p.id === post.id);
            const next = posts[idx + 1] ?? posts[idx - 1] ?? null;
            setPosts((prev) => prev.filter((p) => p.id !== post.id));
            setCurrentId(next?.id ?? null);
            pageIndex.current = Math.max(0, Math.min(idx, posts.length - 2));
            setToast('Đã xoá ảnh');
          } catch (e: any) {
            Alert.alert('Không xoá được', e?.message ?? String(e));
          }
        },
      },
    ]);

  const showActivity = (post: Post) => {
    if (post.reactions.length === 0) return;
    const lines = post.reactions.map((r) => `${r.emoji}  ${r.user?.display_name ?? 'Bạn bè'}`);
    Alert.alert('Hoạt động', lines.join('\n'));
  };

  const renderBody = () => {
    if (loading) return <ActivityIndicator color={colors.text} style={styles.flex} />;
    if (error || posts.length === 0) {
      return (
        <View style={styles.empty}>
          <Text style={styles.emptyEmoji}>{error ? '😵' : '🍜'}</Text>
          <Text style={styles.emptyText}>
            {error
              ? `Không tải được: ${error}`
              : 'Chưa có ảnh nào. Chụp món đầu tiên, hoặc kết bạn để xem ảnh của bạn bè!'}
          </Text>
          <Pressable style={styles.retryBtn} onPress={error ? retry : () => router.push('/camera')}>
            <Text style={styles.retryText}>{error ? 'Thử lại' : 'Check-in món đầu tiên'}</Text>
          </Pressable>
        </View>
      );
    }
    if (pageHeight === 0) return null;

    return (
      <FlatList
        ref={listRef}
        data={posts}
        keyExtractor={(p) => p.id}
        pagingEnabled
        keyboardShouldPersistTaps="handled"
        // Có ảnh mới chèn lên đầu: giữ nguyên ảnh đang xem (trừ khi đang ở ảnh đầu tiên)
        maintainVisibleContentPosition={{
          minIndexForVisible: 0,
          autoscrollToTopThreshold: pageHeight / 2,
        }}
        onMomentumScrollEnd={(e) => {
          const idx = Math.round(e.nativeEvent.contentOffset.y / pageHeight);
          pageIndex.current = idx;
          setCurrentId(posts[idx]?.id ?? null);
          if (idx === 0) setNewCount(0);
        }}
        showsVerticalScrollIndicator={false}
        getItemLayout={(_, index) => ({ length: pageHeight, offset: pageHeight * index, index })}
        renderItem={({ item }) => (
          <PostPage
            post={item}
            size={size}
            height={pageHeight}
            meId={meId}
            onPressReactions={() => showActivity(item)}
            onDelete={() => removePost(item)}
          />
        )}
      />
    );
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <View style={styles.brand}>
          <Ionicons name="leaf" size={20} color={colors.accent} />
          <Text style={styles.title}>Bảng tin</Text>
        </View>
        <IconButton icon="person-add-outline" label="Thêm bạn" onPress={() => router.push('/friends')} />
      </View>

      <View
        style={styles.flex}
        onLayout={(e) => setPageHeight(e.nativeEvent.layout.height)}
      >
        {renderBody()}

        {newCount > 0 && (
          <Pressable style={styles.newPill} onPress={scrollToTop}>
            <Ionicons name="arrow-up" size={14} color={colors.onAccent} />
            <Text style={styles.newPillText}>{newCount} ảnh mới</Text>
          </Pressable>
        )}

        {/* Hiệu ứng emoji bay lên khi thả cảm xúc */}
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          {bursts.map((b) => (
            <EmojiBurst
              key={b.id}
              emoji={b.emoji}
              onDone={() => setBursts((list) => list.filter((x) => x.id !== b.id))}
            />
          ))}
        </View>

        {toast && (
          <View style={styles.toast} pointerEvents="none">
            <Text style={styles.toastText}>{toast}</Text>
          </View>
        )}
      </View>

      {/* Chừa chỗ cho thanh dưới (thanh dưới nổi lên khi mở bàn phím, danh sách ảnh giữ nguyên) */}
      <View style={{ height: footerHeight }} />

      <KeyboardAvoidingView behavior="padding" style={styles.footerWrap} pointerEvents="box-none">
        <View
          style={styles.footer}
          onLayout={(e) => {
            if (!keyboard.visible) setFooterHeight(e.nativeEvent.layout.height);
          }}
        >
          {currentPost && !loading && !error ? (
            <ActionBar
              key={currentPost.id}
              post={currentPost}
              meId={meId}
              keyboardOpen={keyboard.visible}
              onReact={(emoji) => react(currentPost, emoji)}
              onReply={(text) => reply(currentPost, text)}
              onShowActivity={() => showActivity(currentPost)}
              onDelete={() => removePost(currentPost)}
            />
          ) : (
            <View style={styles.actionPlaceholder} />
          )}
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

function PostPage({
  post,
  size,
  height,
  meId,
  onPressReactions,
  onDelete,
}: {
  post: Post;
  size: number;
  height: number;
  meId: string | undefined;
  onPressReactions: () => void;
  onDelete: () => void;
}) {
  const isMine = post.author?.id === meId;
  const authorName = isMine ? 'Bạn' : (post.author?.display_name ?? 'Ai đó');
  const summary = summarizeReactions(post.reactions, meId);

  return (
    <Pressable
      style={[styles.page, { height }]}
      onPress={Keyboard.dismiss}
      // Ảnh của mình: nhấn giữ để xoá
      onLongPress={isMine ? onDelete : undefined}
      delayLongPress={450}
      accessible={false}
    >
      <View style={[styles.photo, { width: size, height: size }]}>
        <Image
          source={{ uri: post.image_url }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={200}
        />
        {post.caption ? (
          <View style={styles.captionPill}>
            <Text style={styles.captionText}>{post.caption}</Text>
          </View>
        ) : null}
        {isMine && (
          <Pressable
            style={styles.photoMore}
            hitSlop={8}
            accessibilityLabel="Tuỳ chọn ảnh"
            onPress={() =>
              Alert.alert('Ảnh của bạn', undefined, [
                { text: 'Xoá ảnh này', style: 'destructive', onPress: onDelete },
                { text: 'Đóng', style: 'cancel' },
              ])
            }
          >
            <Ionicons name="ellipsis-horizontal" size={18} color={colors.onPhoto} />
          </Pressable>
        )}
        {summary.length > 0 && (
          <Pressable style={styles.reactionChip} onPress={onPressReactions}>
            <Text style={styles.reactionChipText}>
              {summary
                .slice(0, 3)
                .map((s) => s.emoji)
                .join('')}{' '}
              {post.reactions.length}
            </Text>
          </Pressable>
        )}
      </View>

      <View style={styles.meta}>
        {post.author && <Avatar name={post.author.display_name} seed={post.author.username} size={24} />}
        <Text style={styles.author} numberOfLines={1}>
          {authorName}
        </Text>
        <Text style={styles.dot}>·</Text>
        {post.place ? (
          <>
            <Ionicons name="location" size={14} color={colors.accent} />
            <Text style={styles.placeName} numberOfLines={1}>
              {post.place.name}
            </Text>
            <Text style={styles.dot}>·</Text>
          </>
        ) : null}
        <Text style={styles.time}>{timeAgo(post.created_at)}</Text>
      </View>
    </Pressable>
  );
}

/** Thanh dưới: ảnh của bạn bè → trả lời + thả cảm xúc; ảnh của mình → xem hoạt động */
function ActionBar({
  post,
  meId,
  keyboardOpen,
  onReact,
  onReply,
  onShowActivity,
  onDelete,
}: {
  post: Post;
  meId: string | undefined;
  keyboardOpen: boolean;
  onReact: (emoji: string) => void;
  onReply: (text: string) => Promise<boolean>;
  onShowActivity: () => void;
  onDelete: () => void;
}) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  if (post.author?.id === meId) {
    const summary = summarizeReactions(post.reactions, meId);
    return (
      <View style={styles.mineRow}>
        <Pressable style={styles.activityPill} onPress={onShowActivity}>
          <Ionicons name="sparkles" size={16} color={colors.accent} />
          <Text style={styles.activityText} numberOfLines={1}>
            {summary.length === 0
              ? 'Chưa có hoạt động nào'
              : summary.map((s) => `${s.emoji} ${s.count}`).join('   ')}
          </Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.deleteBtn, pressed && styles.dim]}
          accessibilityLabel="Xoá ảnh này"
          onPress={onDelete}
        >
          <Ionicons name="trash-outline" size={20} color={colors.danger} />
        </Pressable>
      </View>
    );
  }

  const submit = async () => {
    if (!text.trim() || sending) return;
    setSending(true);
    const ok = await onReply(text);
    setSending(false);
    if (ok) {
      setText('');
      Keyboard.dismiss();
    }
  };

  const showEmojis = !keyboardOpen && !text;
  return (
    <View style={styles.replyPill}>
      <TextInput
        style={styles.replyInput}
        value={text}
        onChangeText={setText}
        placeholder={`Trả lời ${post.author?.display_name ?? ''}…`}
        placeholderTextColor={colors.textMuted}
        maxLength={1000}
        returnKeyType="send"
        onSubmitEditing={submit}
        submitBehavior="submit"
      />
      {showEmojis ? (
        QUICK_EMOJIS.map((emoji) => {
          const mine = post.reactions.some((r) => r.user_id === meId && r.emoji === emoji);
          return (
            <Pressable
              key={emoji}
              hitSlop={4}
              accessibilityLabel={`Thả ${emoji}`}
              style={[styles.emojiBtn, mine && styles.emojiBtnActive]}
              onPress={() => onReact(emoji)}
            >
              <Text style={styles.emoji}>{emoji}</Text>
            </Pressable>
          );
        })
      ) : (
        <Pressable
          accessibilityLabel="Gửi tin nhắn"
          style={[styles.sendBtn, (!text.trim() || sending) && styles.dim]}
          onPress={submit}
          disabled={!text.trim() || sending}
        >
          {sending ? (
            <ActivityIndicator size="small" color={colors.onAccent} />
          ) : (
            <Ionicons name="arrow-up" size={18} color={colors.onAccent} />
          )}
        </Pressable>
      )}
    </View>
  );
}

/** Vài emoji bay lên rồi mờ dần */
function EmojiBurst({ emoji, onDone }: { emoji: string; onDone: () => void }) {
  const [particles] = useState(() =>
    Array.from({ length: 6 }, () => ({
      progress: new Animated.Value(0),
      x: (Math.random() - 0.5) * 220,
      rise: 180 + Math.random() * 160,
      delay: Math.random() * 180,
      size: 30 + Math.random() * 18,
    }))
  );

  useEffect(() => {
    Animated.parallel(
      particles.map((p) =>
        Animated.timing(p.progress, {
          toValue: 1,
          duration: 1100,
          delay: p.delay,
          useNativeDriver: true,
        })
      )
    ).start(() => onDone());
    // Chỉ chạy 1 lần khi xuất hiện
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      {particles.map((p, i) => (
        <Animated.Text
          key={i}
          style={[
            styles.burst,
            {
              fontSize: p.size,
              opacity: p.progress.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 1, 0] }),
              transform: [
                { translateX: p.x },
                { translateY: p.progress.interpolate({ inputRange: [0, 1], outputRange: [0, -p.rise] }) },
                { scale: p.progress.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0.4, 1.2, 1] }) },
              ],
            },
          ]}
        >
          {emoji}
        </Animated.Text>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { color: colors.text, fontSize: 22, fontWeight: '900' },
  page: { alignItems: 'center', justifyContent: 'center', gap: 14 },
  photo: {
    borderRadius: radius.viewfinder,
    borderCurve: 'continuous',
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  captionPill: {
    position: 'absolute',
    bottom: 20,
    alignSelf: 'center',
    maxWidth: '85%',
    backgroundColor: colors.overlay,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: radius.pill,
  },
  captionText: { color: colors.onPhoto, fontSize: 16, fontWeight: '700', textAlign: 'center' },
  reactionChip: {
    position: 'absolute',
    top: 16,
    right: 16,
    backgroundColor: colors.overlay,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  reactionChipText: { color: colors.onPhoto, fontWeight: '800', fontSize: 14 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 24 },
  author: { color: colors.text, fontWeight: '800', fontSize: 15, flexShrink: 0, maxWidth: 140 },
  placeName: { color: colors.text, fontWeight: '700', fontSize: 15, flexShrink: 1 },
  dot: { color: colors.textMuted },
  time: { color: colors.textMuted, fontSize: 15 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },
  emptyEmoji: { fontSize: 48 },
  emptyText: { color: colors.textMuted, fontSize: 15, textAlign: 'center' },
  retryBtn: {
    backgroundColor: colors.accent,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: radius.pill,
  },
  retryText: { color: colors.onAccent, fontWeight: '800' },
  newPill: {
    position: 'absolute',
    top: 8,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.accent,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.pill,
  },
  newPillText: { color: colors.onAccent, fontWeight: '800', fontSize: 13 },
  burst: { position: 'absolute', alignSelf: 'center', bottom: '30%' },
  toast: {
    position: 'absolute',
    bottom: 12,
    alignSelf: 'center',
    backgroundColor: colors.surfaceHigh,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radius.pill,
  },
  toastText: { color: colors.text, fontWeight: '700' },
  footerWrap: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  footer: { alignItems: 'center', paddingTop: 8, paddingBottom: 12, backgroundColor: colors.bg },
  replyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginHorizontal: 16,
    alignSelf: 'stretch',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingLeft: 16,
    paddingRight: 6,
    height: ACTION_BAR_HEIGHT,
  },
  replyInput: { flex: 1, color: colors.text, fontSize: 15, height: '100%' },
  emojiBtn: { width: 36, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20 },
  emojiBtnActive: { backgroundColor: colors.surfaceHigh },
  emoji: { fontSize: 22 },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dim: { opacity: 0.5 },
  mineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    alignSelf: 'stretch',
    marginHorizontal: 16,
  },
  activityPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: 18,
    height: ACTION_BAR_HEIGHT,
  },
  deleteBtn: {
    width: ACTION_BAR_HEIGHT,
    height: ACTION_BAR_HEIGHT,
    borderRadius: ACTION_BAR_HEIGHT / 2,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoMore: {
    position: 'absolute',
    top: 16,
    left: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionPlaceholder: { height: ACTION_BAR_HEIGHT },
  activityText: { color: colors.text, fontWeight: '700', fontSize: 15 },
});
