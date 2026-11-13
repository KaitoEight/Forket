import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { IconButton } from '@/components/IconButton';
import { ScreenHeader } from '@/components/SettingsUI';
import { colors, radius, statusBarStyle } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { openChatWith } from '@/services/chatService';
import {
  acceptFriendRequest,
  blockUser,
  fetchRelation,
  isBlockedBetween,
  removeFriendship,
  sendFriendRequest,
  type Relation,
} from '@/services/friendService';
import { timeAgo } from '@/services/postService';
import { fetchPostsOf, groupVisits, type VisitedPlace } from '@/services/profileService';
import { appAlert } from '@/lib/appAlert';
import { askReport } from '@/lib/report';
import { goBack } from '@/lib/navigation';

type UserInfo = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  share_activity: boolean;
};

async function fetchUser(id: string): Promise<UserInfo | null> {
  let res = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url, bio, share_activity')
    .eq('id', id)
    .maybeSingle();
  if (res.error?.code === '42703') {
    res = (await supabase
      .from('profiles')
      .select('id, username, display_name, avatar_url')
      .eq('id', id)
      .maybeSingle()) as typeof res;
  }
  if (res.error) throw res.error;
  const d = res.data as Partial<UserInfo> | null;
  return d ? ({ bio: null, share_activity: true, ...d } as UserInfo) : null;
}

export default function UserProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const meId = session?.user.id;

  const [user, setUser] = useState<UserInfo | null>(null);
  const [relation, setRelation] = useState<Relation>('none');
  const [friendshipId, setFriendshipId] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [visits, setVisits] = useState<VisitedPlace[]>([]);
  const [postCount, setPostCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    const [u, rel, blk, posts] = await Promise.allSettled([
      fetchUser(id),
      fetchRelation(id),
      isBlockedBetween(id),
      fetchPostsOf(id, 300),
    ]);
    if (u.status === 'fulfilled') setUser(u.value);
    if (rel.status === 'fulfilled') {
      setRelation(rel.value.relation);
      setFriendshipId(rel.value.friendshipId);
    }
    if (blk.status === 'fulfilled') setBlocked(blk.value);
    if (posts.status === 'fulfilled') {
      setVisits(groupVisits(posts.value));
      setPostCount(posts.value.length);
    }
  }, [id]);

  // Mỗi lần mở / quay lại trang → cập nhật (vừa kết bạn, vừa được chấp nhận…)
  useFocusEffect(
    useCallback(() => {
      // Mở trang của chính mình → về tab Hồ sơ
      if (id && id === meId) {
        router.replace('/profile');
        return;
      }
      let active = true;
      load().finally(() => active && setLoading(false));
      return () => {
        active = false;
      };
    }, [id, meId, load])
  );

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
      await load();
    } catch (e: any) {
      appAlert('Không thực hiện được', e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  const openMenu = () => {
    if (!user) return;
    appAlert(user.display_name, `@${user.username}`, [
      ...(relation === 'friends' && friendshipId
        ? [
            {
              text: 'Nhắn tin',
              icon: 'chatbubble-ellipses-outline' as const,
              onPress: () =>
                openChatWith(user.id).catch((e) => appAlert('Không mở được chat', e?.message ?? String(e))),
            },
            {
              text: 'Huỷ kết bạn',
              icon: 'person-remove-outline' as const,
              style: 'destructive' as const,
              onPress: () =>
                appAlert('Huỷ kết bạn?', `Bạn và ${user.display_name} sẽ không thấy ảnh của nhau nữa.`, [
                  { text: 'Thôi', style: 'cancel' },
                  { text: 'Huỷ kết bạn', style: 'destructive', onPress: () => run(() => removeFriendship(friendshipId)) },
                ]),
            },
          ]
        : []),
      {
        text: 'Báo cáo',
        icon: 'flag-outline' as const,
        onPress: () => askReport({ userId: user.id }, `@${user.username}`),
      },
      {
        text: 'Chặn',
        icon: 'ban-outline' as const,
        style: 'destructive' as const,
        onPress: () =>
          appAlert(
            `Chặn ${user.display_name}?`,
            'Hai bạn sẽ huỷ kết bạn, không tìm thấy nhau, không nhắn tin và không thêm nhau vào nhóm được.',
            [
              { text: 'Thôi', style: 'cancel' },
              {
                text: 'Chặn',
                style: 'destructive',
                onPress: () =>
                  run(async () => {
                    await blockUser(user.id);
                    goBack();
                  }),
              },
            ]
          ),
      },
      { text: 'Đóng', style: 'cancel' as const },
    ]);
  };

  if (loading) {
    return (
      <View style={[styles.screen, styles.centered]}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (!user || blocked) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
        <ScreenHeader title="Hồ sơ" />
        <View style={styles.centered}>
          <Text style={styles.muted}>Không xem được hồ sơ này.</Text>
        </View>
      </View>
    );
  }

  const isFriend = relation === 'friends';
  const canSeeActivity = isFriend && user.share_activity;

  const relationButton = () => {
    switch (relation) {
      case 'none':
        return (
          <ActionBtn icon="person-add" label="Kết bạn" primary busy={busy} onPress={() => run(() => sendFriendRequest(user.id))} />
        );
      case 'incoming':
        return (
          <ActionBtn
            icon="checkmark"
            label="Chấp nhận lời mời"
            primary
            busy={busy}
            onPress={() => run(() => acceptFriendRequest(friendshipId!))}
          />
        );
      case 'outgoing':
        return (
          <ActionBtn icon="time-outline" label="Huỷ lời mời" busy={busy} onPress={() => run(() => removeFriendship(friendshipId!))} />
        );
      case 'friends':
        return (
          <ActionBtn
            icon="chatbubble-ellipses"
            label="Nhắn tin"
            primary
            busy={busy}
            onPress={() =>
              openChatWith(user.id).catch((e) => appAlert('Không mở được chat', e?.message ?? String(e)))
            }
          />
        );
    }
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <StatusBar style={statusBarStyle} />
      <ScreenHeader
        title={`@${user.username}`}
        right={<IconButton icon="ellipsis-horizontal" label="Tuỳ chọn" onPress={openMenu} />}
      />

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
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
        <View style={styles.top}>
          <Avatar name={user.display_name} seed={user.username} uri={user.avatar_url} size={92} />
          <Text style={styles.name}>{user.display_name}</Text>
          {user.bio ? <Text style={styles.bio}>{user.bio}</Text> : null}
          {isFriend && (
            <View style={styles.friendChip}>
              <Ionicons name="people" size={13} color={colors.accent} />
              <Text style={styles.friendChipText}>Bạn bè</Text>
            </View>
          )}
        </View>

        {canSeeActivity && (
          <View style={styles.stats}>
            <Stat value={visits.length} label="Quán đã đi" />
            <Stat value={postCount} label="Món check-in" />
          </View>
        )}

        <View style={styles.actions}>{relationButton()}</View>

        {!isFriend ? (
          <Notice
            icon="lock-closed-outline"
            text={`Kết bạn với ${user.display_name} để xem các quán bạn ấy đã đi.`}
          />
        ) : !user.share_activity ? (
          <Notice icon="eye-off-outline" text={`${user.display_name} đang ở chế độ riêng tư.`} />
        ) : visits.length === 0 ? (
          <Notice icon="restaurant-outline" text="Chưa check-in quán nào." />
        ) : (
          <View style={styles.list}>
            <Text style={styles.sectionTitle}>Quán đã đi</Text>
            {visits.map((v) => (
              <Pressable
                key={v.id}
                style={({ pressed }) => [styles.placeRow, pressed && styles.pressed]}
                onPress={() =>
                  router.navigate({
                    pathname: '/',
                    params: { focusPlace: v.id, lat: String(v.lat), lng: String(v.lng) },
                  })
                }
              >
                <View style={styles.placeThumb}>
                  {v.cover ? (
                    <Image source={{ uri: v.cover }} style={StyleSheet.absoluteFill} contentFit="cover" />
                  ) : (
                    <Ionicons name="restaurant" size={20} color={colors.caramel} />
                  )}
                </View>
                <View style={styles.flex}>
                  <Text style={styles.placeName} numberOfLines={1}>
                    {v.name}
                  </Text>
                  <Text style={styles.muted} numberOfLines={1}>
                    {v.visits > 1 ? `Đã đi ${v.visits} lần · ` : ''}
                    {timeAgo(v.lastVisit)}
                  </Text>
                </View>
                <Ionicons name="map-outline" size={18} color={colors.textMuted} />
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function Notice({ icon, text }: { icon: React.ComponentProps<typeof Ionicons>['name']; text: string }) {
  return (
    <View style={styles.notice}>
      <Ionicons name={icon} size={28} color={colors.textMuted} />
      <Text style={styles.noticeText}>{text}</Text>
    </View>
  );
}

function ActionBtn({
  icon,
  label,
  primary,
  busy,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  primary?: boolean;
  busy?: boolean;
  onPress: () => void;
}) {
  const fg = primary ? colors.onAccent : colors.text;
  return (
    <Pressable
      style={({ pressed }) => [styles.actionBtn, primary && styles.actionPrimary, (pressed || busy) && styles.dim]}
      onPress={onPress}
      disabled={busy}
    >
      {busy ? <ActivityIndicator size="small" color={fg} /> : <Ionicons name={icon} size={18} color={fg} />}
      <Text style={[styles.actionText, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 },
  content: { padding: 16, gap: 18 },
  top: { alignItems: 'center', gap: 8 },
  name: { color: colors.text, fontSize: 24, fontWeight: '900', marginTop: 4 },
  bio: { color: colors.text, fontSize: 15, lineHeight: 21, textAlign: 'center', paddingHorizontal: 12 },
  friendChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.accentSoft,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  friendChipText: { color: colors.accent, fontWeight: '800', fontSize: 12 },
  stats: { flexDirection: 'row', gap: 10 },
  stat: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    paddingVertical: 12,
  },
  statValue: { color: colors.text, fontSize: 20, fontWeight: '900' },
  statLabel: { color: colors.textMuted, fontSize: 12, fontWeight: '600' },
  actions: { flexDirection: 'row', gap: 10 },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 48,
    borderRadius: 16,
    backgroundColor: colors.surfaceHigh,
  },
  actionPrimary: { backgroundColor: colors.accent },
  actionText: { fontWeight: '800', fontSize: 15 },
  dim: { opacity: 0.6 },
  notice: { alignItems: 'center', gap: 10, paddingVertical: 28, paddingHorizontal: 24 },
  noticeText: { color: colors.textMuted, fontSize: 14, textAlign: 'center', lineHeight: 20 },
  muted: { color: colors.textMuted, fontSize: 13 },
  list: { gap: 6 },
  sectionTitle: { color: colors.textMuted, fontWeight: '700', fontSize: 13, textTransform: 'uppercase' },
  placeRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, borderRadius: 14 },
  pressed: { backgroundColor: colors.surface },
  placeThumb: {
    width: 52,
    height: 52,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: colors.caramelSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeName: { color: colors.text, fontWeight: '800', fontSize: 15 },
});
