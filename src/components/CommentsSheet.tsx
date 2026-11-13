import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { colors, radius } from '@/constants/theme';
import { appAlert } from '@/lib/appAlert';
import { askReport } from '@/lib/report';
import {
  addComment,
  deleteComment,
  fetchComments,
  subscribeToComments,
  type Comment,
} from '@/services/commentService';
import { timeAgo } from '@/services/postService';

type Props = {
  postId: string;
  /** Chủ ảnh (được xoá mọi bình luận dưới ảnh của mình) */
  postOwnerId: string | undefined;
  meId: string | undefined;
  onClose: () => void;
  /** Số bình luận thay đổi → cập nhật số trên ảnh */
  onCountChange: (postId: string, count: number) => void;
};

/** Khung bình luận dưới 1 ảnh (kéo từ dưới lên) */
export function CommentsSheet({ postId, postOwnerId, meId, onClose, onCountChange }: Props) {
  const insets = useSafeAreaInsets();
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList<Comment>>(null);

  useEffect(() => {
    let active = true;
    const load = () =>
      fetchComments(postId)
        .then((list) => {
          if (!active) return;
          setComments(list);
          setError(null);
        })
        .catch((e) => active && setError(e?.message ?? String(e)));
    load();
    const unsubscribe = subscribeToComments((id) => {
      if (id === postId) load();
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [postId]);

  // Báo số bình luận cho màn hình bên dưới (nơi gọi bỏ qua giá trị không đổi)
  const count = comments?.length;
  useEffect(() => {
    if (count !== undefined) onCountChange(postId, count);
  }, [count, postId, onCountChange]);

  const send = async () => {
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      const c = await addComment(postId, text);
      setComments((prev) => (prev?.some((x) => x.id === c.id) ? prev : [...(prev ?? []), c]));
      setText('');
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
    } catch (e: any) {
      appAlert('Không gửi được', e?.message ?? String(e));
    } finally {
      setSending(false);
    }
  };

  const options = (c: Comment) => {
    const mine = c.user_id === meId;
    const canDelete = mine || postOwnerId === meId;
    appAlert(c.author?.display_name ?? 'Bình luận', c.body, [
      ...(canDelete
        ? [
            {
              text: 'Xoá bình luận',
              icon: 'trash-outline' as const,
              style: 'destructive' as const,
              onPress: async () => {
                try {
                  await deleteComment(c.id);
                  setComments((prev) => (prev ?? []).filter((x) => x.id !== c.id));
                } catch (e: any) {
                  appAlert('Không xoá được', e?.message ?? String(e));
                }
              },
            },
          ]
        : []),
      ...(!mine
        ? [
            {
              text: 'Báo cáo bình luận',
              icon: 'flag-outline' as const,
              onPress: () => askReport({ commentId: c.id, userId: c.user_id }, 'bình luận này'),
            },
          ]
        : []),
      { text: 'Đóng', style: 'cancel' as const },
    ]);
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.backdrop} behavior="padding">
        <Pressable style={styles.flex} onPress={onClose} accessibilityLabel="Đóng bình luận" />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 10 }]}>
          <View style={styles.handle} />
          <Text style={styles.title}>Bình luận</Text>

          {error ? (
            <Text style={styles.empty}>{error}</Text>
          ) : comments === null ? (
            <ActivityIndicator color={colors.accent} style={styles.loader} />
          ) : (
            <FlatList
              ref={listRef}
              data={comments}
              keyExtractor={(c) => c.id}
              style={styles.list}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={<Text style={styles.empty}>Chưa có bình luận nào. Viết bình luận đầu tiên nhé!</Text>}
              renderItem={({ item }) => (
                <Pressable
                  style={styles.row}
                  onLongPress={() => options(item)}
                  delayLongPress={350}
                  accessibilityHint="Nhấn giữ để xoá hoặc báo cáo"
                >
                  <Avatar
                    name={item.author?.display_name ?? '?'}
                    seed={item.author?.username ?? item.user_id}
                    uri={item.author?.avatar_url}
                    size={32}
                  />
                  <View style={styles.flex}>
                    <Text style={styles.meta}>
                      <Text style={styles.name}>{item.user_id === meId ? 'Bạn' : (item.author?.display_name ?? 'Ai đó')}</Text>
                      {'  '}
                      {timeAgo(item.created_at)}
                    </Text>
                    <Text style={styles.body}>{item.body}</Text>
                  </View>
                  <Pressable hitSlop={8} onPress={() => options(item)} accessibilityLabel="Tuỳ chọn bình luận">
                    <Ionicons name="ellipsis-horizontal" size={16} color={colors.textMuted} />
                  </Pressable>
                </Pressable>
              )}
            />
          )}

          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              value={text}
              onChangeText={setText}
              placeholder="Viết bình luận…"
              placeholderTextColor={colors.textMuted}
              maxLength={500}
              returnKeyType="send"
              onSubmitEditing={send}
              submitBehavior="submit"
            />
            <Pressable
              style={[styles.sendBtn, (!text.trim() || sending) && styles.dim]}
              onPress={send}
              disabled={!text.trim() || sending}
              accessibilityLabel="Gửi bình luận"
            >
              {sending ? (
                <ActivityIndicator size="small" color={colors.onAccent} />
              ) : (
                <Ionicons name="arrow-up" size={18} color={colors.onAccent} />
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  backdrop: { flex: 1, backgroundColor: colors.overlay },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 10,
    paddingHorizontal: 16,
    height: '65%',
    gap: 10,
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
  },
  handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: colors.border },
  title: { color: colors.text, fontSize: 18, fontWeight: '800' },
  loader: { marginTop: 24 },
  list: { flex: 1 },
  empty: { color: colors.textMuted, fontSize: 14, textAlign: 'center', paddingVertical: 28, paddingHorizontal: 16 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 8 },
  meta: { color: colors.textMuted, fontSize: 12 },
  name: { color: colors.text, fontWeight: '800', fontSize: 13 },
  body: { color: colors.text, fontSize: 15, lineHeight: 20, marginTop: 1 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: {
    flex: 1,
    height: 46,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 16,
    color: colors.text,
    fontSize: 15,
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dim: { opacity: 0.5 },
});
