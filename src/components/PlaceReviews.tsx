import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { StarRating } from '@/components/StarRating';
import { colors, radius } from '@/constants/theme';
import { timeAgo } from '@/services/postService';
import { deleteMyReview, fetchReviews, saveReview, subscribeToReviews, type Review } from '@/services/reviewService';
import { appAlert } from '@/lib/appAlert';

type Props = {
  placeId: string;
  meId: string | undefined;
  /** Báo điểm trung bình + số đánh giá mới để cập nhật thẻ quán / marker */
  onStatsChange?: (avg: number | null, count: number) => void;
};

function stats(list: Review[]) {
  if (list.length === 0) return { avg: null, count: 0 };
  const avg = list.reduce((sum, r) => sum + r.rating, 0) / list.length;
  return { avg: Math.round(avg * 10) / 10, count: list.length };
}

export function PlaceReviews({ placeId, meId, onStatsChange }: Props) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);

  const mine = reviews.find((r) => r.user_id === meId);
  const others = reviews.filter((r) => r.user_id !== meId);

  const applyList = (list: Review[]) => {
    setReviews(list);
    const s = stats(list);
    onStatsChange?.(s.avg, s.count);
  };

  useEffect(() => {
    let cancelled = false;
    fetchReviews(placeId)
      .then((list) => {
        if (cancelled) return;
        setReviews(list);
        const my = list.find((r) => r.user_id === meId);
        setRating(my?.rating ?? 0);
        setComment(my?.comment ?? '');
        setEditing(!my);
      })
      .catch((e) => console.warn('Không tải được đánh giá:', e?.message ?? e))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [placeId, meId]);

  // Người khác thêm / sửa / xoá đánh giá → danh sách và điểm sao tự cập nhật (không đụng vào ô đang gõ của mình)
  useEffect(() => {
    let active = true;
    const unsubscribe = subscribeToReviews(placeId, () => {
      fetchReviews(placeId)
        .then((list) => {
          if (!active) return;
          setReviews(list);
          const st = stats(list);
          onStatsChange?.(st.avg, st.count);
        })
        .catch(() => {});
    });
    return () => {
      active = false;
      unsubscribe();
    };
    // onStatsChange đổi mỗi lần render, chỉ cần đăng ký lại khi đổi quán
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placeId]);

  const save = async () => {
    if (rating < 1) {
      appAlert('Chưa chấm sao', 'Chọn từ 1 đến 5 sao nhé.');
      return;
    }
    setSaving(true);
    try {
      await saveReview(placeId, rating, comment);
      applyList(await fetchReviews(placeId));
      setEditing(false);
    } catch (e: any) {
      appAlert('Không lưu được đánh giá', e?.message ?? String(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = () =>
    appAlert('Xoá đánh giá của bạn?', undefined, [
      { text: 'Thôi', style: 'cancel' },
      {
        text: 'Xoá',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteMyReview(placeId);
            applyList(await fetchReviews(placeId));
            setRating(0);
            setComment('');
            setEditing(true);
          } catch (e: any) {
            appAlert('Không xoá được', e?.message ?? String(e));
          }
        },
      },
    ]);

  if (loading) return <ActivityIndicator color={colors.text} style={styles.loader} />;

  return (
    <View style={styles.wrap}>
      {/* Đánh giá của tôi */}
      {editing ? (
        <View style={styles.editor}>
          <View style={styles.editorHeader}>
            <Text style={styles.editorTitle}>{mine ? 'Sửa đánh giá' : 'Bạn thấy quán này thế nào?'}</Text>
            <StarRating value={rating} onChange={setRating} size={26} />
          </View>
          <TextInput
            style={styles.input}
            value={comment}
            onChangeText={setComment}
            placeholder="Món nào ngon, giá cả, phục vụ… (tuỳ chọn)"
            placeholderTextColor={colors.textMuted}
            maxLength={300}
            multiline
          />
          <View style={styles.editorActions}>
            {mine && (
              <Pressable style={styles.ghostBtn} onPress={() => setEditing(false)}>
                <Text style={styles.ghostText}>Huỷ</Text>
              </Pressable>
            )}
            <Pressable
              style={({ pressed }) => [styles.saveBtn, (pressed || saving) && styles.dim]}
              onPress={save}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color={colors.onAccent} />
              ) : (
                <Text style={styles.saveText}>Lưu đánh giá</Text>
              )}
            </Pressable>
          </View>
        </View>
      ) : (
        mine && (
          <ReviewRow
            review={mine}
            title="Đánh giá của bạn"
            actions={
              <View style={styles.rowActions}>
                <Pressable hitSlop={8} onPress={() => setEditing(true)}>
                  <Text style={styles.link}>Sửa</Text>
                </Pressable>
                <Pressable hitSlop={8} onPress={remove}>
                  <Text style={[styles.link, styles.linkDanger]}>Xoá</Text>
                </Pressable>
              </View>
            }
          />
        )
      )}

      {/* Đánh giá của mọi người */}
      {others.length > 0 && (
        <View style={styles.list}>
          <Text style={styles.sectionTitle}>Đánh giá ({others.length})</Text>
          {others.map((r) => (
            <ReviewRow key={r.id} review={r} />
          ))}
        </View>
      )}
      {others.length === 0 && !mine && !editing && (
        <Text style={styles.empty}>Chưa có đánh giá nào.</Text>
      )}
    </View>
  );
}

function ReviewRow({
  review,
  title,
  actions,
}: {
  review: Review;
  title?: string;
  actions?: React.ReactNode;
}) {
  const name = review.author?.display_name ?? 'Ai đó';
  return (
    <View style={styles.row}>
      <Avatar name={name} seed={review.author?.username ?? review.user_id} size={36} />
      <View style={styles.flex}>
        <View style={styles.rowHeader}>
          <Text style={styles.rowName} numberOfLines={1}>
            {title ?? name}
          </Text>
          <Text style={styles.rowTime}>{timeAgo(review.updated_at)}</Text>
          {actions}
        </View>
        <StarRating value={review.rating} size={14} />
        {review.comment ? <Text style={styles.comment}>{review.comment}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 16, paddingHorizontal: 16 },
  flex: { flex: 1, gap: 4 },
  loader: { marginVertical: 12 },
  editor: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 20, padding: 14, gap: 12 },
  editorHeader: { gap: 10 },
  editorTitle: { color: colors.text, fontWeight: '800', fontSize: 15 },
  input: {
    backgroundColor: colors.surfaceHigh,
    color: colors.text,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 10,
    minHeight: 64,
    fontSize: 14,
    textAlignVertical: 'top',
  },
  editorActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
  ghostBtn: { paddingHorizontal: 16, height: 40, justifyContent: 'center' },
  ghostText: { color: colors.textMuted, fontWeight: '700' },
  saveBtn: {
    backgroundColor: colors.accent,
    paddingHorizontal: 18,
    height: 40,
    borderRadius: radius.pill,
    justifyContent: 'center',
  },
  saveText: { color: colors.onAccent, fontWeight: '800' },
  dim: { opacity: 0.6 },
  list: { gap: 12 },
  sectionTitle: { color: colors.textMuted, fontWeight: '700', fontSize: 13, textTransform: 'uppercase' },
  row: { flexDirection: 'row', gap: 12 },
  rowHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowName: { color: colors.text, fontWeight: '700', fontSize: 14, flexShrink: 1 },
  rowTime: { color: colors.textMuted, fontSize: 12 },
  rowActions: { flexDirection: 'row', gap: 14, marginLeft: 'auto' },
  link: { color: colors.accent, fontWeight: '700', fontSize: 13 },
  linkDanger: { color: colors.danger },
  comment: { color: colors.text, fontSize: 14, lineHeight: 20 },
  empty: { color: colors.textMuted, fontSize: 14 },
});
